// Competitor branding: palette, fonts and the social image from a company's own homepage and stylesheets.
// Cheap on purpose (one page + up to three stylesheets, single regex passes) so it runs per company per call.
import { decode, getText, metaOf } from './radar';

export const BRANDING_V = 1;
type Rgb = [number, number, number];

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
function hsl([r, g, b]: Rgb) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** oklch(L C H) → sRGB (Tailwind v4 and many modern sites define colours this way). */
function oklchToRgb(L: number, C: number, H: number): Rgb {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
  return lin.map((v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055)) as Rgb;
}
const num = (v: string, pct = 1) => (v.endsWith('%') ? (parseFloat(v) / 100) * pct : parseFloat(v));

const COLOR_RE = /#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)|hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)|oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)/gi;
function parseColors(css: string, weights: Map<string, number>, w = 1) {
  for (const m of css.matchAll(COLOR_RE)) {
    let rgb: Rgb | null = null, alpha = 1;
    if (m[1]) {
      const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
      rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    } else if (m[2]) { rgb = [+m[2], +m[3], +m[4]]; if (m[5]) alpha = num(m[5]); }
    else if (m[6]) { rgb = hslToRgb(+m[6], +m[7] / 100, +m[8] / 100); if (m[9]) alpha = num(m[9]); }
    else if (m[10]) { rgb = oklchToRgb(num(m[10]), m[11].endsWith('%') ? (parseFloat(m[11]) / 100) * 0.4 : +m[11], +m[12]); if (m[13]) alpha = num(m[13]); }
    if (!rgb || alpha < 0.6) continue;
    const hex = toHex(rgb);
    weights.set(hex, (weights.get(hex) || 0) + w);
  }
}

const GENERIC = /^(inherit|initial|unset|sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-[\w-]+|-apple-system|blinkmacsystemfont|segoe ui( \w+)?|roboto|helvetica( neue)?|arial|noto (sans|color emoji)|apple color emoji|segoe ui emoji|segoe ui symbol|emoji|math|var\(.*|times( new roman)?|georgia|courier( new)?|menlo|monaco|consolas|liberation mono|sfmono-regular|sf mono|ubuntu|cantarell|fira sans|droid sans|oxygen|android emoji|emojisymbols|emojione mozilla|twemoji mozilla|icons?|.*icons?|fontawesome.*|font awesome.*|swiper-icons|slick)$/i;
/** "__Inter_d65c78" (next/font) → "Inter"; "Inter Variable" → "Inter". */
function cleanFamily(raw: string) {
  if (/^\s*var\(/i.test(raw)) return '';
  let f = raw.trim().replace(/[()]/g, '').replace(/^['"]|['"]$/g, '').trim();
  const nf = f.match(/^__(.+?)_[0-9a-f]{5,}$/i);
  if (nf) f = nf[1].replace(/_/g, ' ');
  f = f.replace(/\s+(variable|var|vf|web|webfont|display|text)$/i, '').replace(/[-_](regular|variable)$/i, '');
  if (!f || /fallback|icon|symbol|emoji|katex|mathjax/i.test(f) || /^[\d\s.]+$/.test(f) || f.length > 40 || GENERIC.test(f)) return '';
  return f;
}
function parseFonts(css: string, counts: Map<string, number>) {
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1].split(',').map(cleanFamily).find(Boolean);
    if (first) counts.set(first, (counts.get(first) || 0) + 1);
  }
  // --font-sans: "Inter", ... (Tailwind and design-token variables)
  for (const m of css.matchAll(/--font[\w-]*\s*:\s*([^;}{]+)/gi)) {
    const first = m[1].split(',').map(cleanFamily).find(Boolean);
    if (first) counts.set(first, (counts.get(first) || 0) + 3);
  }
}

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fromHex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Neutral = low chroma (greys, off-whites, near-blacks); these don't claim a hue on the wheel. */
export const isNeutral = (hex: string) => { const [r, g, b] = fromHex(hex); const { l } = hsl([r, g, b]); return (Math.max(r, g, b) - Math.min(r, g, b)) / 255 < 0.1 || l > 0.96 || l < 0.05; };
export const hueOf = (hex: string) => hsl(fromHex(hex));

/** Groups near-identical colours and returns the palette: chromatic accents first, then the main dark and light. */
function palette(weights: Map<string, number>) {
  const groups: { hex: string; rgb: Rgb; w: number }[] = [];
  for (const [hex, w] of [...weights].sort((a, b) => b[1] - a[1])) {
    const rgb = fromHex(hex);
    const g = groups.find((x) => dist(x.rgb, rgb) < 28);
    if (g) g.w += w; else groups.push({ hex, rgb, w });
  }
  const total = groups.reduce((a, g) => a + g.w, 0) || 1;
  const chroma = groups.filter((g) => !isNeutral(g.hex));
  const neutral = groups.filter((g) => isNeutral(g.hex));
  const chromaTotal = chroma.reduce((a, g) => a + g.w, 0) || 1;
  const accents = chroma.filter((g) => g.w / chromaTotal > 0.04).slice(0, 4);
  const dark = neutral.filter((g) => hsl(g.rgb).l < 0.35).sort((a, b) => b.w - a.w)[0];
  const light = neutral.filter((g) => hsl(g.rgb).l > 0.85).sort((a, b) => b.w - a.w)[0];
  const mid = neutral.filter((g) => g !== dark && g !== light).sort((a, b) => b.w - a.w)[0];
  const pick = [...accents.map((g) => ({ ...g, role: 'accent' })), ...[dark, light, mid].filter(Boolean).map((g) => ({ ...g!, role: 'neutral' }))];
  return pick.map((g) => ({ hex: g.hex, role: g.role as 'accent' | 'neutral', share: Math.round((g.w / total) * 1000) / 1000 }));
}

export async function brandingFor(url: string) {
  const home = await getText(url, 8000);
  if (!home) return null;
  const html = home.text.slice(0, 800_000);
  const base = home.url;
  const abs = (h: string) => { try { return new URL(decode(h), base).toString(); } catch { return ''; } };

  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const hrefOf = (l: string) => l.match(/href=["']([^"']+)["']/i)?.[1] || '';
  const google = links.map(hrefOf).filter((h) => /fonts\.googleapis\.com\/css/.test(h));
  const sheets = links.filter((l) => /rel=["']?(stylesheet|preload)["']?/i.test(l) && (/rel=["']?stylesheet/i.test(l) || /as=["']?style/i.test(l))).map(hrefOf).filter((h) => h && !/fonts\.googleapis/.test(h)).map(abs).filter(Boolean);
  const fetched = await Promise.all([...new Set(sheets)].slice(0, 3).map((u) => getText(u, 6000).then((r) => r?.text.slice(0, 350_000) || '').catch(() => '')));
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n').slice(0, 300_000);
  const styleAttrs = [...html.matchAll(/\sstyle=["']([^"']{4,300})["']/gi)].map((m) => m[1]).join(';').slice(0, 100_000);
  const css = `${inline}\n${fetched.join('\n')}`;

  const weights = new Map<string, number>();
  parseColors(css, weights);
  parseColors(styleAttrs, weights, 2);
  const theme = metaOf(html, 'theme-color');
  if (theme) parseColors(theme, weights, 40);
  for (const m of css.matchAll(/--[\w-]*(?:brand|primary|accent)[\w-]*\s*:\s*([^;}{]+)/gi)) parseColors(m[1], weights, 25);

  const fontCounts = new Map<string, number>();
  parseFonts(css, fontCounts);
  parseFonts(styleAttrs, fontCounts);
  for (const g of google) for (const m of decode(g).matchAll(/family=([^:&]+)/g)) {
    const f = cleanFamily(decodeURIComponent(m[1].replace(/\+/g, ' ')));
    if (f) fontCounts.set(f, (fontCounts.get(f) || 0) + 20);
  }
  const selfHosted = new Set([...css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*([^;}]+)/gi)].map((m) => cleanFamily(m[1])).filter(Boolean));
  const fonts = [...fontCounts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([family]) => ({
    family,
    source: google.some((g) => decodeURIComponent(g).replace(/\+/g, ' ').includes(family)) ? 'google' : selfHosted.has(family) ? 'self-hosted' : 'css',
  }));

  const og = metaOf(html, 'og:image') || metaOf(html, 'twitter:image');
  const pal = palette(weights);
  return {
    v: BRANDING_V,
    palette: pal,
    accent: pal.find((p) => p.role === 'accent')?.hex || null,
    fonts,
    image: og ? abs(og) : null,
    theme_color: theme || null,
    checked_at: Date.now(),
  };
}
