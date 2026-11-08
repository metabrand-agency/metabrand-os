// Brand kit: logos, colours, fonts and icons, ready to download (SVG, PNG at any size, ZIP) or copy.
// Logos and icons are stored as single-colour SVG masters; every colour and background variant is drawn
// from them, and PNGs are rendered in the browser. Works for any project: the agency adds SVGs, colours, fonts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { strToU8, zipSync } from 'fflate';
import { api } from '../api';
import { Btn, Card, Input, Label, Select } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { Shot } from './marketShared';

export type KitVariant = { color: string; bg?: string | null; file: string };
export type KitLogo = { id: string; name: string; w: number; h: number; frame?: { w: number; h: number }; svg: string; mono?: boolean; variants: KitVariant[] };
export type KitColor = { name: string; hex: string; rgb?: string; cmyk?: string; pantone?: string };
export type KitFont = { family: string; google?: boolean; weights?: number[]; use?: string; styles?: { name: string; tag?: string; weight: number; size: number; lh: number; ls: number; upper?: boolean; sample: string }[] };
export type KitIcon = { id: string; name: string; w: number; h: number; svg: string; mono?: boolean };
export type KitLink = { title: string; url: string; note?: string };
export type GuideSlide = { img: string; title?: string; text?: string; fit?: 'contain'; bg?: string };
export type GuideSection = { id: string; num: string; title: string; summary?: string; cover?: string; kit?: 'logos' | 'colours' | 'fonts' | 'icons'; video?: { src: string; title?: string; text?: string }; motion?: string[]; grid?: boolean; slides: GuideSlide[] };
export type Guide = { title: string; version?: string; intro?: string; hero?: { video?: string; poster?: string; bg?: string; caption?: string }; sections: GuideSection[] };
export type Kit = { guide?: Guide; links?: KitLink[]; brand: string; source?: string; logos: KitLogo[]; colors: { group: string; items: KitColor[] }[]; fonts: KitFont[]; icons: KitIcon[]; icon_color?: string };

// ---------- drawing and files ----------
const svgDoc = (inner: string, w: number, h: number, outW = w, outH = h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${w} ${h}" fill="none">${inner}</svg>`;

/** A logo variant as a standalone SVG: tight when transparent, on its designed frame when on a background. */
export function logoSvg(l: KitLogo, v: KitVariant, outW?: number) {
  const inner = l.mono === false ? l.svg : l.svg.replaceAll('currentColor', v.color);
  if (!v.bg) { const W = outW || l.w; return { svg: svgDoc(inner, l.w, l.h, W, Math.round((W / l.w) * l.h)), w: l.w, h: l.h }; }
  const F = l.frame || { w: Math.round(l.w * 1.25), h: Math.round(l.h + l.w * 0.25) };
  const W = outW || F.w;
  const body = `<rect width="${F.w}" height="${F.h}" fill="${v.bg}"/><g transform="translate(${((F.w - l.w) / 2).toFixed(2)} ${((F.h - l.h) / 2).toFixed(2)})">${inner}</g>`;
  return { svg: svgDoc(body, F.w, F.h, W, Math.round((W / F.w) * F.h)), w: F.w, h: F.h };
}
export const iconSvg = (i: KitIcon, color: string, outW?: number) => {
  const W = outW || i.w;
  return svgDoc(i.mono === false ? i.svg : i.svg.replaceAll('currentColor', color), i.w, i.h, W, Math.round((W / i.w) * i.h));
};
export const dataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

async function pngBlob(svg: string, w: number, h: number): Promise<Blob> {
  const img = new Image();
  img.src = dataUri(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('PNG failed'))), 'image/png'));
}
function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const svgBlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml' });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function logoPng(l: KitLogo, v: KitVariant, width: number) {
  const { svg, w, h } = logoSvg(l, v, width);
  return pngBlob(svg, width, Math.round((width / w) * h));
}
async function zip(files: Record<string, Uint8Array | string>, name: string) {
  const out: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) out[k] = typeof v === 'string' ? strToU8(v) : v;
  save(new Blob([zipSync(out, { level: 6 })], { type: 'application/zip' }), name);
}
const u8 = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

// ---------- colours ----------
const hexRgb = (hex: string) => { const n = parseInt(hex.replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const isLight = (hex: string) => { const [r, g, b] = hexRgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 160; };
const cssVars = (k: Kit) => `:root {\n${k.colors.flatMap((g) => g.items.map((c) => `  --${slug(k.brand)}-${slug(c.name)}: ${c.hex};`)).join('\n')}\n}\n`;
const tokens = (k: Kit) => JSON.stringify(Object.fromEntries(k.colors.map((g) => [slug(g.group), Object.fromEntries(g.items.map((c) => [slug(c.name), { value: c.hex, rgb: c.rgb, cmyk: c.cmyk, pantone: c.pantone }]))])), null, 2);

// ---------- fonts ----------
const googleCss = (fonts: KitFont[]) => {
  const fams = fonts.filter((f) => f.google !== false).map((f) => `family=${f.family.replace(/ /g, '+')}${f.weights?.length ? `:wght@${[...f.weights].sort().join(';')}` : ''}`);
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap` : '';
};
const embedCode = (fonts: KitFont[]) => {
  const href = googleCss(fonts);
  return `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="${href}" rel="stylesheet">`;
};
const fontCss = (f: KitFont) =>
  (f.styles || []).map((s) => `${s.tag || `.${slug(s.name)}`} {\n  font-family: "${f.family}", ${/mono/i.test(f.family) ? 'monospace' : 'sans-serif'};\n  font-weight: ${s.weight};\n  font-size: ${s.size}px;\n  line-height: ${s.lh};\n  letter-spacing: ${s.ls}em;${s.upper ? '\n  text-transform: uppercase;' : ''}\n}`).join('\n\n');
export function useGoogleFonts(fonts: KitFont[]) {
  const href = googleCss(fonts);
  useEffect(() => {
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }, [href]);
}

function useCopy() {
  const [copied, setCopied] = useState('');
  return {
    copied,
    copy: async (text: string, key: string) => { await navigator.clipboard.writeText(text).catch(() => {}); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1400); },
  };
}

// ---------- uploads (agency) ----------
/** Reads an SVG file into a master: root size, inner markup, single colour turned into currentColor. */
function parseSvg(text: string) {
  const clean = text.replace(/<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<foreignObject[\s\S]*?<\/foreignObject>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
  const root = clean.match(/<svg[^>]*>/i)?.[0] || '';
  const vb = root.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  const w = parseFloat(vb?.[1] || root.match(/width="([\d.]+)/)?.[1] || '100');
  const h = parseFloat(vb?.[2] || root.match(/height="([\d.]+)/)?.[1] || '100');
  let inner = clean.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim();
  const colors = [...new Set([...inner.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,8}|black|white|rgb\([^)]*\))"/gi)].map((m) => m[1].toLowerCase()))];
  const mono = colors.length === 1;
  if (mono) inner = inner.replace(/((?:fill|stroke)=")(#[0-9a-f]{3,8}|black|white|rgb\([^)]*\))"/gi, '$1currentColor"');
  const original = colors[0] === 'black' ? '#000000' : colors[0] === 'white' ? '#FFFFFF' : colors[0] || '#000000';
  return { w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100, svg: inner, mono, original };
}
const readFiles = (files: FileList) => Promise.all([...files].map(async (f) => ({ name: f.name.replace(/\.svg$/i, ''), ...parseSvg(await f.text()) })));

// ---------- page ----------
const LOGO_SIZES = ['500', '1000', '2000', '4000'] as const;
const ICON_SIZES = ['24', '48', '96', '512'] as const;

export default function BrandKit({ info }: { info: WsInfo }) {
  const agency = info.access.isAgency;
  const [kit, setKit] = useState<Kit | null | undefined>(undefined);
  const load = async () => setKit((await api<{ data: Kit } | null>(`/w/${info.slug}/research/brand_kit`).catch(() => null))?.data ?? null);
  useEffect(() => { load(); }, [info.slug]);
  const store = async (k: Kit) => { setKit(k); await api(`/w/${info.slug}/research/brand_kit`, { method: 'PUT', body: { data: k, status: 'published' } }); };

  if (kit === undefined) return <div className="text-[13px] text-muted">Loading brand kit…</div>;
  if (!kit) {
    if (!agency) return null;
    return (
      <Card className="p-5">
        <Label>Brand kit</Label>
        <p className="mb-3 text-[13px] text-muted">Logos, colours, fonts and icons with SVG and PNG downloads. Start with the logo SVGs; add colours and fonts after.</p>
        <Btn kind="primary" onClick={() => store({ brand: info.name, logos: [], colors: [{ group: 'Primary', items: [] }], fonts: [], icons: [] })}>Start brand kit</Btn>
      </Card>
    );
  }
  return <KitView kit={kit} agency={agency} onChange={store} />;
}

function KitView({ kit, agency, onChange }: { kit: Kit; agency: boolean; onChange: (k: Kit) => Promise<void> }) {
  useGoogleFonts(kit.fonts);
  const { copied, copy } = useCopy();
  const [logoSize, setLogoSize] = useState<(typeof LOGO_SIZES)[number]>('2000');
  const [iconSize, setIconSize] = useState<(typeof ICON_SIZES)[number]>('96');
  const palette = useMemo(() => kit.colors.flatMap((g) => g.items), [kit.colors]);
  const [iconColor, setIconColor] = useState(kit.icon_color || palette[0]?.hex || '#000000');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const edit = agency && editing;
  const brand = kit.brand || 'Brand';
  const run = async (key: string, f: () => Promise<void>) => { setBusy(key); try { await f(); } finally { setBusy(''); } };

  const logoFiles = async (only?: KitLogo) => {
    const files: Record<string, Uint8Array | string> = {};
    for (const l of only ? [only] : kit.logos) {
      for (const v of l.variants) {
        files[`${brand}-logos/svg/${v.file}.svg`] = logoSvg(l, v).svg;
        files[`${brand}-logos/png-${logoSize}px/${v.file}.png`] = await u8(await logoPng(l, v, Number(logoSize)));
      }
    }
    return files;
  };
  const iconFiles = async () => {
    const files: Record<string, Uint8Array | string> = {};
    for (const i of kit.icons) {
      const name = `${slug(brand)}-icon-${slug(i.name)}`;
      files[`${brand}-icons/svg/${name}.svg`] = iconSvg(i, iconColor);
      const W = Number(iconSize);
      files[`${brand}-icons/png-${iconSize}px/${name}.png`] = await u8(await pngBlob(iconSvg(i, iconColor, W), W, Math.round((W / i.w) * i.h)));
    }
    return files;
  };
  const everything = async () => {
    const fontsTxt = kit.fonts.map((f) => `${f.family}${f.use ? ` (${f.use})` : ''}\n${f.google !== false ? `https://fonts.google.com/specimen/${f.family.replace(/ /g, '+')}` : ''}`).join('\n\n');
    await zip({
      ...(await logoFiles()), ...(await iconFiles()),
      [`${brand}-colours/colours.css`]: cssVars(kit), [`${brand}-colours/tokens.json`]: tokens(kit),
      [`${brand}-fonts/fonts.txt`]: `${fontsTxt}\n\nEmbed:\n${embedCode(kit.fonts)}\n\nCSS:\n${kit.fonts.map(fontCss).join('\n\n')}\n`,
    }, `${brand}-brand-kit.zip`);
  };

  const sections = [['logos', 'Logos', kit.logos.length], ['colours', 'Colours', palette.length], ['fonts', 'Typography', kit.fonts.length], ['icons', 'Icons', kit.icons.length]] as const;
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {sections.map(([id, label, n]) => (
            <a key={id} href={`#kit-${id}`} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-text">{label} <span className="num">{n}</span></a>
          ))}
          {agency && kit.source && <a href={kit.source} target="_blank" rel="noreferrer" className="rounded-md px-2.5 py-1 text-[12px] text-muted hover:text-text">Source in Figma ↗</a>}
        </div>
        <div className="flex gap-2">
          {agency && <Btn onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit kit'}</Btn>}
          <Btn kind="primary" disabled={!!busy} onClick={() => run('all', everything)}>{busy === 'all' ? 'Packing…' : 'Download brand kit (ZIP)'}</Btn>
        </div>
      </div>

      {/* Brand tools on the client's own site (generative art, brand book, press kit): shown in the sidebar, edited here */}
      {edit && (
        <section>
          <h2 className="text-[17px] font-semibold tracking-tight">Brand tools</h2>
          <p className="mb-3 mt-1 text-[12px] text-muted">Links shown in the left panel under Brand OS.</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(kit.links || []).map((l, i) => (
              <Card key={l.url} className="group overflow-hidden">
                <a href={l.url} target="_blank" rel="noreferrer" className="block">
                  <Shot url={l.url} className="aspect-[16/10] w-full border-b border-line bg-panel-2 object-cover object-top" />
                </a>
                <div className="flex items-start justify-between gap-2 p-3">
                  <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0">
                    <div className="text-[13px] font-medium hover:underline">{l.title} ↗</div>
                    <div className="truncate text-[12px] text-muted">{l.note || l.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</div>
                  </a>
                  {edit && <button onClick={() => onChange({ ...kit, links: (kit.links || []).filter((_, j) => j !== i) })} className="shrink-0 text-[11px] text-muted hover:text-[var(--color-direct)]">Remove</button>}
                </div>
              </Card>
            ))}
          </div>
          {edit && <AddLink kit={kit} onChange={onChange} />}
        </section>
      )}

      {/* Logos */}
      <section id="kit-logos" className="scroll-mt-16">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight">Logos</h2>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted">PNG width</span>
            <Select value={logoSize} onChange={(v) => setLogoSize(v as typeof logoSize)} options={LOGO_SIZES} labels={Object.fromEntries(LOGO_SIZES.map((s) => [s, `${s} px`]))} />
            <Btn disabled={!!busy || !kit.logos.length} onClick={() => run('logos', async () => zip(await logoFiles(), `${brand}-logos.zip`))}>{busy === 'logos' ? 'Packing…' : 'All logos (ZIP)'}</Btn>
          </div>
        </div>
        <div className="space-y-6">
          {kit.logos.map((l) => (
            <div key={l.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>{l.name}</Label>
                {edit && <button onClick={() => onChange({ ...kit, logos: kit.logos.filter((x) => x.id !== l.id) })} className="text-[11px] text-muted hover:text-[var(--color-direct)]">Remove</button>}
              </div>
              <div className={`grid gap-2 ${l.w / l.h > 2 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3 md:grid-cols-4 lg:grid-cols-8'}`}>
                {l.variants.map((v) => (
                  <LogoTile key={v.file} l={l} v={v} busy={busy === v.file} onSvg={() => save(svgBlob(logoSvg(l, v).svg), `${v.file}.svg`)} onPng={() => run(v.file, async () => save(await logoPng(l, v, Number(logoSize)), `${v.file}.png`))} />
                ))}
              </div>
            </div>
          ))}
          {!kit.logos.length && <div className="text-[13px] text-muted">No logos yet.</div>}
          {edit && <AddLogo kit={kit} onChange={onChange} />}
        </div>
      </section>

      {/* Colours */}
      <section id="kit-colours" className="scroll-mt-16">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight">Colours</h2>
          <div className="flex gap-2">
            <Btn onClick={() => copy(cssVars(kit), 'css')}>{copied === 'css' ? 'Copied ✓' : 'Copy CSS variables'}</Btn>
            <Btn onClick={() => save(new Blob([tokens(kit)], { type: 'application/json' }), `${slug(brand)}-colours.json`)}>Tokens (JSON)</Btn>
          </div>
        </div>
        <div className="space-y-5">
          {kit.colors.map((g, gi) => (
            <div key={g.group}>
              <Label>{g.group}</Label>
              <div className={`grid gap-2 ${g.items.length > 4 ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
                {g.items.map((c, ci) => (
                  <Card key={c.name + c.hex} className="group overflow-hidden">
                    <button onClick={() => copy(c.hex, c.hex)} title="Copy HEX" className={`flex w-full items-end p-3 text-left text-[12px] ${g.items.length > 4 ? 'h-20' : 'h-28'}`} style={{ background: c.hex, color: isLight(c.hex) ? '#08090A' : '#FFFFFF' }}>
                      <span className="opacity-0 transition group-hover:opacity-80">{copied === c.hex ? 'Copied ✓' : 'Copy HEX'}</span>
                    </button>
                    <div className="space-y-0.5 p-3 text-[12px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{c.name}</span>
                        {edit && <button onClick={() => onChange({ ...kit, colors: kit.colors.map((x, i) => (i === gi ? { ...x, items: x.items.filter((_, j) => j !== ci) } : x)) })} className="text-[11px] text-muted hover:text-[var(--color-direct)]">Remove</button>}
                      </div>
                      <Spec k="HEX" v={c.hex.toUpperCase()} onCopy={() => copy(c.hex.toUpperCase(), `h${c.hex}`)} copied={copied === `h${c.hex}`} />
                      {c.rgb && <Spec k="RGB" v={c.rgb} onCopy={() => copy(c.rgb!, `r${c.hex}`)} copied={copied === `r${c.hex}`} />}
                      {c.cmyk && <Spec k="CMYK" v={c.cmyk} onCopy={() => copy(c.cmyk!, `c${c.hex}`)} copied={copied === `c${c.hex}`} />}
                      {c.pantone && <Spec k="Pantone" v={c.pantone} onCopy={() => copy(`PANTONE ${c.pantone}`, `p${c.hex}`)} copied={copied === `p${c.hex}`} />}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {edit && <AddColor kit={kit} onChange={onChange} />}
        </div>
      </section>

      {/* Typography */}
      <section id="kit-fonts" className="scroll-mt-16">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight">Typography</h2>
          {kit.fonts.some((f) => f.google !== false) && <Btn onClick={() => copy(embedCode(kit.fonts), 'embed')}>{copied === 'embed' ? 'Copied ✓' : 'Copy embed code'}</Btn>}
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {kit.fonts.map((f) => (
            <Card key={f.family} className="group p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[44px] leading-none" style={{ fontFamily: `"${f.family}"` }}>Aa</div>
                  <div className="mt-3 text-[15px] font-medium" style={{ fontFamily: `"${f.family}"` }}>{f.family}</div>
                  <div className="text-[12px] text-muted">{[f.use, f.weights?.length ? `Weights ${f.weights.join(', ')}` : ''].filter(Boolean).join('. ')}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {f.google !== false && <a href={`https://fonts.google.com/specimen/${f.family.replace(/ /g, '+')}`} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-text">Download on Google Fonts ↗</a>}
                  {!!f.styles?.length && <button onClick={() => copy(fontCss(f), `css${f.family}`)} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-text">{copied === `css${f.family}` ? 'Copied ✓' : 'Copy CSS'}</button>}
                  {edit && <button onClick={() => onChange({ ...kit, fonts: kit.fonts.filter((x) => x.family !== f.family) })} className="text-[11px] text-muted hover:text-[var(--color-direct)]">Remove</button>}
                </div>
              </div>
              <div className="mt-5 divide-y divide-[var(--mb-line)] border-t border-line">
                {(f.styles || []).map((s) => (
                  <div key={s.name} className="py-3">
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted">
                      <span>{s.name}{s.tag ? ` (${s.tag})` : ''}</span>
                      <span className="num">{s.weight} {s.size}px, line {Math.round(s.lh * 100)}%{s.ls ? `, tracking ${Math.round(s.ls * 100)}%` : ''}{s.upper ? ', uppercase' : ''}</span>
                    </div>
                    <div className="line-clamp-2" style={{ fontFamily: `"${f.family}"`, fontWeight: s.weight, fontSize: Math.min(s.size, 40), lineHeight: s.lh, letterSpacing: `${s.ls}em`, textTransform: s.upper ? 'uppercase' : undefined }}>{s.sample}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
        {edit && <AddFont kit={kit} onChange={onChange} />}
      </section>

      {/* Icons */}
      <section id="kit-icons" className="scroll-mt-16">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight">Icons</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1" title="Icon colour">
              {palette.slice(0, 10).map((c) => (
                <button key={c.hex} onClick={() => setIconColor(c.hex)} title={c.name} className={`h-5 w-5 rounded-full border ${iconColor === c.hex ? 'ring-2 ring-[var(--mb-text)] ring-offset-1 ring-offset-[var(--mb-bg)]' : 'border-line'}`} style={{ background: c.hex }} />
              ))}
            </div>
            <Select value={iconSize} onChange={(v) => setIconSize(v as typeof iconSize)} options={ICON_SIZES} labels={Object.fromEntries(ICON_SIZES.map((s) => [s, `PNG ${s} px`]))} />
            <Btn disabled={!!busy || !kit.icons.length} onClick={() => run('icons', async () => zip(await iconFiles(), `${brand}-icons.zip`))}>{busy === 'icons' ? 'Packing…' : 'All icons (ZIP)'}</Btn>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {kit.icons.map((i) => {
            const name = `${slug(brand)}-icon-${slug(i.name)}`;
            const light = isLight(iconColor);
            return (
              <Card key={i.id} className="group relative overflow-hidden">
                <div className="flex h-24 items-center justify-center" style={{ background: light ? '#1d1d1d' : '#f4f4f1' }}>
                  <img src={dataUri(iconSvg(i, iconColor, 40))} alt={i.name} className="h-10 w-10" />
                </div>
                <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-1.5 text-[11px]">
                  <span className="truncate text-muted group-hover:hidden">{i.name}</span>
                  <span className="hidden shrink-0 gap-1.5 group-hover:flex">
                    <button onClick={() => save(svgBlob(iconSvg(i, iconColor)), `${name}.svg`)} className="hover:underline">SVG</button>
                    <button onClick={() => run(i.id, async () => { const W = Number(iconSize); save(await pngBlob(iconSvg(i, iconColor, W), W, Math.round((W / i.w) * i.h)), `${name}.png`); })} className="hover:underline">PNG</button>
                    {edit && <button onClick={() => onChange({ ...kit, icons: kit.icons.filter((x) => x.id !== i.id) })} className="text-muted hover:text-[var(--color-direct)]">Remove</button>}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
        {!kit.icons.length && <div className="text-[13px] text-muted">No icons yet.</div>}
        {edit && (
          <FilePick label="Add icon SVGs" onFiles={async (fs) => {
            const parsed = await readFiles(fs);
            await onChange({ ...kit, icons: [...kit.icons, ...parsed.map((p) => ({ id: `${slug(p.name)}-${Date.now().toString(36)}`, name: p.name, w: p.w, h: p.h, svg: p.svg, mono: p.mono }))] });
          }} />
        )}
      </section>
    </div>
  );
}

function Spec({ k, v, onCopy, copied }: { k: string; v: string; onCopy: () => void; copied: boolean }) {
  return (
    <button onClick={onCopy} className="flex w-full items-baseline justify-between gap-2 text-left text-muted hover:text-text" title={`Copy ${k}`}>
      <span>{k}</span><span className="num truncate">{copied ? 'Copied ✓' : v}</span>
    </button>
  );
}

function LogoTile({ l, v, busy, onSvg, onPng }: { l: KitLogo; v: KitVariant; busy: boolean; onSvg: () => void; onPng: () => void }) {
  const { svg } = logoSvg(l, v, 600);
  const dark = !v.bg && isLight(v.color);
  return (
    <Card className="group overflow-hidden">
      <div
        className={`flex items-center justify-center ${l.w / l.h > 2 ? 'h-28 px-6' : 'h-28 p-3'}`}
        style={{ background: v.bg || (dark ? '#1d1d1d' : '#f7f7f5'), backgroundImage: v.bg ? undefined : `repeating-conic-gradient(${dark ? '#262626' : '#ececea'} 0 25%, transparent 0 50%)`, backgroundSize: v.bg ? undefined : '14px 14px' }}
      >
        <img src={dataUri(svg)} alt={v.file} className={`max-h-full max-w-full ${v.bg ? 'h-full' : l.w / l.h > 2 ? 'max-h-10' : 'h-14'}`} />
      </div>
      <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-1.5 text-[11px]">
        <span className="truncate text-muted" title={v.file}>{l.w / l.h > 2 ? (v.bg ? 'Background' : 'Transparent') : ''}</span>
        <span className="flex shrink-0 gap-1.5">
          <button onClick={onSvg} className="hover:underline">SVG</button>
          <button onClick={onPng} disabled={busy} className="hover:underline">{busy ? '…' : 'PNG'}</button>
        </span>
      </div>
    </Card>
  );
}

function FilePick({ label, onFiles }: { label: string; onFiles: (f: FileList) => Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3">
      <input ref={ref} type="file" accept=".svg,image/svg+xml" multiple className="hidden" onChange={async (e) => { if (e.target.files?.length) await onFiles(e.target.files); e.target.value = ''; }} />
      <button onClick={() => ref.current?.click()} className="rounded-md border border-dashed border-line px-3 py-2 text-[12px] text-muted hover:text-text">+ {label}</button>
    </div>
  );
}

/** Logo upload: each SVG becomes a logo; single-colour files get dark, light and brand-colour variants. */
function AddLogo({ kit, onChange }: { kit: Kit; onChange: (k: Kit) => Promise<void> }) {
  const all = kit.colors.flatMap((g) => g.items);
  const dark = all.find((c) => !isLight(c.hex))?.hex || '#000000';
  const light = '#FFFFFF';
  const saturated = (hex: string) => { const v = hexRgb(hex); return Math.max(...v) - Math.min(...v) > 80; };
  const accent = all.find((c) => saturated(c.hex))?.hex;
  return (
    <FilePick label="Add logo SVGs" onFiles={async (fs) => {
      const parsed = await readFiles(fs);
      const logos: KitLogo[] = parsed.map((p) => {
        const base = slug(`${kit.brand}-${p.name}`);
        const variants: KitVariant[] = p.mono
          ? [{ color: dark, file: `${base}-dark-transparent` }, { color: light, file: `${base}-light-transparent` }, { color: dark, bg: light, file: `${base}-dark-on-light` }, { color: light, bg: dark, file: `${base}-light-on-dark` }, ...(accent ? [{ color: dark, bg: accent, file: `${base}-dark-on-accent` }] : [])]
          : [{ color: p.original, file: `${base}` }];
        return { id: `${slug(p.name)}-${Date.now().toString(36)}`, name: p.name, w: p.w, h: p.h, svg: p.svg, mono: p.mono, variants };
      });
      await onChange({ ...kit, logos: [...kit.logos, ...logos] });
    }} />
  );
}

function AddColor({ kit, onChange }: { kit: Kit; onChange: (k: Kit) => Promise<void> }) {
  const groups = [...new Set([...kit.colors.map((g) => g.group), 'Primary', 'Secondary', 'Interface'])];
  const [f, setF] = useState({ name: '', hex: '', group: groups[0] });
  const valid = /^#?[0-9a-f]{6}$/i.test(f.hex.trim());
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (!valid) return;
      const hex = `#${f.hex.trim().replace('#', '').toUpperCase()}`;
      const item = { name: f.name.trim() || hex, hex, rgb: hexRgb(hex).join(' ') };
      const colors = kit.colors.some((g) => g.group === f.group) ? kit.colors.map((g) => (g.group === f.group ? { ...g, items: [...g.items, item] } : g)) : [...kit.colors, { group: f.group, items: [item] }];
      await onChange({ ...kit, colors });
      setF({ ...f, name: '', hex: '' });
    }}>
      <div className="w-44"><Input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="w-32"><Input placeholder="#HEX" value={f.hex} onChange={(e) => setF({ ...f, hex: e.target.value })} /></div>
      <Select value={f.group} onChange={(g) => setF({ ...f, group: g })} options={groups} />
      <Btn type="submit" disabled={!valid}>Add colour</Btn>
    </form>
  );
}

function AddFont({ kit, onChange }: { kit: Kit; onChange: (k: Kit) => Promise<void> }) {
  const [f, setF] = useState({ family: '', use: '' });
  return (
    <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const family = f.family.trim();
      if (!family) return;
      await onChange({ ...kit, fonts: [...kit.fonts, { family, google: true, weights: [400, 500, 700], use: f.use.trim() || undefined, styles: [{ name: 'Sample', weight: 400, size: 32, lh: 1.2, ls: 0, sample: 'The quick brown fox jumps over the lazy dog' }] }] });
      setF({ family: '', use: '' });
    }}>
      <div className="w-56"><Input placeholder="Google font, e.g. Inter" value={f.family} onChange={(e) => setF({ ...f, family: e.target.value })} /></div>
      <div className="w-56"><Input placeholder="Used for, e.g. Headings" value={f.use} onChange={(e) => setF({ ...f, use: e.target.value })} /></div>
      <Btn type="submit" disabled={!f.family.trim()}>Add font</Btn>
    </form>
  );
}

function AddLink({ kit, onChange }: { kit: Kit; onChange: (k: Kit) => Promise<void> }) {
  const [f, setF] = useState({ title: '', url: '' });
  return (
    <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const u = f.url.trim();
      if (!u) return;
      const url = /^https?:\/\//.test(u) ? u : `https://${u}`;
      await onChange({ ...kit, links: [...(kit.links || []), { title: f.title.trim() || url.replace(/^https?:\/\//, ''), url }] });
      setF({ title: '', url: '' });
    }}>
      <div className="w-56"><Input placeholder="Title, e.g. Generative art" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="w-72"><Input placeholder="Link" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div>
      <Btn type="submit" disabled={!f.url.trim()}>Add link</Btn>
    </form>
  );
}
