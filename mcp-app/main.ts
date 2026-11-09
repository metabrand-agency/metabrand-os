// The view an AI chat shows for get_logo and make_cover (MCP Apps): draws the logos or covers as PNG images
// with PNG/SVG download through the host, and a link to the same thing in Metabrand OS.
// Built into one inline HTML file: npm run build:mcp.
import { App } from '@modelcontextprotocol/ext-apps';
import { FORMATS, embeddedFonts, render, rolesOf, type Copy } from '../src/tabs/banners';

type Item = { name: string; file: string; svg: string; w: number; h: number; bg?: string | null; color?: string };
type Logos = { kind: 'logos'; title: string; items: Item[]; app: string };
type Covers = { kind: 'covers'; title: string; kit: any; copy: Copy; format: string; styles: string[]; seed: number; app: string };

const app = new App({ name: 'Metabrand OS preview', version: '1.0.0' });
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const svgUrl = (svg: string) => `data:image/svg+xml;base64,${b64(svg)}`;

/** SVG to PNG through a data URL (blob: URLs are often blocked inside the chat's sandbox). */
async function png(svg: string, w: number, h: number, maxSide = 2400): Promise<string> {
  const img = new Image();
  img.src = svgUrl(svg);
  await img.decode();
  await new Promise((ok) => setTimeout(ok, 60)); // embedded fonts settle
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

async function download(name: string, mime: string, data: string, isText: boolean, fallback: string) {
  const can = app.getHostCapabilities()?.downloadFile;
  if (can) {
    const r = await app.downloadFile({ contents: [{ type: 'resource', resource: { uri: `file:///${name}`, mimeType: mime, ...(isText ? { text: data } : { blob: data }) } }] }).catch(() => ({ isError: true }));
    if (!r.isError) return;
  }
  await app.openLink({ url: fallback }).catch(() => {});
}

/** The brand fonts, loaded from Google Fonts as data so measuring text works without font-src rights. */
let fontCss = '';
async function loadFonts(kit: any) {
  fontCss = await embeddedFonts(kit.fonts || []).catch(() => '');
  for (const block of fontCss.split('@font-face').slice(1)) {
    const fam = block.match(/font-family:\s*'?"?([^;'"]+)/)?.[1];
    const weight = block.match(/font-weight:\s*([\d ]+)/)?.[1]?.trim();
    const range = block.match(/unicode-range:\s*([^;]+)/)?.[1];
    const data = block.match(/base64,([^)'"]+)/)?.[1];
    if (!fam || !data) continue;
    const bin = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
    try { const f = new FontFace(fam, bin.buffer, { weight: weight || '400', ...(range ? { unicodeRange: range } : {}) }); await f.load(); document.fonts.add(f); } catch { /* keep going with what loads */ }
  }
}

const light = (hex?: string) => { const n = parseInt(String(hex || '#000').slice(1, 7), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 186; };
function card(i: number, label: string, src: string, ratio: number, checker: boolean, dark = false) {
  return `<figure class="card"><div class="pic${checker ? ' checker' : ''}${dark ? ' dark' : ''}" style="aspect-ratio:${ratio}"><img src="${src}" alt="${esc(label)}"/></div>
    <figcaption><span>${esc(label)}</span><span class="btns"><button data-i="${i}" data-k="png">PNG</button><button data-i="${i}" data-k="svg">SVG</button></span></figcaption></figure>`;
}

async function show(s: Logos | Covers) {
  $('#title').textContent = s.title;
  $('#open').onclick = () => app.openLink({ url: s.app });
  const grid = $('#grid');
  grid.innerHTML = '<div class="wait">Drawing…</div>';
  let files: { name: string; svg: string; w: number; h: number }[] = [];
  let html = '';
  if (s.kind === 'logos') {
    grid.className = s.items.length > 1 ? 'grid logos' : 'grid one';
    files = s.items.map((it) => ({ name: it.file, svg: it.svg, w: it.w, h: it.h }));
    for (const [i, it] of s.items.entries()) {
      const k = Math.min(2400 / it.w, 4);
      html += card(i, it.name, await png(it.svg, it.w * k, it.h * k), it.w / it.h, !it.bg, !it.bg && light(it.color));
    }
  } else {
    await loadFonts(s.kit);
    const fmt = FORMATS.find((f) => f.id === s.format) || FORMATS[0];
    const R = rolesOf(s.kit);
    grid.className = `grid ${fmt.w / fmt.h > 1.3 ? 'wide' : 'covers'}`;
    const names: Record<string, string> = { statement: 'Statement', number: 'Big number', steps: 'Type wall', flow: 'Generative card', field: 'Generative poster', motion: 'Motion', label: 'Announcement' };
    const slug = s.copy.headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cover';
    for (const [i, st] of s.styles.entries()) {
      const svg = render(st, fmt, R, s.copy, s.seed + i, fontCss);
      files.push({ name: `${String(s.kit.brand).replace(/\s+/g, '')}-${slug}-${st}-${fmt.id}`, svg, w: fmt.w, h: fmt.h });
      html += card(i, names[st] || st, await png(svg, fmt.w, fmt.h, 1600), fmt.w / fmt.h, false);
    }
  }
  grid.innerHTML = html;
  grid.querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
    const f = files[Number(b.dataset.i)];
    b.textContent = '…';
    if (b.dataset.k === 'svg') await download(`${f.name}.svg`, 'image/svg+xml', f.svg, true, s.app);
    else await download(`${f.name}.png`, 'image/png', (await png(f.svg, f.w * (s.kind === 'logos' ? Math.min(2400 / f.w, 4) : 1), f.h * (s.kind === 'logos' ? Math.min(2400 / f.w, 4) : 1))).split(',')[1], false, s.app);
    b.textContent = b.dataset.k!.toUpperCase();
  }));
}

function theme(t?: string) { document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'; }

app.ontoolresult = (r: any) => { const s = r?.structuredContent; if (s?.kind) show(s).catch((e) => { $('#grid').innerHTML = `<div class="wait">Couldn't draw it: ${esc(String(e?.message || e))}</div>`; }); };
app.ontoolinput = () => { $('#grid').innerHTML = '<div class="wait">Drawing…</div>'; };
app.onhostcontextchanged = (c: any) => theme(c?.theme);
app.onteardown = async () => ({});
app.connect().then(() => theme(app.getHostContext()?.theme)).catch(() => {});
