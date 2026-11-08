import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SCHEMA } from './schema';
import { Env, SessionUser, Access, makeSession, readSession, loadUser, accessFor, uid, newCode, hashCode } from './auth';
import { chat } from './chat';
import { aiLenses } from './lenses';
import { researchCompany } from './companies';
import { reviewAgainstMemory } from './brief';
import { applyDemoPatch } from './demo';
import { loadSeo } from './seo';
import { refreshOne, focusIds, ogImage } from './radar';
import { SUPERPLANE_KIT } from './kits/superplane';
import superplaneMarket from '../../data/superplane/market.json';

type Vars = { user: SessionUser; ws: any; access: Access };
const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api');
const COOKIE = 'mos_session';

async function ensureSchema(db: D1Database) {
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
}

app.onError((err, c) => c.json({ error: err.message }, 500));

// ---------- setup & auth ----------

app.get('/health', (c) => c.json({ ok: true, ai: Boolean(c.env.ANTHROPIC_API_KEY), apollo: Boolean(c.env.APOLLO_API_KEY), ahrefs: Boolean(c.env.AHREFS_API_KEY) }));

app.post('/setup', async (c) => {
  const { email, code } = await c.req.json<{ email: string; code: string }>();
  if (!c.env.ACCESS_CODE || code !== c.env.ACCESS_CODE) return c.json({ error: 'Wrong access code' }, 403);
  await ensureSchema(c.env.DB);
  const exists = await c.env.DB.prepare('SELECT id FROM orgs LIMIT 1').first();
  if (exists) return c.json({ error: 'Already set up' }, 409);
  const now = Date.now();
  const orgId = 'org_metabrand';
  const userId = uid('u_');
  const wsId = uid('w_');
  const m: any = applyDemoPatch(superplaneMarket) || superplaneMarket;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO orgs (id, name, slug, created_at) VALUES (?, ?, ?, ?)').bind(orgId, 'Metabrand', 'metabrand', now),
    c.env.DB.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(userId, email.toLowerCase().trim(), null, now),
    c.env.DB.prepare('INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)').bind(orgId, userId, 'agency_admin'),
    c.env.DB.prepare('INSERT INTO workspaces (id, org_id, slug, name, client_url, category_description, stage, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(wsId, orgId, 'superplane', 'SuperPlane', m.client.url, 'Open-source AI software factory: coding agents take routine engineering work from backlog issue to verified, review-ready pull request.', 'launched', JSON.stringify({ demo: true }), now),
    c.env.DB.prepare('INSERT INTO research (workspace_id, kind, data_json, status, updated_at) VALUES (?, ?, ?, ?, ?)').bind(wsId, 'market_map', JSON.stringify(m), 'published', now),
    c.env.DB.prepare('INSERT INTO assets (id, workspace_id, kind, title, url, meta_json, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid('a_'), wsId, 'website', 'superplane.com', 'https://superplane.com', '{}', 'client', now),
    c.env.DB.prepare('INSERT INTO assets (id, workspace_id, kind, title, url, meta_json, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid('a_'), wsId, 'github_repo', 'Generative arrows engine', 'https://github.com/metabrand-agency/superplane', '{"note":"served via jsDelivr"}', 'internal', now),
    c.env.DB.prepare('INSERT INTO activities (id, workspace_id, kind, title, happened_at, visibility) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(uid('t_'), wsId, 'research', 'Initial market map: 23 companies, 31 sources', now, 'client'),
  ]);
  const token = await makeSession(c.env.SESSION_SECRET, userId);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 30 * 86400 });
  return c.json({ ok: true });
});

app.post('/auth/login', async (c) => {
  const { email, code } = await c.req.json<{ email: string; code: string }>();
  await ensureSchema(c.env.DB);
  const fail = () => c.json({ error: 'Wrong email or code' }, 403);
  const u = await c.env.DB.prepare('SELECT id, code_hash FROM users WHERE email = ?').bind(String(email).toLowerCase().trim()).first<{ id: string; code_hash: string | null }>();
  if (!u) return fail();
  // agency people sign in with the agency ACCESS_CODE; clients with their personal code
  const isAgency = await c.env.DB.prepare('SELECT 1 FROM org_members WHERE user_id = ?').bind(u.id).first();
  const ok = isAgency
    ? Boolean(c.env.ACCESS_CODE) && code === c.env.ACCESS_CODE
    : Boolean(u.code_hash) && (await hashCode(c.env.SESSION_SECRET, code)) === u.code_hash;
  if (!ok) return fail();
  const token = await makeSession(c.env.SESSION_SECRET, u.id);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 30 * 86400 });
  return c.json({ ok: true });
});

app.post('/auth/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/setup/status', async (c) => {
  try {
    const exists = await c.env.DB.prepare('SELECT id FROM orgs LIMIT 1').first();
    return c.json({ setup: Boolean(exists) });
  } catch {
    return c.json({ setup: false });
  }
});

// ---------- authenticated ----------

app.use('/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/auth') || path.startsWith('/api/setup') || path === '/api/health') return next();
  const userId = await readSession(c.env.SESSION_SECRET, getCookie(c, COOKIE));
  const user = userId ? await loadUser(c.env.DB, userId) : null;
  if (!user) return c.json({ error: 'Not signed in' }, 401);
  c.set('user', user);
  return next();
});

// Preview image of a page (og:image) for thumbnails in PR Monitor; cached for a week at the edge.
app.get('/og', async (c) => {
  let url: URL;
  try { url = new URL(c.req.query('u') || ''); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { return c.body(null, 400); }
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const key = new Request(`https://og.metabrand-os/${encodeURIComponent(url.toString())}`);
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return hit;
  const img = await ogImage(url.toString()).catch(() => null);
  const res = img
    ? new Response(null, { status: 302, headers: { location: img, 'cache-control': 'public, max-age=604800' } })
    : new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=86400' } });
  if (cache) { const put = cache.put(key, res.clone()).catch(() => {}); try { c.executionCtx.waitUntil(put); } catch { await put; } }
  return res;
});

app.get('/me', async (c) => {
  const user = c.get('user');
  const orgIds = Object.keys(user.orgRoles);
  const org = orgIds.length ? await c.env.DB.prepare('SELECT id, name, slug, logo_url FROM orgs WHERE id = ?').bind(orgIds[0]).first() : null;
  return c.json({ user: { id: user.id, email: user.email, name: user.name }, org, orgRoles: user.orgRoles, isAgency: orgIds.length > 0 });
});

app.get('/workspaces', async (c) => {
  const user = c.get('user');
  const orgIds = Object.keys(user.orgRoles);
  const wsIds = Object.keys(user.wsRoles);
  const rows: any[] = [];
  for (const orgId of orgIds) {
    const r = await c.env.DB.prepare(
      `SELECT w.id, w.slug, w.name, w.client_url, w.stage, w.created_at,
        (SELECT COUNT(*) FROM documents d WHERE d.workspace_id = w.id) AS docs,
        (SELECT COUNT(*) FROM assets a WHERE a.workspace_id = w.id) AS assets
       FROM workspaces w WHERE w.org_id = ? ORDER BY w.created_at DESC`
    ).bind(orgId).all();
    rows.push(...r.results);
  }
  for (const id of wsIds) {
    const r = await c.env.DB.prepare('SELECT id, slug, name, client_url FROM workspaces WHERE id = ?').bind(id).first();
    if (r && !rows.find((x) => x.id === id)) rows.push(r);
  }
  return c.json(rows);
});

app.post('/workspaces', async (c) => {
  const user = c.get('user');
  const orgId = Object.entries(user.orgRoles).find(([, r]) => r === 'agency_admin')?.[0];
  if (!orgId) return c.json({ error: 'Only agency admins can create projects' }, 403);
  const b = await c.req.json<any>();
  const slug = String(b.slug || b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return c.json({ error: 'Name required' }, 400);
  const id = uid('w_');
  await c.env.DB.prepare('INSERT INTO workspaces (id, org_id, slug, name, client_url, category_description, stage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, orgId, slug, b.name, b.client_url || null, b.category_description || null, b.stage || 'lead', Date.now())
    .run();
  return c.json({ id, slug });
});

// workspace-scoped middleware
app.use('/w/:slug/*', async (c, next) => {
  const user = c.get('user');
  const slug = c.req.param('slug');
  const candidates = await c.env.DB.prepare('SELECT * FROM workspaces WHERE slug = ?').bind(slug).all<any>();
  for (const ws of candidates.results) {
    const access = accessFor(user, ws);
    if (access) {
      c.set('ws', ws);
      c.set('access', access);
      return next();
    }
  }
  return c.json({ error: 'No access' }, 403);
});

const agencyOnly = (c: any) => (!c.get('access').isAgency ? c.json({ error: 'Agency only' }, 403) : null);
const vis = (c: any) => (c.get('access').isAgency ? '' : " AND visibility = 'client'");

app.get('/w/:slug/info', (c) => {
  const ws = c.get('ws');
  const access = c.get('access');
  const base = { id: ws.id, slug: ws.slug, name: ws.name, client_url: ws.client_url, category_description: ws.category_description, access };
  const settings = JSON.parse(ws.settings_json || '{}');
  // clients only get what shapes their view (hidden sections), never stage or other internals
  return c.json(access.isAgency ? { ...base, stage: ws.stage, settings } : { ...base, settings: { hidden_tabs: settings.hidden_tabs || [] } });
});

app.patch('/w/:slug/info', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const ws = c.get('ws');
  const b = await c.req.json<any>();
  const fields = ['name', 'client_url', 'category_description', 'stage'] as const;
  for (const f of fields) if (b[f] !== undefined) await c.env.DB.prepare(`UPDATE workspaces SET ${f} = ? WHERE id = ?`).bind(b[f], ws.id).run();
  if (b.settings) await c.env.DB.prepare('UPDATE workspaces SET settings_json = ? WHERE id = ?').bind(JSON.stringify(b.settings), ws.id).run();
  if (b.stage && b.stage !== ws.stage)
    await c.env.DB.prepare('INSERT INTO activities (id, workspace_id, kind, title, happened_at, visibility) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(uid('t_'), ws.id, 'stage_change', `Stage: ${ws.stage} → ${b.stage}`, Date.now(), 'internal')
      .run();
  return c.json({ ok: true });
});

// contacts (agency only)
app.get('/w/:slug/contacts', async (c) => {
  if (!c.get('access').isAgency) return c.json([]);
  const r = await c.env.DB.prepare('SELECT * FROM contacts WHERE workspace_id = ? ORDER BY created_at').bind(c.get('ws').id).all();
  return c.json(r.results);
});
app.post('/w/:slug/contacts', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const b = await c.req.json<any>();
  await c.env.DB.prepare('INSERT INTO contacts (id, workspace_id, name, email, role, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(uid('c_'), c.get('ws').id, b.name || null, b.email || null, b.role || null, b.notes || null, Date.now())
    .run();
  return c.json({ ok: true });
});

// timeline
app.get('/w/:slug/activities', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM activities WHERE workspace_id = ?${vis(c)} ORDER BY happened_at DESC LIMIT 100`).bind(c.get('ws').id).all();
  return c.json(r.results);
});
app.post('/w/:slug/activities', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const b = await c.req.json<any>();
  await c.env.DB.prepare('INSERT INTO activities (id, workspace_id, kind, title, happened_at, visibility) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(uid('t_'), c.get('ws').id, b.kind || 'note', b.title, b.happened_at || Date.now(), b.visibility || 'internal')
    .run();
  return c.json({ ok: true });
});

// memory
app.get('/w/:slug/documents', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT id, kind, title, source, visibility, created_at, length(text_content) AS chars, substr(text_content, 1, 280) AS preview
     FROM documents WHERE workspace_id = ?${vis(c)} ORDER BY created_at DESC`
  ).bind(c.get('ws').id).all();
  return c.json(r.results);
});
app.get('/w/:slug/documents/:id', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND workspace_id = ?${vis(c)}`).bind(c.req.param('id'), c.get('ws').id).first();
  return r ? c.json(r) : c.json({ error: 'Not found' }, 404);
});
app.post('/w/:slug/documents', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const ws = c.get('ws');
  const b = await c.req.json<{ kind: string; title: string; text?: string; pdf_base64?: string; visibility?: string; source?: string }>();
  let text = b.text || '';
  if (b.pdf_base64) {
    if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: 'PDF extraction needs ANTHROPIC_API_KEY' }, 400);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': c.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: c.env.MODEL || 'claude-sonnet-5-5',
        max_tokens: 16000,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.pdf_base64 } },
          { type: 'text', text: 'Return the full text of this document as plain text, preserving headings and lists. No commentary.' },
        ] }],
      }),
    });
    if (!res.ok) return c.json({ error: `Extraction failed: ${res.status}` }, 502);
    const data: any = await res.json();
    text = (data.content || []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n');
  }
  if (!text.trim()) return c.json({ error: 'Empty document' }, 400);
  const id = uid('d_');
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO documents (id, workspace_id, kind, title, source, text_content, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ws.id, b.kind || 'note', b.title || 'Untitled', b.source || 'upload', text, b.visibility || 'internal', now),
    c.env.DB.prepare('INSERT INTO activities (id, workspace_id, kind, title, happened_at, document_id, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(uid('t_'), ws.id, b.kind === 'transcript' ? 'meeting' : 'document', `${b.kind || 'note'}: ${b.title}`, now, id, 'internal'),
  ]);
  return c.json({ id });
});
app.delete('/w/:slug/documents/:id', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  await c.env.DB.prepare('DELETE FROM documents WHERE id = ? AND workspace_id = ?').bind(c.req.param('id'), c.get('ws').id).run();
  return c.json({ ok: true });
});
app.get('/w/:slug/search', async (c) => {
  const q = (c.req.query('q') || '').replace(/["']/g, ' ').trim();
  if (!q) return c.json([]);
  const terms = q.split(/\s+/).filter(Boolean).map((t) => `"${t}"*`).join(' OR ');
  const r = await c.env.DB.prepare(
    `SELECT d.id, d.title, d.kind, snippet(documents_fts, 1, '<mark>', '</mark>', ' … ', 28) AS snip
     FROM documents_fts JOIN documents d ON d.rowid = documents_fts.rowid
     WHERE documents_fts MATCH ? AND d.workspace_id = ?${c.get('access').isAgency ? '' : " AND d.visibility = 'client'"}
     ORDER BY rank LIMIT 20`
  ).bind(terms, c.get('ws').id).all();
  return c.json(r.results);
});

// assets
app.get('/w/:slug/assets', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM assets WHERE workspace_id = ?${vis(c)} ORDER BY created_at DESC`).bind(c.get('ws').id).all();
  return c.json(r.results);
});
app.post('/w/:slug/assets', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const b = await c.req.json<any>();
  let kind = b.kind;
  const url = String(b.url || '');
  if (!kind) kind = /figma\.com/.test(url) ? 'figma' : /github\.com/.test(url) ? 'github_repo' : /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : /webflow/.test(url) ? 'webflow_site' : 'link';
  await c.env.DB.prepare('INSERT INTO assets (id, workspace_id, kind, title, url, meta_json, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(uid('a_'), c.get('ws').id, kind, b.title || url, url || null, JSON.stringify(b.meta || {}), b.visibility || 'internal', Date.now())
    .run();
  return c.json({ ok: true });
});
app.delete('/w/:slug/assets/:id', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  await c.env.DB.prepare('DELETE FROM assets WHERE id = ? AND workspace_id = ?').bind(c.req.param('id'), c.get('ws').id).run();
  return c.json({ ok: true });
});

// research
app.get('/w/:slug/research/:kind', async (c) => {
  const ws = c.get('ws');
  const settings = JSON.parse(ws.settings_json || '{}');
  let row = await c.env.DB.prepare('SELECT data_json, status, updated_at FROM research WHERE workspace_id = ? AND kind = ?').bind(ws.id, c.req.param('kind')).first<any>();
  // demo workspace: brand kit taken from its Figma guidelines
  if (!row && c.req.param('kind') === 'brand_kit' && settings.demo) {
    row = { data_json: JSON.stringify(SUPERPLANE_KIT), status: 'published', updated_at: Date.now() };
    await c.env.DB.prepare('INSERT INTO research (workspace_id, kind, data_json, status, updated_at) VALUES (?, ?, ?, ?, ?)').bind(ws.id, 'brand_kit', row.data_json, row.status, row.updated_at).run();
  }
  if (!row || (!c.get('access').isAgency && row.status !== 'published')) return c.json(null);
  let data = JSON.parse(row.data_json);
  const patched = settings.demo && c.req.param('kind') === 'market_map' ? applyDemoPatch(data) : null;
  if (patched) {
    data = patched;
    row.updated_at = Date.now();
    await c.env.DB.prepare('UPDATE research SET data_json = ?, updated_at = ? WHERE workspace_id = ? AND kind = ?').bind(JSON.stringify(data), row.updated_at, ws.id, 'market_map').run();
  }
  return c.json({ data, status: row.status, updated_at: row.updated_at });
});
app.put('/w/:slug/research/:kind', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const b = await c.req.json<any>();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO research (workspace_id, kind, data_json, status, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, kind) DO UPDATE SET data_json = excluded.data_json, status = excluded.status, updated_at = excluded.updated_at`
  ).bind(c.get('ws').id, c.req.param('kind'), JSON.stringify(b.data), b.status || 'published', now).run();
  return c.json({ ok: true, updated_at: now });
});

// members (client access). Each client gets a personal sign-in code, shown once.
app.get('/w/:slug/members', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const r = await c.env.DB.prepare('SELECT u.email, m.role, (u.code_hash IS NOT NULL) AS has_code FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY u.email').bind(c.get('ws').id).all();
  return c.json(r.results);
});
async function issueCode(c: any, userId: string) {
  const code = newCode();
  await c.env.DB.prepare('UPDATE users SET code_hash = ? WHERE id = ?').bind(await hashCode(c.env.SESSION_SECRET, code), userId).run();
  return code;
}
app.post('/w/:slug/members', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const b = await c.req.json<{ email: string; role: string }>();
  const email = String(b.email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'Enter a valid email' }, 400);
  const role = ['client_admin', 'client_member', 'brand_guest'].includes(b.role) ? b.role : 'client_member';
  let u = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (!u) {
    u = { id: uid('u_') };
    await c.env.DB.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').bind(u.id, email, Date.now()).run();
  }
  const agencyUser = await c.env.DB.prepare('SELECT 1 FROM org_members WHERE user_id = ?').bind(u.id).first();
  if (agencyUser) return c.json({ error: 'This is an agency account; it already sees every project' }, 400);
  await c.env.DB.prepare('INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').bind(c.get('ws').id, u.id, role).run();
  const code = await issueCode(c, u.id);
  await c.env.DB.prepare('INSERT INTO activities (id, workspace_id, kind, title, happened_at, visibility) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(uid('t_'), c.get('ws').id, 'access', `Access given to ${email}`, Date.now(), 'internal').run();
  return c.json({ ok: true, email, code });
});
app.post('/w/:slug/members/reset-code', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const { email } = await c.req.json<{ email: string }>();
  const u = await c.env.DB.prepare('SELECT u.id FROM users u JOIN workspace_members m ON m.user_id = u.id WHERE u.email = ? AND m.workspace_id = ?').bind(String(email).toLowerCase(), c.get('ws').id).first<{ id: string }>();
  if (!u) return c.json({ error: 'Not a member of this project' }, 404);
  return c.json({ ok: true, email, code: await issueCode(c, u.id) });
});
app.delete('/w/:slug/members', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const email = String(c.req.query('email') || '').toLowerCase();
  const u = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (u) {
    await c.env.DB.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').bind(c.get('ws').id, u.id).run();
    const left = await c.env.DB.prepare('SELECT 1 FROM workspace_members WHERE user_id = ?').bind(u.id).first();
    if (!left) await c.env.DB.prepare('UPDATE users SET code_hash = NULL WHERE id = ?').bind(u.id).run();
  }
  return c.json({ ok: true });
});

// usage (agency only)
app.get('/w/:slug/usage', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const r = await c.env.DB.prepare('SELECT provider, SUM(units) AS units, COUNT(*) AS calls FROM usage WHERE workspace_id = ? GROUP BY provider').bind(c.get('ws').id).all();
  return c.json(r.results);
});

// chat
// competitors: research a company by name or website (agency only; the client merges and saves the result)
app.post('/w/:slug/competitors/research', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const b = await c.req.json<{ query?: string; name?: string; url?: string }>();
  if (!b.query && !b.name && !b.url) return c.json({ error: 'Enter a name or a website' }, 400);
  try {
    return c.json({ company: await researchCompany(c.env, c.get('ws').id, b, c.get('ws').name) });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// competitors vs project memory: who the client names, and how our list holds up (agency only; nothing is saved here)
app.post('/w/:slug/competitors/from-memory', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const ws = c.get('ws');
  const row = await c.env.DB.prepare(`SELECT data_json FROM research WHERE workspace_id = ? AND kind = 'market_map'`).bind(ws.id).first<{ data_json: string }>();
  try {
    return c.json(await reviewAgainstMemory(c.env, ws.id, ws.name, row ? JSON.parse(row.data_json) : { companies: [] }));
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// Brand Visibility and PR Monitor data: posts, news, HQ coordinates, fresh Ahrefs metrics; one company per call
app.post('/w/:slug/radar/refresh', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const ws = c.get('ws');
  const { id, force } = await c.req.json<{ id?: string; force?: boolean }>();
  const load = async () => {
    const r = await c.env.DB.prepare(`SELECT data_json, status FROM research WHERE workspace_id = ? AND kind = 'market_map'`).bind(ws.id).first<{ data_json: string; status: string }>();
    return r ? { data: JSON.parse(r.data_json), status: r.status } : null;
  };
  const cur = await load();
  if (!cur) return c.json({ error: 'No competitors yet' }, 400);
  if (!id) return c.json({ ids: ['__client', ...focusIds(cur.data)] });
  const company = id === '__client' ? cur.data.client : cur.data.companies.find((x: any) => x.id === id);
  if (!company) return c.json({ error: 'Unknown company' }, 404);
  const res = await refreshOne(c.env, company, cur.data.activity?.[id], !!force);
  // write only this company's fields, atomically, so parallel refreshes and edits don't overwrite each other
  const idx = cur.data.companies.findIndex((x: any) => x.id === id);
  const at = id === '__client' ? '$.client' : `$.companies[${idx}]`;
  let expr = `json_set(data_json, '$.activity', json(coalesce(json_extract(data_json, '$.activity'), '{}')))`;
  const binds: unknown[] = [];
  const set = (path: string, v: unknown) => { expr = `json_set(${expr}, ?, json(?))`; binds.push(path, JSON.stringify(v)); };
  if (res.activity) set(`$.activity."${id.replace(/"/g, '')}"`, res.activity);
  if (res.ahrefs) set(`${at}.ahrefs`, res.ahrefs);
  if (res.geo) set(`${at}.geo`, res.geo);
  const now = Date.now();
  const guard = id === '__client' ? '' : ` AND json_extract(data_json, '$.companies[${idx}].id') = ?`;
  await c.env.DB.prepare(`UPDATE research SET data_json = ${expr}, updated_at = ? WHERE workspace_id = ? AND kind = 'market_map'${guard}`)
    .bind(...binds, now, ws.id, ...(guard ? [id] : [])).run();
  const fresh = (await load())!;
  return c.json({ data: fresh.data, status: fresh.status, updated_at: now });
});

// SEO lens: load top keywords + content gap for a country from Ahrefs, save into the research (agency only)
app.post('/w/:slug/seo', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const ws = c.get('ws');
  const country = String((await c.req.json<{ country?: string }>()).country || 'US').toUpperCase().slice(0, 2);
  const row = await c.env.DB.prepare(`SELECT data_json, status FROM research WHERE workspace_id = ? AND kind = 'market_map'`).bind(ws.id).first<{ data_json: string; status: string }>();
  if (!row) return c.json({ error: 'No competitors yet' }, 400);
  try {
    const data = JSON.parse(row.data_json);
    const seo = await loadSeo(c.env, data, country);
    const next = { ...data, seo: { ...(data.seo || {}), [country]: seo } };
    const now = Date.now();
    await c.env.DB.prepare('UPDATE research SET data_json = ?, updated_at = ? WHERE workspace_id = ? AND kind = ?').bind(JSON.stringify(next), now, ws.id, 'market_map').run();
    return c.json({ data: next, status: row.status, updated_at: now });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// lenses: AI suggests brand matrices, or places companies on custom axes (agency only; result is saved by the client)
app.post('/w/:slug/lenses/ai', async (c) => {
  const deny = agencyOnly(c);
  if (deny) return deny;
  const b = await c.req.json<any>();
  const row = await c.env.DB.prepare(`SELECT data_json FROM research WHERE workspace_id = ? AND kind = 'market_map'`).bind(c.get('ws').id).first<{ data_json: string }>();
  if (!row) return c.json({ error: 'No market data yet' }, 400);
  const data = JSON.parse(row.data_json);
  try {
    const lenses = b.axes
      ? await aiLenses(c.env, c.get('ws').id, data, { kind: 'score', title: String(b.title || 'Custom matrix'), axes: b.axes })
      : await aiLenses(c.env, c.get('ws').id, data, { kind: 'suggest', existing: (b.existing || []).map(String) });
    return c.json({ lenses });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

app.post('/w/:slug/chat', async (c) => {
  const b = await c.req.json<{ messages: any[] }>();
  return c.json(await chat(c.env, c.get('ws'), c.get('access'), b.messages || []));
});

export default app;
