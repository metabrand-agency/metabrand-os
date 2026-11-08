// Banner renderer: turns a headline (plus an optional number, kicker and photo) into on-brand SVG banners.
// Every layout is drawn from the project's brand kit (colours, fonts, logos), so it works for any client;
// the styles follow the SuperPlane LinkedIn set: flat brand colour, pixel-square clusters, a thin inner
// frame, giant type, a flow field of arrows (generative art), a product-card look and motion blur.
import type { Kit, KitFont, KitLogo } from './BrandKit';

export type Format = { id: string; label: string; w: number; h: number; note: string };
export const FORMATS: Format[] = [
  { id: 'square', label: 'LinkedIn square', w: 1080, h: 1080, note: '1080 × 1080' },
  { id: 'portrait', label: 'LinkedIn portrait', w: 1080, h: 1350, note: '1080 × 1350, 4:5' },
  { id: 'landscape', label: 'LinkedIn link', w: 1200, h: 627, note: '1200 × 627' },
  { id: 'screen', label: 'Screen 16:9', w: 1920, h: 1080, note: '1920 × 1080' },
  { id: 'story', label: 'Story', w: 1080, h: 1920, note: '1080 × 1920, 9:16' },
];

export type Copy = { headline: string; number?: string; label?: string; image?: string };
export type Variant = { id: string; name: string; hint: string; needs?: 'number' | 'image'; art?: boolean };
export const VARIANTS: Variant[] = [
  { id: 'statement', name: 'Statement', hint: 'Headline with a pixel cluster and frame' },
  { id: 'number', name: 'Big number', hint: 'A figure in the middle', needs: 'number' },
  { id: 'steps', name: 'Type wall', hint: 'Giant words, an arrow on one of them' },
  { id: 'flow', name: 'Generative card', hint: 'Field of arrows with a product card', art: true },
  { id: 'field', name: 'Generative poster', hint: 'Field of arrows around the headline', art: true },
  { id: 'icon', name: 'App icon', hint: 'The sign as an app icon' },
  { id: 'motion', name: 'Motion', hint: 'Pixel grid with motion blur' },
  { id: 'label', name: 'Announcement', hint: 'Kicker, headline and logo' },
  { id: 'photo', name: 'Photo', hint: 'Your image with the headline', needs: 'image' },
];

// ---------- colour ----------
const rgb = (hex: string) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const chroma = (hex: string) => { const v = rgb(hex); return (Math.max(...v) - Math.min(...v)) / 255; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export type Roles = {
  brand: string; dark: string; light: string; accent: string; deep: string; neutral: string;
  mids: string[]; lights: string[];
  head: { family: string; weight: number; ls: number }; mono: { family: string; weight: number } | null;
  sign?: KitLogo; mark?: KitLogo;
};

/** Colour and type roles from any brand kit. */
export function rolesOf(kit: Kit): Roles {
  const groups = kit.colors || [];
  let all = groups.filter((g) => !/interface|ui|status|system/i.test(g.group)).flatMap((g) => g.items.map((c) => c.hex.toUpperCase()));
  if (all.length < 3) all = groups.flatMap((g) => g.items.map((c) => c.hex.toUpperCase()));
  all = [...new Set(all.filter((h) => /^#[0-9A-F]{3,8}$/.test(h)))];
  if (!all.length) all = ['#111111', '#F4F4F0', '#3B6EF5'];
  const byLum = [...all].sort((a, b) => lum(a) - lum(b));
  const dark = lum(byLum[0]) < 0.08 ? byLum[0] : '#0B0B0C';
  const light = lum(byLum[byLum.length - 1]) > 0.6 ? byLum[byLum.length - 1] : '#F4F4F0';
  const accent = [...all].filter((h) => chroma(h) > 0.3).sort((a, b) => chroma(b) - chroma(a))[0] || all.find((h) => h !== dark && h !== light) || '#3B6EF5';
  const deep = all.filter((h) => lum(h) < 0.12 && chroma(h) > 0.1 && h !== accent).sort((a, b) => chroma(b) - chroma(a))[0] || dark;
  const mids = all.filter((h) => h !== accent && lum(h) >= 0.12 && lum(h) <= 0.6 && chroma(h) > 0.08);
  const lights = all.filter((h) => lum(h) > 0.6).sort((a, b) => lum(a) - lum(b));
  const neutral = all.find((h) => chroma(h) < 0.06 && lum(h) > 0.25 && lum(h) < 0.6) || '#B5B8B9';
  const fonts: KitFont[] = kit.fonts || [];
  const headFont = fonts.find((f) => !/mono/i.test(f.family)) || fonts[0];
  const monoFont = fonts.find((f) => /mono/i.test(f.family));
  const hs = headFont?.styles?.[0];
  const logos = kit.logos || [];
  const ratio = (l: KitLogo) => l.w / l.h;
  return {
    brand: kit.brand || '',
    dark, light, accent, deep, neutral, mids: mids.length ? mids : [accent], lights: lights.length ? lights : [light],
    head: { family: headFont?.family || 'Inter', weight: hs?.weight || 400, ls: hs?.ls ?? -0.02 },
    mono: monoFont ? { family: monoFont.family, weight: monoFont.weights?.[0] || 400 } : null,
    sign: logos.find((l) => l.id === 'sign') || logos.find((l) => ratio(l) > 0.6 && ratio(l) < 1.6),
    mark: logos.find((l) => l.id === 'logo') || [...logos].sort((a, b) => ratio(b) - ratio(a)).find((l) => ratio(l) > 2),
  };
}

// ---------- random ----------
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length) % xs.length];

// ---------- text ----------
let ctx: CanvasRenderingContext2D | null = null;
type F = { family: string; weight: number; ls: number };
const fontStack = (family: string) => `'${family.replace(/'/g, '')}', ${/mono/i.test(family) ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`;
function measure(t: string, size: number, f: F) {
  ctx ||= document.createElement('canvas').getContext('2d');
  if (!ctx) return t.length * size * 0.55;
  ctx.font = `${f.weight} ${size}px ${fontStack(f.family)}`;
  return ctx.measureText(t).width + f.ls * size * Math.max(0, [...t].length - 1);
}
function wrap(text: string, size: number, maxW: number, f: F) {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w;
      if (!line || measure(t, size, f) <= maxW) line = t;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}
type Fit = { size: number; lines: string[]; w: number; h: number };
/** Largest size that fits the box, lines balanced so the last one is not an orphan. */
function fit(text: string, box: { w: number; h: number }, f: F, o: { max: number; min: number; lh: number; maxLines?: number }): Fit {
  let size = o.max, lines = wrap(text, size, box.w, f);
  const widest = (ls: string[], s: number) => Math.max(...ls.map((l) => measure(l, s, f)));
  while (size > o.min && (widest(lines, size) > box.w || lines.length * size * o.lh > box.h || (o.maxLines && lines.length > o.maxLines))) {
    size = Math.max(o.min, Math.floor(size * 0.95));
    lines = wrap(text, size, box.w, f);
  }
  if (lines.length > 1) {
    let lo = box.w * 0.5, hi = box.w;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (wrap(text, size, mid, f).length > lines.length) lo = mid; else hi = mid; }
    lines = wrap(text, size, hi, f);
  }
  return { size, lines, w: widest(lines, size), h: (lines.length - 1) * size * o.lh + size * 1.0 };
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => Math.round(v * 10) / 10;
/** A text block by its top edge (first line's cap height starts near y). */
function text(lines: string[], x: number, top: number, size: number, lh: number, fill: string, f: F, anchor: 'start' | 'middle' | 'end' = 'start', upper = false) {
  const base = top + size * 0.78;
  return `<text x="${n(x)}" y="${n(base)}" font-family="${esc(fontStack(f.family))}" font-size="${n(size)}" font-weight="${f.weight}" letter-spacing="${n(f.ls * size)}" fill="${fill}" text-anchor="${anchor}">${lines.map((l, i) => `<tspan x="${n(x)}"${i ? ` dy="${n(size * lh)}"` : ''}>${esc(upper ? l.toUpperCase() : l)}</tspan>`).join('')}</text>`;
}

// ---------- shapes ----------
function logo(l: KitLogo | undefined, color: string, x: number, y: number, h: number, fallback: string, R: Roles) {
  if (!l) return text([fallback], x, y - h * 0.1, h * 1.1, 1, color, { ...R.head, weight: 500 });
  const s = h / l.h;
  const inner = l.mono === false ? l.svg : l.svg.replaceAll('currentColor', color);
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${s.toFixed(4)})">${inner}</g>`;
}
const logoW = (l: KitLogo | undefined, h: number, fallback: string, R: Roles) => (l ? (l.w / l.h) * h : measure(fallback, h * 1.1, { ...R.head, weight: 500 }));

/** A cluster of pixel squares growing from a corner (dx, dy = direction into the canvas). */
type Box = { x: number; y: number; w: number; h: number };
function cluster(r: () => number, x: number, y: number, cell: number, dx: 1 | -1, dy: 1 | -1, count: number, colors: string[], max = 5, avoid: Box[] = []) {
  const at = (i: number, j: number) => [dx > 0 ? x + i * cell : x - (i + 1) * cell, dy > 0 ? y + j * cell : y - (j + 1) * cell];
  const free = (i: number, j: number) => { const [px, py] = at(i, j), m = cell * 0.35; return !avoid.some((b) => px + cell > b.x - m && px < b.x + b.w + m && py + cell > b.y - m && py < b.y + b.h + m); };
  const cells = new Map<string, [number, number]>();
  let cx = 0, cy = 0;
  cells.set('0,0', [0, 0]);
  const steps: [number, number, number][] = [[1, 1, 0.34], [1, 0, 0.24], [0, 1, 0.24], [1, -1, 0.09], [-1, 1, 0.09]];
  let guard = 0;
  while (cells.size < count && guard++ < 200) {
    if (r() < 0.18) { const all = [...cells.values()]; [cx, cy] = all[Math.floor(r() * all.length)]; }
    let t = r(), s = steps[0];
    for (const st of steps) { if ((t -= st[2]) <= 0) { s = st; break; } }
    const nx = Math.min(max, Math.max(0, cx + s[0])), ny = Math.min(max, Math.max(0, cy + s[1]));
    if (!free(nx, ny)) continue;
    cx = nx; cy = ny;
    cells.set(`${nx},${ny}`, [nx, ny]);
  }
  return [...cells.values()].filter(([i, j]) => free(i, j)).map(([i, j]) => {
    const [px, py] = at(i, j);
    return `<rect x="${n(px)}" y="${n(py)}" width="${n(cell)}" height="${n(cell)}" fill="${colors[r() < 0.55 ? 0 : 1]}"/>`;
  }).join('');
}

// ---------- generative art: fields of arrows ----------
// Modelled on the SuperPlane generative-art set: one vortex, twin vortex ("eye"), crescent swirl, warp
// (stars rushing out), school (a loose swarm) and globe (flow over a sphere seen from above).
export const PATTERNS = [
  { id: 'vortex', name: 'Vortex' },
  { id: 'eye', name: 'Twin' },
  { id: 'crescent', name: 'Crescent' },
  { id: 'warp', name: 'Warp' },
  { id: 'school', name: 'School' },
  { id: 'globe', name: 'Globe' },
];
type Arrow = { x: number; y: number; a: number; len: number; w: number };
type Art = { arrows: Arrow[]; under?: string };
const ccw = (dx: number, dy: number) => Math.atan2(-dx, dy); // counter-clockwise tangent on screen

function art(pattern: string, r: () => number, W: number, H: number, u: number, bg: string, ink: string): Art {
  const m = Math.min(W, H), A: Arrow[] = [];
  const grid = (gap: number, fn: (x: number, y: number) => void) => {
    for (let y = -gap; y < H + gap; y += gap) for (let x = -gap; x < W + gap; x += gap) fn(x + (r() - 0.5) * gap * 0.9, y + (r() - 0.5) * gap * 0.9);
  };
  if (pattern === 'eye') {
    const tall = H > W * 1.2;
    const cs = tall ? [[W * 0.5, H * 0.36], [W * 0.5, H * 0.64]] : [[W * 0.32, H * 0.5], [W * 0.68, H * 0.5]];
    grid(46 * u, (x, y) => {
      let vx = 0, vy = 0, near = 1e9;
      for (const [cx, cy] of cs) {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, k = 1 / (d + 0.12 * m);
        vx += (dy / d) * k; vy += (-dx / d) * k; near = Math.min(near, d);
      }
      const noise = near < 0.12 * m ? 1.6 : 0.18;
      A.push({ x, y, a: Math.atan2(vy, vx) + Math.PI + (r() - 0.5) * noise, len: (36 + r() * 12) * u, w: 2.4 * u });
    });
    return { arrows: A };
  }
  if (pattern === 'crescent') {
    const cx = W * (0.55 + r() * 0.2), cy = H * (0.4 + r() * 0.2), R1 = Math.max(W, H) * 0.62;
    const turn = r() * Math.PI * 2, off = R1 * 0.6;
    const hx = cx + Math.cos(turn) * off, hy = cy + Math.sin(turn) * off, R2 = R1 * 0.66;
    grid(27 * u, (x, y) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d > R1 || Math.hypot(x - hx, y - hy) < R2 || d < 30 * u) return;
      if (r() > 0.3 + 0.7 * Math.min(1, d / (R1 * 0.7))) return;
      A.push({ x, y, a: ccw(dx, dy) - 0.12 + (r() - 0.5) * (d < R1 * 0.2 ? 0.9 : 0.16), len: (32 + r() * 8) * u, w: 2.2 * u });
    });
    return { arrows: A };
  }
  if (pattern === 'warp') {
    const cx = W * (0.4 + r() * 0.2), cy = H * (0.4 + r() * 0.2), Rm = Math.hypot(W, H) * 0.62;
    for (let i = 0; i < 950; i++) {
      const t = r() * Math.PI * 2, f = Math.pow(r(), 0.55), d = f * Rm;
      const x = cx + Math.cos(t) * d, y = cy + Math.sin(t) * d;
      if (x < -40 * u || y < -40 * u || x > W + 40 * u || y > H + 40 * u) continue;
      A.push({ x, y, a: t + (r() - 0.5) * 0.05, len: (4 + 170 * f ** 2.2 * (0.4 + r() * 0.9)) * u, w: (1 + 6.5 * f ** 2.6) * u });
    }
    return { arrows: A };
  }
  if (pattern === 'school') {
    const cx = W * (0.38 + r() * 0.24), cy = H * (0.42 + r() * 0.18), s = m * 0.2, base = r() * Math.PI * 2;
    for (let i = 0; i < 300; i++) {
      const t = r() * Math.PI * 2, d = s * Math.sqrt(-2 * Math.log(1 - r() * 0.98)) * 0.75;
      A.push({ x: cx + Math.cos(t) * d, y: cy + Math.sin(t) * d, a: base + (r() - 0.5) * 2.6, len: (30 + r() * 14) * u, w: 2.2 * u });
    }
    return { arrows: A };
  }
  if (pattern === 'globe') {
    const R = Math.max(W * 0.62, H * 0.45), cx = W * 0.5, cy = H * 0.98 + R * 0.08, tilt = 0.55;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const proj = (p: number[]) => { const y2 = p[1] * ct - p[2] * st, z2 = p[1] * st + p[2] * ct; return [cx + R * p[0], cy - R * y2, z2]; };
    const dir = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < 2600; i++) {
      const lat = Math.asin(2 * r() - 1), lon = r() * Math.PI * 2;
      const p = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
      const [X, Y, Z] = proj(p);
      if (Z < 0.05 || X < -20 * u || X > W + 20 * u || Y < -20 * u || Y > H + 20 * u) continue;
      const band = dir * (0.55 + 0.45 * Math.sin(lat * 5 + 1));
      const e = [Math.cos(lon), 0, -Math.sin(lon)], step = 0.085 * band;
      const q = [p[0] + e[0] * step, p[1], p[2] + e[2] * step];
      const [X2, Y2] = proj(q);
      const len = Math.hypot(X2 - X, Y2 - Y);
      if (len < 8 * u || r() > 0.25 + 0.75 * (1 - Z)) continue; // thinner in the middle, dense near the rim like the brand frames
      A.push({ x: X, y: Y, a: Math.atan2(Y2 - Y, X2 - X), len, w: 2.4 * u });
    }
    const shade = lum(bg) < 0.2 ? ink : '#000000';
    return { arrows: A, under: `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="${shade}" opacity="0.06"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="none" stroke="${ink}" stroke-opacity="0.18" stroke-width="${n(1.5 * u)}"/>` };
  }
  // vortex
  const cx = W * (0.5 + r() * 0.2), cy = H * (0.36 + r() * 0.2);
  grid(74 * u, (x, y) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d < 150 * u || r() < 0.12) return;
    A.push({ x, y, a: Math.atan2(dy, dx) + Math.PI / 2 + 0.28 + (r() - 0.5) * 0.22, len: (54 + Math.min(1, d / (700 * u)) * 58) * u, w: 3.4 * u });
  });
  return { arrows: A };
}

/** Arrows as a few paths (grouped by stroke width), skipping a soft-edged zone around the text. */
function drawArt(a: Art, color: string, u: number, r: () => number, avoid: Box[] = []) {
  const edge = 70 * u;
  const outside = (x: number, y: number) => {
    let d = Infinity;
    for (const b of avoid) d = Math.min(d, Math.max(b.x - x, x - b.x - b.w, b.y - y, y - b.y - b.h));
    return d;
  };
  const groups = new Map<number, { l: string; h: string }>();
  for (const A of a.arrows) {
    const ex = A.x + Math.cos(A.a) * A.len, ey = A.y + Math.sin(A.a) * A.len;
    if (avoid.length) { const d = Math.min(outside(A.x, A.y), outside(ex, ey)); if (d < 0 || (d < edge && r() > d / edge)) continue; }
    const hs = Math.min(A.len * 0.5, Math.max(9 * u, A.w * 4.6)), back = A.a + Math.PI;
    const k = Math.round((A.w / u) * 2) / 2;
    const g = groups.get(k) || { l: '', h: '' };
    g.l += `M${n(A.x)} ${n(A.y)}L${n(ex - Math.cos(A.a) * hs * 0.5)} ${n(ey - Math.sin(A.a) * hs * 0.5)}`;
    g.h += `M${n(ex)} ${n(ey)}L${n(ex + Math.cos(back + 0.36) * hs)} ${n(ey + Math.sin(back + 0.36) * hs)}L${n(ex + Math.cos(back - 0.36) * hs)} ${n(ey + Math.sin(back - 0.36) * hs)}Z`;
    groups.set(k, g);
  }
  let out = a.under || '';
  for (const [k, g] of groups) out += `<path d="${g.l}" stroke="${color}" stroke-width="${n(k * u)}" stroke-linecap="round" fill="none" opacity="0.92"/><path d="${g.h}" fill="${color}" opacity="0.92"/>`;
  return out;
}

const frame = (W: number, H: number, u: number, color: string) => {
  const i = 30 * u;
  return `<rect x="${n(i)}" y="${n(i)}" width="${n(W - 2 * i)}" height="${n(H - 2 * i)}" rx="${n(10 * u)}" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="${n(2 * u)}"/>`;
};
const onBg = (bg: string, R: Roles) => (contrast(bg, R.dark) >= contrast(bg, R.light) ? R.dark : R.light);

// ---------- copy helpers ----------
export const numberIn = (s: string) => s.match(/[$€£]?\d[\d.,]*\s?(?:%|[kKmMbB]\b|x\b|\+)?/)?.[0]?.trim() || '';
function stepsOf(s: string, perLine = 10) {
  const raw = s.split(/\s*(?:→|->|\n|\/|,|;|\s-\s|\s–\s)\s*/).map((p) => p.trim()).filter(Boolean);
  const chunk = (t: string) => {
    const words = t.split(/\s+/).filter(Boolean);
    const max = Math.max(perLine, ...words.map((w) => w.length));
    const out: string[] = [];
    for (const w of words) { const last = out[out.length - 1]; if (last && `${last} ${w}`.length <= max) out[out.length - 1] = `${last} ${w}`; else out.push(w); }
    return out;
  };
  const items: string[] = [];
  let after = -1;
  raw.forEach((item, k) => { if (k === 1) after = items.length; items.push(...chunk(item)); });
  if (!items.length) items.push('Headline');
  const cnt = Math.min(items.length, 8);
  // before → after: point at the "after"; a list of steps: point at the middle one
  const active = raw.length === 2 && after >= 0 ? Math.min(after, cnt - 1) : Math.floor((cnt - 1) / 2);
  return { items: items.slice(0, cnt), active, list: raw.length >= 3 };
}

// ---------- layouts ----------
export type Options = { pattern?: string };
type L = { W: number; H: number; u: number; pad: number; r: () => number; R: Roles; c: Copy; uid: string; wide: boolean; tall: boolean; o: Options };

function statement({ W, H, u, pad, r, R, c, wide, tall }: L) {
  const bg = pick(r, [...R.mids, R.accent, ...R.mids]);
  const ink = onBg(bg, R);
  const px = bg === R.accent ? [R.mids[0] === R.accent ? R.dark : R.mids[0], R.neutral] : [R.accent, R.neutral];
  const cell = (wide ? 72 : 84) * u;
  const left = wide ? W * 0.36 : W * 0.2;
  const boxW = W - pad - left;
  const f = fit(c.headline, { w: boxW, h: (tall ? H * 0.42 : H * 0.44) }, R.head, { max: 132 * u, min: 40 * u, lh: 1.04 });
  const x = W - pad - f.w;
  const top = H - pad - f.h;
  let out = `<rect width="${W}" height="${H}" fill="${bg}"/>${frame(W, H, u, R.light)}`;
  out += cluster(r, 64 * u, 64 * u, cell, 1, 1, 7 + Math.floor(r() * 4), px, 4, [{ x, y: top - 70 * u, w: f.w, h: f.h + 70 * u }]);
  if (c.label && R.mono) out += text([c.label], x, top - 62 * u, 28 * u, 1, ink, { ...R.mono, ls: 0.04 }, 'start', true);
  out += text(f.lines, x, top, f.size, 1.04, ink, R.head);
  return out;
}

function number({ W, H, u, pad, r, R, c, wide, tall }: L) {
  const fig = c.number || numberIn(c.headline);
  const bg = pick(r, [...R.lights, ...R.mids]);
  const ink = onBg(bg, R);
  const px = [R.accent, bg === R.neutral ? R.dark : R.neutral];
  const cell = 42 * u;
  const rest = c.headline.replace(fig, '').replace(/\s{2,}/g, ' ').trim();
  const sub = rest.split(/\s+/).length >= 2 ? rest : '';
  const nf = fit(fig, { w: W * (wide ? 0.55 : 0.72), h: H * 0.34 }, { ...R.head, ls: -0.03 }, { max: 330 * u, min: 60 * u, lh: 1 });
  const sf = sub ? fit(sub, { w: W * (wide ? 0.6 : 0.7), h: H * 0.16 }, R.head, { max: (tall ? 66 : 54) * u, min: 26 * u, lh: 1.15 }) : null;
  const gap = 36 * u;
  const total = nf.size * 0.95 + (sf ? gap + sf.h : 0);
  const top = (H - total) / 2;
  let out = `<rect width="${W}" height="${H}" fill="${bg}"/>${frame(W, H, u, R.light)}`;
  const tw = Math.max(nf.w, sf?.w || 0);
  const keep = [{ x: (W - tw) / 2, y: top - (c.label ? 70 * u : 0), w: tw, h: total + (c.label ? 70 * u : 0) }];
  out += cluster(r, W - 140 * u, 30 * u, cell, -1, 1, 11, px, 5, keep);
  out += cluster(r, 50 * u, H - 30 * u, cell, 1, -1, 10, px, 5, keep);
  out += cluster(r, W - 30 * u, H - 30 * u, cell, -1, -1, 11, px, 5, keep);
  if (c.label && R.mono) out += text([c.label], W / 2, top - 66 * u, 28 * u, 1, ink, { ...R.mono, ls: 0.06 }, 'middle', true);
  out += text([fig], W / 2, top - nf.size * 0.05, nf.size, 1, ink, { ...R.head, ls: -0.03 }, 'middle');
  if (sf) out += text(sf.lines, W / 2, top + nf.size * 0.95 + gap, sf.size, 1.15, ink, R.head, 'middle');
  return out;
}

function steps({ W, H, u, r, R, c, wide }: L) {
  const st = stepsOf(c.headline, Math.round(Math.max(10, (10 * W) / H))), items = st.items;
  const bg = pick(r, [...R.mids, R.deep]);
  const ink = bg === R.deep ? R.light : (lum(bg) < 0.5 ? (R.lights[0] || R.light) : R.dark);
  const arrowC = bg === R.deep ? R.accent : (R.deep !== R.dark ? R.deep : R.dark);
  const active = Math.min(items.length - 1, st.active + (st.list && r() < 0.3 ? 1 : 0));
  const left = W * (wide ? 0.22 : 0.16);
  const widest = Math.max(...items.map((s) => measure(s, 100, R.head)));
  const byWidth = ((W - left - 40 * u) / widest) * 100;
  // the whole stack fits inside the frame; only very long lists bleed off the edges, centred on the arrow
  const block = (k: number) => ((items.length - 1) * 0.98 + 0.95) * k;
  const fits = Math.min(byWidth, (H * 0.86) / block(1), 300 * u);
  const bleed = fits < 70 * u;
  const size = bleed ? Math.max(40 * u, Math.min(H / 4.3, byWidth, 300 * u)) : fits;
  const first = (H - block(size)) / 2 - size * 0.06;
  const top = (i: number) => (bleed ? H / 2 - size * 0.43 + (i - active) * size * 0.98 : first + i * size * 0.98);
  let out = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  items.forEach((s, i) => { out += text([s], left, top(i), size, 1, ink, R.head); });
  const aw = measure('→', size, R.head);
  out += text(['→'], left - aw - size * 0.04, top(active), size, 1, arrowC, R.head);
  return out;
}

function flow({ W, H, u, pad, r, R, c, uid, wide, o }: L) {
  const pattern = o.pattern || pick(r, PATTERNS.map((p) => p.id));
  const bg = pick(r, [...R.mids, R.deep, R.mids[0]]);
  const arrows = R.lights[0] || R.light;
  const cardW = Math.min(wide ? W * 0.46 : W * 0.72, 800 * u);
  const ip = 34 * u;
  const tf = fit(c.headline, { w: cardW - ip * 2, h: H * 0.3 }, { ...R.head, weight: Math.max(R.head.weight, 500), ls: -0.01 }, { max: 80 * u, min: 26 * u, lh: 1.1 });
  const badge = 64 * u;
  const pill = c.label ? 60 * u : 0;
  const cardH = ip + badge + 26 * u + tf.h + (pill ? 30 * u + pill : 0) + ip;
  const x = wide ? W * 0.1 : (W - cardW) / 2 - W * 0.06;
  const y = (H - cardH) / 2;
  const white = '#FFFFFF';
  let out = `<defs><filter id="sh-${uid}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="${n(14 * u)}" stdDeviation="${n(22 * u)}" flood-color="#000" flood-opacity="0.18"/></filter></defs>`;
  out += `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  out += drawArt(art(pattern, r, W, H, u, bg, arrows), arrows, u, r);
  // a second card peeking from behind, like a stack of runs
  out += `<rect x="${n(x + 40 * u)}" y="${n(y - 70 * u)}" width="${n(cardW * 0.8)}" height="${n(cardH)}" rx="${n(16 * u)}" fill="${white}" opacity="0.55"/>`;
  out += `<g filter="url(#sh-${uid})"><rect x="${n(x)}" y="${n(y)}" width="${n(cardW)}" height="${n(cardH)}" rx="${n(18 * u)}" fill="${white}"/></g>`;
  // header: brand badge + brand name
  out += `<circle cx="${n(x + ip + badge / 2)}" cy="${n(y + ip + badge / 2)}" r="${n(badge / 2)}" fill="${R.dark}"/>`;
  if (R.sign) { const sh = badge * 0.56, sw = (R.sign.w / R.sign.h) * sh; out += logo(R.sign, R.light, x + ip + (badge - sw) / 2, y + ip + (badge - sh) / 2, sh, '', R); }
  else out += text([R.brand.slice(0, 1)], x + ip + badge / 2, y + ip + badge * 0.18, badge * 0.6, 1, R.light, R.head, 'middle');
  out += text([R.brand], x + ip + badge + 18 * u, y + ip + badge / 2 - 17 * u, 34 * u, 1, '#6B6F72', { ...R.head, weight: Math.max(R.head.weight, 500), ls: 0 });
  out += text(tf.lines, x + ip, y + ip + badge + 26 * u, tf.size, 1.1, R.dark, { ...R.head, weight: Math.max(R.head.weight, 500), ls: -0.01 });
  if (pill && c.label) {
    const f = R.mono ? { ...R.mono, ls: 0.06 } : { ...R.head, ls: 0.06 };
    const tw = measure(c.label.toUpperCase(), 24 * u, f) + 36 * u;
    const py = y + cardH - ip - pill;
    out += `<rect x="${n(x + ip)}" y="${n(py + 8 * u)}" width="${n(tw)}" height="${n(pill - 16 * u)}" rx="${n(6 * u)}" fill="none" stroke="${R.mids[R.mids.length - 1]}" stroke-width="${n(2 * u)}"/>`;
    out += text([c.label], x + ip + 18 * u, py + 8 * u + (pill - 16 * u - 24 * u) / 2 + 1 * u, 24 * u, 1, R.mids[R.mids.length - 1], f, 'start', true);
  }
  void pad;
  return out;
}

function field({ W, H, u, pad, r, R, c, wide, tall, o }: L) {
  const pattern = o.pattern || pick(r, PATTERNS.map((p) => p.id));
  const bg = pick(r, [R.dark, R.dark, R.accent, R.deep]);
  const ink = bg === R.accent ? R.dark : (R.lights[0] || R.light);
  const kick = c.label ? 56 * u : 0;
  const tf = fit(c.headline, { w: W * (wide ? 0.6 : 0.82), h: H * (tall ? 0.26 : 0.34) }, R.head, { max: 118 * u, min: 36 * u, lh: 1.04 });
  const markH = 36 * u, mark = R.mark || R.sign;
  const mw = logoW(mark, markH, R.brand, R);
  // headline top-left for fields that gather low (globe), otherwise bottom-left
  const low = pattern === 'globe';
  const top = low ? pad + kick : H - pad - tf.h;
  const avoid: Box[] = [{ x: pad - 10 * u, y: top - kick - 10 * u, w: tf.w + 20 * u, h: tf.h + kick + 20 * u }, { x: low ? W - pad - mw - 10 * u : pad - 10 * u, y: low ? H - pad - markH - 10 * u : pad - 10 * u, w: mw + 20 * u, h: markH + 20 * u }];
  let out = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  out += drawArt(art(pattern, r, W, H, u, bg, ink), ink, u, r, avoid);
  if (kick) out += text([c.label!], pad, top - kick, 26 * u, 1, ink, R.mono ? { ...R.mono, ls: 0.06 } : { ...R.head, ls: 0.06 }, 'start', true);
  out += text(tf.lines, pad, top, tf.size, 1.04, ink, R.head);
  out += logo(mark, ink, low ? W - pad - mw : pad, low ? H - pad - markH : pad, markH, R.brand, R);
  return out;
}

function icon({ W, H, u, pad, r, R, c, wide, tall }: L) {
  const bg = pick(r, [R.accent, R.accent, ...R.mids]);
  const sq = [bg === R.accent ? (R.mids.find((m) => m !== bg) || R.light) : R.accent, R.neutral];
  const ink = onBg(bg, R);
  const cell = 90 * u;
  const size = (wide ? 250 : 300) * u;
  const hasText = !!c.headline.trim();
  const tf = hasText ? fit(c.headline, { w: wide ? W * 0.42 : W * 0.78, h: wide ? H * 0.5 : H * 0.22 }, R.head, { max: (wide ? 92 : tall ? 84 : 68) * u, min: 28 * u, lh: 1.08 }) : null;
  let ix: number, iy: number, out = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  if (wide) {
    ix = W * 0.2; iy = (H - size) / 2;
  } else {
    ix = (W - size) / 2;
    iy = hasText && tf ? (H - size - 70 * u - tf.h) / 2 : (H - size) / 2;
  }
  const keep: Box[] = [{ x: ix, y: iy, w: size, h: size }];
  if (tf) keep.push(wide ? { x: ix + size + 70 * u, y: (H - tf.h) / 2, w: tf.w, h: tf.h } : { x: (W - tf.w) / 2, y: iy + size + 70 * u, w: tf.w, h: tf.h });
  out += cluster(r, W, 0, cell, -1, 1, 12, sq, 5, keep);
  out += cluster(r, 0, H, cell, 1, -1, 8, sq, 3, keep);
  out += `<rect x="${n(ix)}" y="${n(iy)}" width="${n(size)}" height="${n(size)}" rx="${n(size * 0.24)}" fill="${R.dark}"/>`;
  const lh = size * 0.5;
  const lw = logoW(R.sign, lh, R.brand.slice(0, 1), R);
  out += R.sign ? logo(R.sign, R.light, ix + (size - lw) / 2, iy + (size - lh) / 2, lh, '', R) : text([R.brand.slice(0, 1)], ix + size / 2, iy + size * 0.25, size * 0.5, 1, R.light, R.head, 'middle');
  if (tf) {
    if (wide) out += text(tf.lines, ix + size + 70 * u, (H - tf.h) / 2, tf.size, 1.08, ink, R.head);
    else out += text(tf.lines, W / 2, iy + size + 70 * u, tf.size, 1.08, ink, R.head, 'middle');
  }
  void pad;
  return out;
}

function motion({ W, H, u, pad, r, R, c, uid, wide, tall }: L) {
  const bg = pick(r, R.lights);
  const cols = [R.mids[R.mids.length - 1], R.neutral];
  const ink = onBg(bg, R);
  const cell = 150 * u;
  const kick = c.label && R.mono ? 56 * u : 0;
  const tf = fit(c.headline, { w: W * (wide ? 0.55 : 0.8), h: H * (wide ? 0.34 : tall ? 0.24 : 0.3) }, R.head, { max: (tall ? 120 : 104) * u, min: 34 * u, lh: 1.05 });
  const textBottom = pad + kick + tf.h;
  let out = `<defs><filter id="mb-${uid}" x="-60%" y="-10%" width="220%" height="120%"><feGaussianBlur stdDeviation="${n(26 * u)} 0"/></filter></defs><rect width="${W}" height="${H}" fill="${bg}"/>`;
  // a staircase of squares rising from the bottom-left
  const ncols = Math.ceil((W * (wide ? 0.55 : 0.75)) / cell);
  const heights: number[] = [];
  let height = Math.max(1, Math.min(5, Math.floor((H - textBottom - 60 * u) / cell)));
  for (let i = 0; i < ncols; i++) {
    heights.push(height);
    for (let j = 0; j < height; j++) {
      if (r() < 0.22 && j > 0) continue;
      const fill = i === 1 && j === 1 ? R.accent : pick(r, cols);
      out += `<rect x="${n(i * cell)}" y="${n(H - (j + 1) * cell)}" width="${n(cell - 1.5 * u)}" height="${n(cell - 1.5 * u)}" fill="${fill}"/>`;
    }
    if (r() < 0.65) height = Math.max(1, height - 1);
  }
  // blurred squares in motion on the right, clear of the headline and the staircase
  const under = (x: number, w: number) => { let h = 0; heights.forEach((hh, i) => { if (i * cell < x + w + 40 * u && (i + 1) * cell > x - 40 * u) h = Math.max(h, hh); }); return h * cell; };
  for (let k = 0; k < 3; k++) {
    const size = cell * (k === 1 ? 1.4 : 1);
    const x = W * (wide ? 0.62 : 0.66) + r() * W * 0.14;
    const lo = textBottom + 50 * u, hi = H - under(x, size) - size - 30 * u;
    if (hi <= lo) continue;
    const y = lo + (hi - lo) * ((k + r() * 0.6) / 3);
    out += `<rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" fill="${pick(r, cols)}" filter="url(#mb-${uid})"/>`;
  }
  if (kick) out += text([c.label!], pad, pad, 26 * u, 1, ink, { ...R.mono!, ls: 0.06 }, 'start', true);
  out += text(tf.lines, pad, pad + kick, tf.size, 1.05, ink, R.head);
  return out;
}

function label({ W, H, u, pad, r, R, c, wide }: L) {
  const bg = pick(r, [R.deep, R.deep, R.dark]);
  const ink = R.light;
  const kick = (c.label || R.brand).trim();
  const kickC = [...R.mids].reverse().find((m) => contrast(m, bg) > 3) || R.accent;
  const mono = R.mono ? { ...R.mono, ls: 0.08 } : { ...R.head, ls: 0.08 };
  const markH = 40 * u;
  const tf = fit(c.headline, { w: W - pad * 2 - (wide ? W * 0.15 : 0), h: H - pad * 2 - 200 * u }, R.head, { max: 128 * u, min: 36 * u, lh: 1.04 });
  let out = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  out += `<rect x="${n(pad)}" y="${n(pad + 6 * u)}" width="${n(14 * u)}" height="${n(14 * u)}" fill="${R.accent}"/>`;
  out += text([kick], pad + 30 * u, pad, 26 * u, 1, kickC, mono, 'start', true);
  out += text(tf.lines, pad, (H - tf.h) / 2 + (wide ? 10 * u : 0), tf.size, 1.04, ink, R.head);
  out += logo(R.mark || R.sign, ink, pad, H - pad - markH, markH, R.brand, R);
  const as = 84 * u, aw = measure('→', as, R.head);
  out += text(['→'], W - pad - aw, H - pad - as * 0.8, as, 1, R.accent, R.head);
  void r;
  return out;
}

function photo({ W, H, u, pad, R, c, uid }: L) {
  const ink = '#FFFFFF';
  const markH = 34 * u;
  const tf = fit(c.headline, { w: W - pad * 2, h: H * 0.36 }, R.head, { max: 112 * u, min: 34 * u, lh: 1.04 });
  let out = `<defs><linearGradient id="g-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.72"/></linearGradient></defs>`;
  out += `<rect width="${W}" height="${H}" fill="${R.dark}"/>`;
  if (c.image) out += `<image href="${c.image}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
  out += `<rect width="${W}" height="${H}" fill="url(#g-${uid})"/>`;
  out += logo(R.mark || R.sign, ink, pad, pad, markH, R.brand, R);
  if (c.label && R.mono) out += text([c.label], pad, H - pad - tf.h - 60 * u, 24 * u, 1, R.accent, { ...R.mono, ls: 0.06 }, 'start', true);
  out += text(tf.lines, pad, H - pad - tf.h, tf.size, 1.04, ink, R.head);
  return out;
}

const LAYOUTS: Record<string, (l: L) => string> = { statement, number, steps, flow, field, icon, motion, label, photo };

/** One banner as an SVG document. `fontCss` (embedded @font-face) is added for files and PNGs. */
export function render(variant: string, fmt: Format, R: Roles, c: Copy, seed: number, fontCss = '', o: Options = {}) {
  const { w: W, h: H } = fmt;
  const u = Math.min(W, H) / 1080;
  const wide = W / H > 1.4, tall = H / W > 1.4;
  const pad = (wide ? 64 : 76) * u;
  const uid = `${variant}-${fmt.id}-${seed}-${o.pattern || ''}`.replace(/[^a-z0-9-]/gi, '');
  const r = rng(hash(`${variant}:${seed}`));
  const body = LAYOUTS[variant]({ W, H, u, pad, r, R, c: { ...c, headline: c.headline.trim() || 'Your headline here' }, uid, wide, tall, o });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fontCss ? `<style>${fontCss}</style>` : ''}${body}</svg>`;
}

// ---------- fonts for files ----------
const cssCache = new Map<string, Promise<string>>();
const b64 = (buf: ArrayBuffer) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
/** Google Fonts CSS with the font files inlined, so SVG files and PNGs keep the brand type. */
export function embeddedFonts(fonts: KitFont[]): Promise<string> {
  const fams = fonts.filter((f) => f.google !== false).map((f) => `family=${f.family.replace(/ /g, '+')}${f.weights?.length ? `:wght@${[...f.weights].sort((a, b) => a - b).join(';')}` : ''}`);
  if (!fams.length) return Promise.resolve('');
  const href = `https://fonts.googleapis.com/css2?${fams.join('&')}&display=block`;
  if (!cssCache.has(href)) {
    cssCache.set(href, (async () => {
      const css = await (await fetch(href)).text();
      const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/);
      const keep = blocks.filter((b) => /\/\*\s*(latin|latin-ext|cyrillic|cyrillic-ext)\s*\*\//.test(b));
      let out = (keep.length ? keep : blocks).join('');
      const urls = [...new Set([...out.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
      const data = await Promise.all(urls.map(async (u) => [u, `data:font/woff2;base64,${b64(await (await fetch(u)).arrayBuffer())}`] as const));
      for (const [u, d] of data) out = out.replaceAll(u, d);
      return out;
    })().catch((e) => { cssCache.delete(href); throw e; }));
  }
  return cssCache.get(href)!;
}

export async function toPng(svg: string, w: number, h: number): Promise<Blob> {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await img.decode();
    await new Promise((ok) => setTimeout(ok, 60)); // let embedded fonts settle
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('PNG failed'))), 'image/png'));
  } finally { URL.revokeObjectURL(img.src); }
}
