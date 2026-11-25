// Creative Tree (/tree/): the agency's canvas for creative work. Projects live in D1 as JSON, dropped files as BLOBs,
// and the page talks to Claude through /api/tree/ai (Anthropic API, pay per use). Agency members only.
import type { Hono } from 'hono';
import type { Env, SessionUser } from './auth';

const TABLES = [
  'CREATE TABLE IF NOT EXISTS tree_projects (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT \'\', upd INTEGER NOT NULL, data TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS tree_projects_org ON tree_projects(org_id, upd)',
  'CREATE TABLE IF NOT EXISTS tree_files (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT, type TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL)',
  // files bigger than one D1 value are stored in pieces
  'CREATE TABLE IF NOT EXISTS tree_chunks (file_id TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (file_id, n))',
];
let ready = false;
async function ensure(db: D1Database) {
  if (ready) return;
  await db.batch(TABLES.map((s) => db.prepare(s)));
  ready = true;
}

const MAX_PROJECT = 1_800_000; // D1 keeps a value up to ~2 MB
const MAX_FILE = 25_000_000;
const CHUNK = 1_500_000;
const PIECE = 512 * 1024; // bytes read from D1 per step when sending a file
const HEXV = new Uint8Array(128);
for (let i = 0; i < 10; i++) HEXV[48 + i] = i;
for (let i = 0; i < 6; i++) { HEXV[65 + i] = 10 + i; HEXV[97 + i] = 10 + i; }
function fromHex(t: string) {
  const out = new Uint8Array(t.length >> 1);
  for (let i = 0, j = 0; i < out.length; i++, j += 2) out[i] = (HEXV[t.charCodeAt(j)] << 4) | HEXV[t.charCodeAt(j + 1)];
  return out;
}
const FILE_TYPES = /^(image\/(png|jpeg|webp|gif|svg\+xml|avif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|wav|x-wav|wave|ogg|webm|aac|x-m4a|flac)|application\/pdf|text\/(plain|markdown|csv)|application\/json|font\/(woff2?|ttf|otf)|model\/[a-z0-9.+-]+|application\/(octet-stream|zip|x-zip-compressed|msword|vnd\.[a-z0-9.+-]+))$/;
const INLINE = /^(image\/(png|jpeg|webp|gif|avif)|video\/|audio\/|application\/pdf|text\/(plain|markdown|csv)|application\/json)/;
const MODELS: Record<string, string> = { quick: 'claude-haiku-5-5', complex: 'claude-opus-5-5', fable: 'claude-fable-5-2' };

type Vars = { user: SessionUser };

export function mountTree(app: Hono<{ Bindings: Env; Variables: Vars & any }>) {
  // every /tree route: signed-in agency member; projects are shared across the agency's org
  app.use('/tree/*', async (c, next) => {
    const orgId = Object.keys(c.get('user').orgRoles)[0];
    if (!orgId) return c.json({ error: 'Agency only' }, 403);
    await ensure(c.env.DB);
    c.set('orgId', orgId);
    return next();
  });

  app.get('/tree/projects', async (c) => {
    const r = await c.env.DB.prepare('SELECT id, name, upd FROM tree_projects WHERE org_id = ? ORDER BY upd DESC').bind(c.get('orgId')).all();
    return c.json(r.results);
  });

  app.get('/tree/projects/:id', async (c) => {
    const r = await c.env.DB.prepare('SELECT name, upd, data FROM tree_projects WHERE id = ? AND org_id = ?').bind(c.req.param('id'), c.get('orgId')).first<{ name: string; upd: number; data: string }>();
    if (!r) return c.json(null, 404);
    return c.json({ name: r.name, upd: r.upd, data: JSON.parse(r.data) });
  });

  app.put('/tree/projects/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[a-z0-9_-]{4,40}$/i.test(id)) return c.json({ error: 'Bad id' }, 400);
    const raw = await c.req.text();
    if (raw.length > MAX_PROJECT) return c.json({ error: 'Project is too large', code: 'quota_exceeded' }, 413);
    const b = JSON.parse(raw) as { name?: string; upd?: number; data?: unknown };
    const own = await c.env.DB.prepare('SELECT org_id FROM tree_projects WHERE id = ?').bind(id).first<{ org_id: string }>();
    if (own && own.org_id !== c.get('orgId')) return c.json({ error: 'Not found' }, 404);
    await c.env.DB.prepare('INSERT INTO tree_projects (id, org_id, name, upd, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, upd = excluded.upd, data = excluded.data')
      .bind(id, c.get('orgId'), String(b.name || '').slice(0, 200), Number(b.upd) || Date.now(), JSON.stringify(b.data ?? {})).run();
    return c.json({ ok: true });
  });

  app.delete('/tree/projects/:id', async (c) => {
    await c.env.DB.prepare('DELETE FROM tree_projects WHERE id = ? AND org_id = ?').bind(c.req.param('id'), c.get('orgId')).run();
    return c.json({ ok: true });
  });

  app.post('/tree/files', async (c) => {
    const type = (c.req.header('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!FILE_TYPES.test(type)) return c.json({ error: 'This file type is not kept here' }, 415);
    const buf = await c.req.arrayBuffer();
    if (buf.byteLength > MAX_FILE) return c.json({ error: 'Files up to 25 MB; add bigger ones as links', code: 'too_large' }, 413);
    const id = crypto.randomUUID().replace(/-/g, '');
    const name = decodeURIComponent(c.req.header('x-name') || '').slice(0, 200);
    const all = new Uint8Array(buf);
    const small = all.byteLength <= CHUNK;
    if (!small) {
      for (let i = 0, n = 0; i < all.byteLength; i += CHUNK, n++)
        await c.env.DB.prepare('INSERT INTO tree_chunks (file_id, n, data) VALUES (?, ?, ?)').bind(id, n, all.slice(i, i + CHUNK)).run();
    }
    await c.env.DB.prepare('INSERT INTO tree_files (id, org_id, name, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, c.get('orgId'), name, type, small ? all : new Uint8Array(0), Date.now()).run();
    return c.json({ id, url: `/api/tree/files/${id}` });
  });

  // Files are sent as a stream, half a megabyte at a time, and answer Range requests, so a page that asks for
  // many images and videos at once (a refresh) never holds whole files in the Worker's memory.
  app.get('/tree/files/:id', async (c) => {
    const id = c.req.param('id');
    const db = c.env.DB;
    const r = await db.prepare('SELECT type, length(data) AS len FROM tree_files WHERE id = ? AND org_id = ?').bind(id, c.get('orgId')).first<{ type: string; len: number }>();
    if (!r) return c.body(null, 404);
    // where the bytes live: in the row itself (small files) or in numbered pieces
    let parts: { n: number | null; len: number }[];
    if (r.len > 0) parts = [{ n: null, len: r.len }];
    else parts = (await db.prepare('SELECT n, length(data) AS len FROM tree_chunks WHERE file_id = ? ORDER BY n').bind(id).all<{ n: number; len: number }>()).results;
    const size = parts.reduce((s, p) => s + p.len, 0);

    const h: Record<string, string> = { 'content-type': r.type, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' };
    // SVG can carry script: lock it down; anything not viewable inline downloads instead
    if (r.type === 'image/svg+xml') h['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    else if (!INLINE.test(r.type)) h['content-disposition'] = 'attachment';

    let start = 0, end = size - 1, status = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec((c.req.header('range') || '').trim());
    if (m && (m[1] || m[2])) {
      if (!m[1]) start = Math.max(0, size - Number(m[2]));
      else { start = Number(m[1]); if (m[2]) end = Math.min(size - 1, Number(m[2])); }
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      status = 206;
      h['content-range'] = `bytes ${start}-${end}/${size}`;
    }
    const length = size ? end - start + 1 : 0;
    h['content-length'] = String(length);
    if (!length || c.req.method === 'HEAD') return new Response(null, { status, headers: h });

    const reads: { n: number | null; off: number; len: number }[] = [];
    let base = 0;
    for (const p of parts) {
      const a = Math.max(start, base), b = Math.min(end, base + p.len - 1);
      for (let x = a; x <= b; x += PIECE) reads.push({ n: p.n, off: x - base, len: Math.min(PIECE, b - x + 1) });
      base += p.len;
    }
    let i = 0;
    const source = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        if (i >= reads.length) return ctrl.close();
        const q = reads[i++];
        const row = q.n === null
          ? await db.prepare('SELECT hex(substr(data, ?, ?)) AS h FROM tree_files WHERE id = ?').bind(q.off + 1, q.len, id).first<{ h: string }>()
          : await db.prepare('SELECT hex(substr(data, ?, ?)) AS h FROM tree_chunks WHERE file_id = ? AND n = ?').bind(q.off + 1, q.len, id, q.n).first<{ h: string }>();
        if (!row) return ctrl.error(new Error('missing piece'));
        ctrl.enqueue(fromHex(row.h));
      },
    }, { highWaterMark: 0 });
    const FLS = (globalThis as any).FixedLengthStream;
    if (FLS) {
      const fixed = new FLS(length);
      source.pipeTo(fixed.writable).catch(() => {});
      return new Response(fixed.readable, { status, headers: h });
    }
    return new Response(source, { status, headers: h });
  });

  // Title, preview image and icon of a page, for link nodes. Cached at the edge for a day.
  app.get('/tree/meta', async (c) => {
    let url: URL;
    try { url = new URL(c.req.query('u') || ''); if (url.protocol !== 'https:') throw new Error(); } catch { return c.json({ error: 'Bad link' }, 400); }
    const cache = (globalThis as any).caches?.default as Cache | undefined;
    const key = new Request(`https://meta.metabrand-os/${encodeURIComponent(url.toString())}`);
    const hit = await cache?.match(key).catch(() => undefined);
    if (hit) return hit;
    const out: { title: string; image: string; icon: string } = { title: '', image: '', icon: '' };
    const r = await fetch(url.toString(), { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; MetabrandOS/1.0; +https://metabrand.digital)', accept: 'text/html' }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (r && r.ok && /html/i.test(r.headers.get('content-type') || '')) {
      const html = (await r.text()).slice(0, 300000);
      const attr = (tag: string, name: string) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || '';
      const metaOf = (k: string) => { for (const t of html.match(/<meta\b[^>]*>/gi) || []) { const p = (attr(t, 'property') || attr(t, 'name')).toLowerCase(); if (p === k) return attr(t, 'content'); } return ''; };
      const dec = (x: string) => x.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      const abs = (x: string) => { try { const v = new URL(dec(x), r.url || url); return v.protocol === 'https:' ? v.toString() : ''; } catch { return ''; } };
      out.title = dec(metaOf('og:title') || metaOf('twitter:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '').slice(0, 200);
      const img = metaOf('og:image') || metaOf('twitter:image');
      if (img) out.image = abs(img);
      for (const t of html.match(/<link\b[^>]*>/gi) || []) { const rel = attr(t, 'rel').toLowerCase(); if (/(^|\s)(icon|apple-touch-icon)(\s|$)/.test(rel) && attr(t, 'href')) { out.icon = abs(attr(t, 'href')); if (/apple/.test(rel)) break; } }
      if (!out.icon) out.icon = `${url.origin}/favicon.ico`;
    }
    const res = c.json(out, 200, { 'cache-control': 'private, max-age=86400' });
    if (cache && out.title) { const put = cache.put(key, res.clone()).catch(() => {}); try { c.executionCtx.waitUntil(put); } catch { await put; } }
    return res;
  });

  // ---------- Figma: read-only, with the agency's token (FIGMA_TOKEN). Figma's API cannot write into files.
  const figmaRef = (u: string) => {
    let x: URL;
    try { x = new URL(u); } catch { return null; }
    if (!/(^|\.)figma\.com$/.test(x.hostname)) return null;
    const m = x.pathname.match(/^\/(?:file|design|board|proto|slides|deck)\/([A-Za-z0-9]+)(?:\/[^/]*)?(?:\/branch\/([A-Za-z0-9]+))?/);
    if (!m) return null;
    const node = (x.searchParams.get('node-id') || '').replace(/-/g, ':');
    return { key: m[2] || m[1], node: /^\d+:\d+$/.test(node) ? node : '', base: `${x.origin}${x.pathname}` };
  };
  const figma = async (env: Env, path: string) => {
    const r = await fetch('https://api.figma.com/v1/' + path, { headers: { 'X-Figma-Token': env.FIGMA_TOKEN || '' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Object.assign(new Error(r.status === 403 || r.status === 404 ? 'No access to this Figma file with the agency token' : `Figma error ${r.status}`), { status: r.status });
    return r.json() as Promise<any>;
  };
  const edge = (globalThis as any).caches?.default as Cache | undefined;
  const cached = async (c: any, key: string, ttl: number, make: () => Promise<Response>) => {
    const k = new Request(`https://figma.metabrand-os/${encodeURIComponent(c.get('orgId'))}/${key}`);
    const hit = await edge?.match(k).catch(() => undefined);
    if (hit) return hit;
    const res = await make();
    if (edge && res.status < 400) { const copy = new Response(res.clone().body, res); copy.headers.set('cache-control', `private, max-age=${ttl}`); const put = edge.put(k, copy).catch(() => {}); try { c.executionCtx.waitUntil(put); } catch { await put; } }
    return res;
  };
  const figmaGate = (c: any) => {
    if (!c.env.FIGMA_TOKEN) return { err: c.json({ error: 'Figma is not connected yet', code: 'not_connected' }, 409) };
    const ref = figmaRef(c.req.query('u') || '');
    if (!ref) return { err: c.json({ error: 'Not a Figma file link' }, 400) };
    return { ref };
  };

  app.get('/tree/figma/meta', async (c) => {
    const g = figmaGate(c); if (g.err) return g.err; const ref = g.ref!;
    try {
      return await cached(c, `meta/${ref.key}/${ref.node}`, 600, async () => {
        if (ref.node) {
          const d = await figma(c.env, `files/${ref.key}/nodes?ids=${encodeURIComponent(ref.node)}&depth=1`);
          const doc = d.nodes?.[ref.node]?.document;
          return c.json({ title: doc?.name || d.name || '', file: d.name || '', type: doc?.type || '' });
        }
        const d = await figma(c.env, `files/${ref.key}?depth=1`);
        return c.json({ title: d.name || '', file: d.name || '', type: 'FILE' });
      });
    } catch (e: any) { return c.json({ error: e.message }, e.status === 403 || e.status === 404 ? 403 : 502); }
  });

  // a fresh render of the frame (Figma's image links expire), or the file thumbnail
  app.get('/tree/figma/img', async (c) => {
    const g = figmaGate(c); if (g.err) return g.err; const ref = g.ref!;
    try {
      return await cached(c, `img/${ref.key}/${ref.node}`, 3600, async () => {
        let url = '';
        if (ref.node) {
          const d = await figma(c.env, `images/${ref.key}?ids=${encodeURIComponent(ref.node)}&format=png&scale=0.5`);
          url = d.images?.[ref.node] || '';
        }
        if (!url) { const f = await figma(c.env, `files/${ref.key}?depth=1`); url = f.thumbnailUrl || ''; }
        if (!url) return c.body(null, 404);
        const img = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!img.ok) return c.body(null, 502);
        return new Response(img.body, { headers: { 'content-type': img.headers.get('content-type') || 'image/png', 'cache-control': 'private, max-age=3600' } });
      });
    } catch (e: any) { return c.body(null, e.status === 403 || e.status === 404 ? 403 : 502); }
  });

  // the top-level frames of the linked page (or of the first page)
  app.get('/tree/figma/frames', async (c) => {
    const g = figmaGate(c); if (g.err) return g.err; const ref = g.ref!;
    try {
      let page = ref.node, pageName = '';
      if (page) {
        const d = await figma(c.env, `files/${ref.key}/nodes?ids=${encodeURIComponent(page)}&depth=1`);
        const doc = d.nodes?.[page]?.document;
        if (doc && doc.type !== 'CANVAS' && doc.type !== 'SECTION') return c.json({ page: doc.name, frames: [{ id: page, name: doc.name, url: `${ref.base}?node-id=${page.replace(':', '-')}` }] });
        pageName = doc?.name || '';
        var kids: any[] = doc?.children || [];
      } else {
        const f = await figma(c.env, `files/${ref.key}?depth=2`);
        const first = (f.document?.children || [])[0];
        pageName = first?.name || ''; var kids: any[] = first?.children || [];
      }
      const frames = kids.filter((k) => ['FRAME', 'SECTION', 'COMPONENT', 'COMPONENT_SET', 'GROUP'].includes(k.type)).slice(0, 40)
        .map((k) => ({ id: k.id, name: k.name, url: `${ref.base}?node-id=${String(k.id).replace(':', '-')}` }));
      return c.json({ page: pageName, frames });
    } catch (e: any) { return c.json({ error: e.message }, e.status === 403 || e.status === 404 ? 403 : 502); }
  });

  // ---------- Notion: pages shared with the agency's Notion connection (NOTION_TOKEN), read as text
  app.get('/tree/notion', async (c) => {
    if (!c.env.NOTION_TOKEN) return c.json({ error: 'Notion is not connected yet', code: 'not_connected' }, 409);
    let u: URL;
    try { u = new URL(c.req.query('u') || ''); } catch { return c.json({ error: 'Bad link' }, 400); }
    if (!/(^|\.)notion\.(so|site)$/.test(u.hostname)) return c.json({ error: 'Not a Notion link' }, 400);
    const hex = (u.pathname.replace(/-/g, '').match(/[0-9a-f]{32}/gi) || []).pop() || (u.searchParams.get('p') || '').replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(hex)) return c.json({ error: 'This Notion link has no page id; copy the link from the page itself', code: 'no_id' }, 400);
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const api = async (path: string) => {
      const r = await fetch('https://api.notion.com/v1/' + path, { headers: { Authorization: `Bearer ${c.env.NOTION_TOKEN}`, 'Notion-Version': '2026-03-11' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw Object.assign(new Error(r.status === 404 || r.status === 403 ? 'This page is not shared with the Metabrand connection in Notion' : `Notion error ${r.status}`), { status: r.status });
      return r.json() as Promise<any>;
    };
    try {
      return await cached(c, `notion/${hex}`, 600, async () => {
        const page = await api(`pages/${id}`);
        const tp: any = Object.values(page.properties || {}).find((p: any) => p && p.type === 'title');
        const title = (tp?.title || []).map((t: any) => t.plain_text).join('').trim();
        const out: string[] = []; const images: string[] = []; let count = 0;
        const rich = (b: any) => (b?.rich_text || []).map((t: any) => t.plain_text).join('');
        const walk = async (bid: string, depth: number) => {
          let cursor: string | undefined;
          do {
            const d = await api(`blocks/${bid}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
            for (const b of d.results || []) {
              if (++count > 600) return;
              const v = b[b.type] || {}; const pad = '  '.repeat(depth);
              const line = ({
                heading_1: () => `# ${rich(v)}`, heading_2: () => `## ${rich(v)}`, heading_3: () => `### ${rich(v)}`,
                paragraph: () => rich(v), quote: () => `> ${rich(v)}`, callout: () => `> ${rich(v)}`,
                bulleted_list_item: () => `${pad}- ${rich(v)}`, numbered_list_item: () => `${pad}1. ${rich(v)}`,
                to_do: () => `${pad}- [${v.checked ? 'x' : ' '}] ${rich(v)}`, toggle: () => `${pad}- ${rich(v)}`,
                code: () => '```\n' + rich(v) + '\n```', divider: () => '---', child_page: () => `## ${v.title || ''}`,
                bookmark: () => v.url || '', link_preview: () => v.url || '', embed: () => v.url || '', equation: () => v.expression || '',
                image: () => { const src = v.file?.url || v.external?.url; if (src && images.length < 8) images.push(src); return `[image${(v.caption || []).length ? ': ' + v.caption.map((t: any) => t.plain_text).join('') : ''}]`; },
                table_row: () => '| ' + (v.cells || []).map((cell: any[]) => cell.map((t) => t.plain_text).join('')).join(' | ') + ' |',
              } as Record<string, () => string>)[b.type];
              if (line) out.push(line());
              if (b.has_children && depth < 3 && b.type !== 'child_page' && b.type !== 'child_database') await walk(b.id, depth + 1);
            }
            cursor = d.has_more ? d.next_cursor : undefined;
          } while (cursor);
        };
        await walk(id, 0);
        const text = out.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 60000);
        return c.json({ title, text, image: images[0] || '', images });
      });
    } catch (e: any) { return c.json({ error: e.message, code: e.status === 404 || e.status === 403 ? 'not_shared' : 'failed' }, e.status === 404 || e.status === 403 ? 403 : 502); }
  });

  // One turn of the Messages API. The page runs the tool loop itself, so tools act on the canvas in the browser.
  app.post('/tree/ai', async (c) => {
    if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: 'AI is not configured: add ANTHROPIC_API_KEY', code: 'sampling_disabled' }, 503);
    const b = await c.req.json<{ system?: string; messages: any[]; tools?: any[]; tier?: string; max_tokens?: number }>();
    if (!Array.isArray(b.messages) || !b.messages.length) return c.json({ error: 'No messages' }, 400);
    const model = MODELS[b.tier || ''] || c.env.MODEL || 'claude-sonnet-5-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': c.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(Number(b.max_tokens) || 8000, 16000),
        ...(b.system ? { system: String(b.system).slice(0, 20000) } : {}),
        ...(Array.isArray(b.tools) && b.tools.length ? { tools: b.tools.slice(0, 12) } : {}),
        messages: b.messages,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      const code = res.status === 429 ? 'rate_limited' : res.status === 401 || res.status === 403 ? 'sampling_disabled' : 'ai_error';
      return c.json({ error: `AI error ${res.status}: ${err.slice(0, 200)}`, code }, res.status === 429 ? 429 : 502);
    }
    const out: any = await res.json();
    const units = (out.usage?.input_tokens || 0) + (out.usage?.output_tokens || 0);
    await c.env.DB.prepare('INSERT INTO usage (id, workspace_id, provider, units, created_at) VALUES (?, NULL, ?, ?, ?)').bind(crypto.randomUUID(), 'anthropic:tree', units, Date.now()).run().catch(() => {});
    return c.json({ content: out.content || [], stop_reason: out.stop_reason, model });
  });
}
