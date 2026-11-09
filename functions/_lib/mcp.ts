// MCP connector: a project's brand in any AI assistant (Claude, ChatGPT, Cursor…). The agency makes a secret
// link per project in Settings; whoever has it gets what the client sees: logos, colours, fonts, the guide,
// social post covers, project memory open to the client and the published competitor research.
// Stateless Streamable HTTP (JSON responses). Logos and covers come with an MCP App view that draws them as
// PNG in the chat; hosts without apps get SVG and a link to the generator.
import type { Env, Access } from './auth';
import { runTool } from './chat';
import { SUPERPLANE_KIT, patchKit } from './kits/superplane';
import { MCP_APP_HTML } from './mcp-app.generated';
import { FORMATS, VARIANTS, numberIn } from '../../src/tabs/banners';

export const MCP_TABLE = 'CREATE TABLE IF NOT EXISTS mcp_links (token TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER)';
const UI = 'ui://metabrand/preview.html';
const UI_MIME = 'text/html;profile=mcp-app';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const CLIENT: Access = { level: 'client_member', isAgency: false };
const COVER_STYLES = VARIANTS.filter((v) => v.id !== 'photo' && v.id !== 'icon');
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id',
};

type Ws = { id: string; slug: string; name: string; client_url: string | null; category_description: string | null; settings_json: string };
type Kit = any;

export async function linkFor(env: Env, wsId: string) {
  await env.DB.prepare(MCP_TABLE).run();
  return env.DB.prepare('SELECT token, created_at, last_used_at FROM mcp_links WHERE workspace_id = ?').bind(wsId).first<{ token: string; created_at: number; last_used_at: number | null }>();
}
export async function rotateLink(env: Env, wsId: string) {
  await env.DB.prepare(MCP_TABLE).run();
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mcp_links WHERE workspace_id = ?').bind(wsId),
    env.DB.prepare('INSERT INTO mcp_links (token, workspace_id, created_at) VALUES (?, ?, ?)').bind(token, wsId, Date.now()),
  ]);
  return token;
}
export async function revokeLink(env: Env, wsId: string) {
  await env.DB.prepare(MCP_TABLE).run();
  await env.DB.prepare('DELETE FROM mcp_links WHERE workspace_id = ?').bind(wsId).run();
}

async function wsFor(env: Env, token: string): Promise<Ws | null> {
  const q = () => env.DB.prepare('SELECT w.id, w.slug, w.name, w.client_url, w.category_description, w.settings_json FROM mcp_links l JOIN workspaces w ON w.id = l.workspace_id WHERE l.token = ?').bind(token).first<Ws>();
  try { return await q(); } catch { await env.DB.prepare(MCP_TABLE).run(); return q(); }
}

/** The brand kit as the client sees it (published), with the demo kit's fixes applied. */
async function kitFor(env: Env, ws: Ws): Promise<Kit | null> {
  const settings = JSON.parse(ws.settings_json || '{}');
  const row = await env.DB.prepare(`SELECT data_json, status FROM research WHERE workspace_id = ? AND kind = 'brand_kit'`).bind(ws.id).first<{ data_json: string; status: string }>();
  if (!row) return settings.demo ? SUPERPLANE_KIT : null;
  if (row.status !== 'published') return null;
  const kit = JSON.parse(row.data_json);
  return (settings.demo && patchKit(kit)) || kit;
}

// ---------- logos ----------
/** A short, stable key per logo variant: "black-transparent", "white-on-black"… from the file name. */
function variantKey(kit: Kit, logo: any, v: any, i: number) {
  let f = String(v.file || '');
  const brand = String(kit.brand || '').replace(/\s+/g, '');
  if (brand && f.toLowerCase().startsWith(brand.toLowerCase() + '-')) f = f.slice(brand.length + 1);
  const parts = f.split('-');
  const key = parts.length > 1 ? parts.slice(1).join('-') : '';
  return key ? key.toLowerCase() : `v${i + 1}`;
}
function logoSvg(l: any, v: any) {
  const inner = l.mono === false ? l.svg : String(l.svg).replaceAll('currentColor', v.color);
  const doc = (body: string, w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${body}</svg>`;
  if (!v.bg) return { svg: doc(inner, l.w, l.h), w: l.w, h: l.h };
  const F = l.frame || { w: Math.round(l.w * 1.25), h: Math.round(l.h + l.w * 0.25) };
  const body = `<rect width="${F.w}" height="${F.h}" fill="${v.bg}"/><g transform="translate(${((F.w - l.w) / 2).toFixed(2)} ${((F.h - l.h) / 2).toFixed(2)})">${inner}</g>`;
  return { svg: doc(body, F.w, F.h), w: F.w, h: F.h };
}
const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function pickLogo(kit: Kit, want?: string) {
  const logos: any[] = kit.logos || [];
  const w = norm(want);
  return (w && (logos.find((l) => norm(l.id) === w || norm(l.name) === w) || logos.find((l) => norm(l.name).includes(w) || w.includes(norm(l.id))
    || (/(symbol|mark|icon|sign)/.test(w) && /(sign|mark|symbol)/.test(norm(l.id + ' ' + l.name)))
    || (/(word|text|type)/.test(w) && /(word|text)/.test(norm(l.id + ' ' + l.name)))))) || logos[0];
}
function pickVariants(kit: Kit, l: any, want?: string) {
  const all = (l.variants || []).map((v: any, i: number) => ({ v, key: variantKey(kit, l, v, i) }));
  const w = norm(want);
  if (!w) return { all, picked: all };
  const exact = all.filter((x: any) => norm(x.key) === w);
  if (exact.length) return { all, picked: exact };
  const words = w.split(' ').filter((x) => !['on', 'logo', 'the', 'a', 'version', 'variant'].includes(x));
  const hit = all.filter((x: any) => words.every((t) => norm(x.key).includes(t) || (t === 'transparent' && !x.v.bg) || (t === 'dark' && /black/.test(x.key)) || (t === 'light' && /white/.test(x.key))));
  return { all, picked: hit.length ? hit : all };
}

// ---------- tools ----------
function toolList(kit: Kit | null) {
  const logos: any[] = kit?.logos || [];
  const sections: any[] = kit?.guide?.sections || [];
  const keys = logos.map((l) => `${l.id}: ${(l.variants || []).map((v: any, i: number) => variantKey(kit, l, v, i)).join(', ')}`).join('; ');
  const ro = { readOnlyHint: true, openWorldHint: false };
  return [
    {
      name: 'get_brand', title: 'Brand basics',
      description: 'The brand at a glance: colours (names, HEX, RGB, CMYK, Pantone), fonts and how they are used, available logos and their variants, links to the online guide and the brand assets. Call it before writing or designing anything on-brand.',
      inputSchema: { type: 'object', properties: {} }, annotations: ro,
    },
    {
      name: 'get_logo', title: 'Logo',
      description: `Get a brand logo as image (PNG in the preview) and SVG. Use whenever the user asks for the logo, sign, symbol, wordmark or a colour version of it. Variants per logo: ${keys || 'none'}. Without a variant all versions of that logo are shown.`,
      inputSchema: {
        type: 'object',
        properties: {
          logo: { type: 'string', ...(logos.length ? { enum: logos.map((l) => l.id) } : {}), description: 'Which logo; the full logo by default.' },
          variant: { type: 'string', description: 'Colour version, e.g. "white-on-black" or just "white". Leave empty to show all.' },
        },
      },
      annotations: ro, _meta: { ui: { resourceUri: UI }, 'openai/outputTemplate': UI },
    },
    {
      name: 'make_cover', title: 'Social post cover',
      description: `Make on-brand social post covers (LinkedIn, story, screen) for a headline: the preview draws several layouts in the brand style, each downloadable as PNG or SVG. Use for any request for a post image, banner, cover or visual for social media. Write a short punchy headline (up to ~8 words) from what the user wants to say if they did not give one. Formats: ${FORMATS.map((f) => `${f.id} (${f.note})`).join(', ')}. Styles: ${COVER_STYLES.map((v) => `${v.id} (${v.hint})`).join(', ')}.`,
      inputSchema: {
        type: 'object',
        properties: {
          headline: { type: 'string', description: 'The text on the cover.' },
          format: { type: 'string', enum: FORMATS.map((f) => f.id), description: 'Size; LinkedIn square by default.' },
          style: { type: 'string', enum: COVER_STYLES.map((v) => v.id), description: 'One layout only; leave empty to get several options.' },
          number: { type: 'string', description: 'A figure to feature, like "30%" or "$2.6M" (for the big-number layout).' },
        },
        required: ['headline'],
      },
      annotations: ro, _meta: { ui: { resourceUri: UI }, 'openai/outputTemplate': UI },
    },
    {
      name: 'get_guide', title: 'Brand guide',
      description: `The online brand guide: rules and explanations per section with image links. Sections: ${sections.map((s) => `${s.id} (${s.title})`).join(', ') || 'none'}. Without a section, the list with summaries.`,
      inputSchema: { type: 'object', properties: { section: { type: 'string', ...(sections.length ? { enum: sections.map((s) => s.id) } : {}) } } }, annotations: ro,
    },
    {
      name: 'search_memory', title: 'Search project memory',
      description: 'Full-text search in the project documents shared with the client: briefs, meeting notes, research. Returns matching snippets with titles.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, annotations: ro,
    },
    {
      name: 'get_competitors', title: 'Competitors',
      description: 'The competitor research: companies with segment, overlap, positioning claims, proof, funding, team size, location, SEO metrics, plus perceptual maps and findings.',
      inputSchema: { type: 'object', properties: { overlap: { type: 'string', enum: ['direct', 'angle', 'substitute', 'may_enter'] } } }, annotations: ro,
    },
    {
      name: 'get_press_coverage', title: 'Press coverage',
      description: 'Recent articles about the brand and each competitor (Ahrefs backlinks from articles), their own blog posts, and article ideas for the brand. Use for PR angles, sites to pitch, content ideas.',
      inputSchema: { type: 'object', properties: {} }, annotations: ro,
    },
  ];
}

type Ctx = { env: Env; ws: Ws; kit: Kit | null; base: string; token: string };
type Result = { content: any[]; structuredContent?: any; isError?: boolean; _meta?: any };
const text = (t: string, extra: Partial<Result> = {}): Result => ({ content: [{ type: 'text', text: t }], ...extra });
const abs = (base: string, u?: string) => (!u ? undefined : /^https?:/.test(u) ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`);

async function callTool(x: Ctx, name: string, a: any): Promise<Result> {
  const { kit, base, ws } = x;
  const appUrl = `${base}/${ws.slug}`;
  if (['get_brand', 'get_logo', 'make_cover', 'get_guide'].includes(name) && !kit) return text(`The ${ws.name} brand kit isn't published yet.`, { isError: true });

  if (name === 'get_brand') {
    const out = {
      brand: kit.brand, about: ws.category_description || undefined, website: ws.client_url || undefined,
      colours: (kit.colors || []).map((g: any) => ({ group: g.group, colours: g.items })),
      fonts: (kit.fonts || []).map((f: any) => ({ family: f.family, weights: f.weights, use: f.use, google_fonts: f.google !== false ? `https://fonts.google.com/specimen/${String(f.family).replace(/ /g, '+')}` : undefined, styles: f.styles?.map((s: any) => ({ name: s.name, weight: s.weight, size_px: s.size, line_height: s.lh, letter_spacing_em: s.ls, uppercase: s.upper || undefined })) })),
      logos: (kit.logos || []).map((l: any) => ({ id: l.id, name: l.name, variants: (l.variants || []).map((v: any, i: number) => ({ key: variantKey(kit, l, v, i), colour: v.color, background: v.bg || 'transparent' })) })),
      guide: kit.guide ? { url: `${appUrl}/guide`, sections: kit.guide.sections.map((s: any) => ({ id: s.id, title: s.title, summary: s.summary })) } : undefined,
      links: { assets: `${appUrl}/assets`, covers: `${appUrl}/generate` },
    };
    return text(JSON.stringify(out));
  }

  if (name === 'get_logo') {
    const l = pickLogo(kit, a.logo);
    if (!l) return text('No logos in the brand kit yet.', { isError: true });
    const { picked } = pickVariants(kit, l, a.variant);
    const items = picked.map(({ v, key }: any) => {
      const { svg, w, h } = logoSvg(l, v);
      const file = `${String(kit.brand).replace(/\s+/g, '')}-${l.id}-${key}`;
      return { key, name: key.replace(/-/g, ' '), file, svg, w, h, bg: v.bg || null, color: v.color, url: `${base}/mcp/${x.token}/file/${l.id}/${key}.svg` };
    });
    const first = items[0];
    return {
      content: [
        { type: 'text', text: `${kit.brand} ${l.name.toLowerCase()}: ${items.length === 1 ? first.key : `${items.length} versions (${items.map((i: any) => i.key).join(', ')})`}. The preview shows them with PNG and SVG download. SVG links: ${items.map((i: any) => i.url).join(' ')}` },
        { type: 'resource', resource: { uri: first.url, mimeType: 'image/svg+xml', text: first.svg } },
      ],
      structuredContent: { kind: 'logos', brand: kit.brand, title: `${kit.brand} · ${l.name}`, items: items.map(({ url, ...i }: any) => ({ ...i, url })), app: `${appUrl}/assets` },
    };
  }

  if (name === 'make_cover') {
    const headline = String(a.headline || '').trim().slice(0, 140);
    if (!headline) return text('Give a headline for the cover.', { isError: true });
    const fmt = FORMATS.find((f) => f.id === a.format) || FORMATS[0];
    const number = String(a.number || '').trim() || numberIn(headline);
    let styles = a.style && COVER_STYLES.some((v) => v.id === a.style) ? [a.style] : ['statement', 'field', 'steps', 'label'];
    if (!a.style && number) styles = ['number', ...styles.slice(0, 3)];
    const link = `${appUrl}/generate?h=${encodeURIComponent(headline)}&f=${fmt.id}`;
    const slim = { brand: kit.brand, colors: kit.colors, fonts: kit.fonts, logos: (kit.logos || []).map((l: any) => ({ ...l, variants: (l.variants || []).slice(0, 1) })), icons: [] };
    return {
      content: [{ type: 'text', text: `Made ${styles.length} ${fmt.label} cover${styles.length > 1 ? 's' : ''} (${fmt.note}) for "${headline}": ${styles.map((s) => VARIANTS.find((v) => v.id === s)?.name).join(', ')}. They are drawn in the preview with PNG and SVG download. If no preview is shown, the covers are ready to download here: ${link}` }],
      structuredContent: { kind: 'covers', brand: kit.brand, title: `${kit.brand} · ${fmt.label}`, kit: slim, copy: { headline, number: number || undefined }, format: fmt.id, styles, seed: Math.floor(Math.random() * 1000) + 1, app: link },
    };
  }

  if (name === 'get_guide') {
    const g = kit.guide;
    if (!g) return text('There is no online guide for this brand yet.', { isError: true });
    const s = a.section && g.sections.find((s: any) => s.id === a.section || norm(s.title) === norm(a.section));
    if (!s) return text(JSON.stringify({ title: g.title, intro: g.intro, url: `${appUrl}/guide`, sections: g.sections.map((s: any) => ({ id: s.id, title: s.title, summary: s.summary, url: `${appUrl}/guide/${s.id}` })) }));
    return text(JSON.stringify({ id: s.id, title: s.title, summary: s.summary, url: `${appUrl}/guide/${s.id}`, pages: (s.slides || []).map((p: any) => ({ title: p.title, text: p.text, image: abs(base, p.img) })) }));
  }

  const map: Record<string, string> = { search_memory: 'search_memory', get_competitors: 'get_market_map', get_press_coverage: 'get_pr_coverage' };
  if (map[name]) return text(await runTool(x.env, { id: ws.id, name: ws.name }, CLIENT, map[name], a || {}, []));
  return text(`Unknown tool: ${name}`, { isError: true });
}

// ---------- JSON-RPC ----------
async function dispatch(x: Ctx, msg: any): Promise<any | null> {
  const { id, method, params } = msg || {};
  if (id === undefined || id === null) return null; // notifications
  const ok = (result: any) => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    switch (method) {
      case 'initialize': {
        const v = PROTOCOLS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
        x.env.DB.prepare('UPDATE mcp_links SET last_used_at = ? WHERE token = ?').bind(Date.now(), x.token).run().catch(() => {});
        const brand = x.kit?.brand || x.ws.name;
        return ok({
          protocolVersion: v,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: { name: 'metabrand-os', title: `${brand} brand · Metabrand OS`, version: '1.0.0', websiteUrl: `${x.base}/${x.ws.slug}` },
          instructions: `The ${brand} brand system, kept by the Metabrand agency: logos, colours, fonts, the online guide, social post covers, project documents and competitor research. For the logo call get_logo; for a social post image, banner or cover call make_cover (it draws the image in the brand style); for colours, fonts or brand rules call get_brand or get_guide; for briefs and notes search_memory; for competitors and press get_competitors and get_press_coverage. Never invent brand colours or rules: take them from these tools.`,
        });
      }
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: toolList(x.kit) });
      case 'tools/call': return ok(await callTool(x, params?.name, params?.arguments || {}));
      case 'resources/list': return ok({ resources: [{ uri: UI, name: 'preview', title: 'Brand preview', description: 'Draws logos and covers as images with downloads', mimeType: UI_MIME }] });
      case 'resources/templates/list': return ok({ resourceTemplates: [] });
      case 'resources/read': {
        if (params?.uri !== UI) return fail(-32002, 'Resource not found');
        const fonts = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
        return ok({ contents: [{ uri: UI, mimeType: UI_MIME, text: MCP_APP_HTML, _meta: { ui: { csp: { connectDomains: [...fonts, x.base], resourceDomains: [...fonts, x.base] }, prefersBorder: false } } }] });
      }
      case 'prompts/list': return ok({ prompts: [] });
      default: return fail(-32601, `Method not found: ${method}`);
    }
  } catch (e: any) {
    return fail(-32603, e?.message || 'Internal error');
  }
}

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const m = url.pathname.match(/^\/mcp\/([A-Za-z0-9_-]{20,})(\/.*)?\/?$/);
  if (!m) return new Response('Not found', { status: 404, headers: CORS });
  const ws = await wsFor(env, m[1]);
  if (!ws) return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'This connector link was revoked. Ask Metabrand for a new one.' } }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } });
  const base = url.origin;
  const rest = m[2] || '';

  // logo files for the links in tool results
  const f = rest.match(/^\/file\/([\w-]+)\/([\w-]+)\.svg$/);
  if (f && req.method === 'GET') {
    const kit = await kitFor(env, ws);
    const l = kit?.logos?.find((l: any) => l.id === f[1]);
    const hit = l && (l.variants || []).map((v: any, i: number) => ({ v, key: variantKey(kit, l, v, i) })).find((x: any) => x.key === f[2]);
    if (!hit) return new Response('Not found', { status: 404, headers: CORS });
    return new Response(logoSvg(l, hit.v).svg, { headers: { ...CORS, 'content-type': 'image/svg+xml', 'content-disposition': `inline; filename="${String(kit.brand).replace(/\s+/g, '')}-${l.id}-${hit.key}.svg"`, 'cache-control': 'private, max-age=3600' } });
  }
  if (rest && rest !== '/') return new Response('Not found', { status: 404, headers: CORS });
  if (req.method === 'GET') return new Response('This is an MCP server: add this link as a connector in Claude, ChatGPT or Cursor.', { status: 405, headers: { ...CORS, allow: 'POST' } });
  if (req.method === 'DELETE') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { ...CORS, allow: 'POST' } });

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers: CORS }); }
  const msgs = Array.isArray(body) ? body : [body];
  const needsKit = msgs.some((m) => ['initialize', 'tools/list', 'tools/call'].includes(m?.method));
  const x: Ctx = { env, ws, kit: needsKit ? await kitFor(env, ws) : null, base, token: m[1] };
  const out = (await Promise.all(msgs.map((m) => dispatch(x, m)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(body) ? out : out[0], { headers: CORS });
}
