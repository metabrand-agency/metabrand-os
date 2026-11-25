// Creative Tree on Metabrand OS: gives the canvas the same small API it has as a Claude artifact
// (db, assets, sample, dictation), backed by /api/tree/* (D1 + Anthropic API) and the browser's speech recognition.
(function () {
  if (window.claude && window.claude.use) return;
  window.CT_BLOB = '/api/tree/files/';
  window.CT_SHOT = '/api/shot?u=';
  window.CT_META = '/api/tree/meta?u=';
  window.CT_FIGMA = '/api/tree/figma/';
  window.CT_NOTION = '/api/tree/notion?u=';
  window.CT_PDF = '/tree/vendor/';
  window.CT_MODELS = [['quick', 'Claude Haiku'], ['default', 'Claude Sonnet'], ['complex', 'Claude Opus'], ['fable', 'Claude Fable']];

  const err = (code, text) => Object.assign(new Error(text || code), { code });
  async function call(path, opt) {
    const r = await fetch('/api/tree' + path, Object.assign({ credentials: 'same-origin' }, opt));
    if (r.status === 401) { signIn(); throw err('not_granted'); }
    if (!r.ok) {
      let j = null; try { j = await r.json(); } catch (_) {}
      throw err((j && j.code) || (r.status === 429 ? 'rate_limited' : r.status === 403 ? 'not_granted' : 'failed'), j && j.error);
    }
    return r;
  }
  let shown = false;
  function signIn() {
    if (shown) return; shown = true;
    const d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:50;background:#1c1b19;color:#f7f5f1;padding:10px 16px;border-radius:8px;font:13.5px/1.4 Inter,system-ui,sans-serif';
    d.innerHTML = 'Sign in to Metabrand OS to save and use AI. <a href="/login" style="color:#f7f5f1;font-weight:500">Sign in</a>';
    document.body.appendChild(d);
  }

  // ---- db: the two shapes Creative Tree uses (projects/<id> docs and the projects collection)
  const db = {
    doc(path) {
      const id = String(path).replace(/^projects\//, '');
      return {
        async get() {
          const r = await fetch('/api/tree/projects/' + encodeURIComponent(id), { credentials: 'same-origin' });
          if (r.status === 404) return { exists: false, data: () => undefined };
          if (r.status === 401) { signIn(); throw err('not_granted'); }
          if (!r.ok) throw err('failed');
          const v = await r.json();
          return { exists: !!v, data: () => v };
        },
        async set(v) {
          await call('/projects/' + encodeURIComponent(id), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });
        },
        async delete() { await call('/projects/' + encodeURIComponent(id), { method: 'DELETE' }); },
      };
    },
    collection() {
      return {
        async get() {
          const rows = await (await call('/projects')).json();
          return { docs: rows.map((r) => ({ id: r.id, data: () => ({ name: r.name, upd: r.upd }) })) };
        },
      };
    },
  };

  // ---- assets: files up to 25 MB stored in D1
  const assets = {
    async upload(file) {
      const r = await call('/files', { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-name': encodeURIComponent(file.name || '') }, body: file });
      return r.json();
    },
  };

  // ---- sample: Claude through /api/tree/ai, with the tool loop run here so tools change the canvas
  const TIERS = ['quick', 'default', 'complex', 'fable'];
  const b64 = (blob) => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = rej; f.readAsDataURL(blob); });
  async function toMessages(input, images, documents, knowledge) {
    const msgs = typeof input === 'string' ? [{ role: 'user', content: input }] : input.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
    // the project memory goes first and is cached: the next requests within a few minutes read it at a tenth of the price
    if (knowledge) {
      const first = msgs.findIndex((m) => m.role === 'user');
      const rest = typeof msgs[first].content === 'string' ? [{ type: 'text', text: msgs[first].content }] : msgs[first].content;
      msgs[first] = { role: 'user', content: [{ type: 'text', text: String(knowledge), cache_control: { type: 'ephemeral' } }, ...rest] };
    }
    if ((images && images.length) || (documents && documents.length)) {
      const last = msgs.map((m) => m.role).lastIndexOf('user');
      const blocks = [];
      for (const d of (documents || []).slice(0, 3)) blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await b64(d) } });
      for (const im of (images || []).slice(0, 8)) blocks.push({ type: 'image', source: { type: 'base64', media_type: im.type, data: await b64(im) } });
      // the attachments are sent again on every step of a tool loop: cache them so they are read once
      blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
      const cur = typeof msgs[last].content === 'string' ? [{ type: 'text', text: msgs[last].content }] : msgs[last].content;
      const head = cur.length > 1 ? cur.slice(0, -1) : [];
      msgs[last] = { role: 'user', content: [...head, ...blocks, cur[cur.length - 1]] };
    }
    return msgs;
  }
  async function sample(input, opts) {
    opts = opts || {};
    const tier = TIERS.includes(opts.modelTier) ? opts.modelTier : 'default';
    const tools = Array.isArray(opts.tools) ? opts.tools : [];
    const defs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
    const messages = await toMessages(input, opts.images, opts.documents, opts.knowledge);
    let text = '';
    for (let i = 0; i < 10; i++) {
      let r;
      try {
        r = await call('/ai', { method: 'POST', signal: opts.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, tools: defs, tier, max_tokens: opts.maxTokens, web: !!opts.web }) });
      } catch (e) {
        if (e && e.name === 'AbortError') throw err('cancelled');
        throw e;
      }
      const out = await r.json();
      // cited answers come as many text pieces of one sentence: join them as written, with a break only where a search sat between them
      let said = '', gap = false;
      for (const b of out.content || []) { if (b.type !== 'text') { gap = true; continue; } said += (gap && said ? '\n\n' : '') + b.text; gap = false; }
      said = said.trim();
      if (said) { text = text ? text + '\n' + said : said; if (opts.onText) try { opts.onText({ text }); } catch (_) {} }
      // a long web search can pause the turn: send it back as it is and the API carries on
      if (out.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: out.content }); continue; }
      const uses = (out.content || []).filter((b) => b.type === 'tool_use');
      if (out.stop_reason !== 'tool_use' || !uses.length) return { text };
      messages.push({ role: 'assistant', content: out.content });
      const results = [];
      for (const u of uses) {
        const t = tools.find((x) => x.name === u.name);
        try {
          const v = t ? await t.execute(u.input || {}) : (() => { throw new Error('unknown tool'); })();
          results.push({ type: 'tool_result', tool_use_id: u.id, content: typeof v === 'string' ? v : JSON.stringify(v ?? 'ok') });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: String((e && e.message) || e) });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    return { text };
  }
  sample.json = async function (input, opts) {
    const ask = typeof input === 'string' ? input + '\n\nReply with only valid JSON, no prose and no code fences.' : input;
    const { text } = await sample(ask, Object.assign({}, opts, { tools: undefined, web: false }));
    const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (_) {}
    const m = t.match(/[\[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
    throw err('invalid_json');
  };
  sample.limits = async () => ({ images: { maxCount: 8, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] }, documents: { maxCount: 3, mediaTypes: ['application/pdf'] }, tools: true });

  // ---- dictation: the browser's own speech recognition (Chrome, Edge, Safari)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let dictation = null;
  if (SR) {
    const cb = { final: null, partial: null, state: null };
    let rec = null;
    const emit = (k, v) => { try { cb[k] && cb[k](v); } catch (_) {} };
    dictation = {
      onFinal(f) { cb.final = f; }, onPartial(f) { cb.partial = f; }, onState(f) { cb.state = f; },
      start() {
        return new Promise((resolve, reject) => {
          rec = new SR();
          rec.continuous = true; rec.interimResults = true; rec.lang = navigator.language || 'en-US';
          let started = false;
          rec.onstart = () => { started = true; emit('state', { state: 'listening' }); resolve(); };
          rec.onresult = (e) => {
            let part = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const r = e.results[i];
              if (r.isFinal) emit('final', { text: r[0].transcript.trim() }); else part += r[0].transcript;
            }
            if (part) emit('partial', { text: part });
          };
          rec.onerror = (e) => { if (!started) reject(err(e.error === 'not-allowed' ? 'not_granted' : 'failed')); };
          rec.onend = () => { rec = null; emit('state', { state: 'idle' }); };
          try { rec.start(); } catch (e) { reject(err('failed')); }
        });
      },
      async stop() { if (rec) rec.stop(); },
    };
  }

  const caps = { db, assets, sample, dictation };
  window.claude = { use: (name) => (caps[name] ? Promise.resolve(caps[name]) : Promise.reject(err('unknown'))) };
})();
