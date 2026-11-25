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
const u8 = (d: ArrayBuffer | number[] | Uint8Array) => (d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d));
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

  app.get('/tree/files/:id', async (c) => {
    const id = c.req.param('id');
    const r = await c.env.DB.prepare('SELECT type, data FROM tree_files WHERE id = ? AND org_id = ?').bind(id, c.get('orgId')).first<{ type: string; data: ArrayBuffer | number[] }>();
    if (!r) return c.body(null, 404);
    let bytes = u8(r.data);
    if (!bytes.byteLength) {
      const list: Uint8Array[] = [];
      for (let n = 0; ; n++) {
        const p = await c.env.DB.prepare('SELECT data FROM tree_chunks WHERE file_id = ? AND n = ?').bind(id, n).first<{ data: ArrayBuffer | number[] }>();
        if (!p) break;
        list.push(u8(p.data));
      }
      const out = new Uint8Array(list.reduce((s, p) => s + p.byteLength, 0));
      let at = 0;
      for (const p of list) { out.set(p, at); at += p.byteLength; }
      bytes = out;
    }
    const h: Record<string, string> = { 'content-type': r.type, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' };
    // SVG can carry script: lock it down; anything not viewable inline downloads instead
    if (r.type === 'image/svg+xml') h['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    else if (!INLINE.test(r.type)) h['content-disposition'] = 'attachment';
    return new Response(bytes as unknown as BodyInit, { headers: h });
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
