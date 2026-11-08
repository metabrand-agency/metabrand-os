// Competitor branding: a hue wheel showing which colours the category already owns and which are free,
// then a card per company with its homepage, palette, fonts and social image. Same view for any project.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Btn, Card, Favicon } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import type { Kit } from './BrandKit';
import { Branding, MarketData, Row, Shot, companyById, displayName, domain, focusOrder, useCompanyQueue, warmShots } from './marketShared';

const BRANDING_V = 1;
const HUES = [
  { name: 'Red', h: 0 }, { name: 'Orange', h: 30 }, { name: 'Yellow', h: 60 }, { name: 'Lime', h: 90 },
  { name: 'Green', h: 120 }, { name: 'Teal', h: 150 }, { name: 'Cyan', h: 180 }, { name: 'Azure', h: 210 },
  { name: 'Blue', h: 240 }, { name: 'Violet', h: 270 }, { name: 'Magenta', h: 300 }, { name: 'Rose', h: 330 },
];
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function hsl(hex: string) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l, chroma: d };
}
const isLight = (hex: string) => { const [r, g, b] = rgbOf(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 160; };
const segmentOf = (h: number) => Math.round(h / 30) % 12;

/** The client's palette and fonts come from its brand kit when there is one (exact), not from scraping. */
export function kitBranding(kit: Kit | null, scraped?: Branding): Branding | undefined {
  if (!kit?.colors?.length) return scraped;
  const items = kit.colors.filter((g) => !/interface|ui|status|system/i.test(g.group)).flatMap((g) => g.items);
  const range = (hex: string) => { const v = rgbOf(hex); return Math.max(...v) - Math.min(...v); };
  const accents = items.filter((c) => range(c.hex) > 80).sort((a, b) => range(b.hex) - range(a.hex));
  const neutrals = items.filter((c) => !accents.includes(c));
  const share = 1 / Math.max(1, items.length);
  return {
    v: BRANDING_V,
    palette: [...accents.map((c) => ({ hex: c.hex.toUpperCase(), role: 'accent' as const, share })), ...neutrals.map((c) => ({ hex: c.hex.toUpperCase(), role: 'neutral' as const, share }))],
    accent: accents[0]?.hex.toUpperCase() || null,
    fonts: kit.fonts.map((f) => ({ family: f.family, source: f.google === false ? 'brand kit' : 'google' })),
    image: scraped?.image || null,
    checked_at: scraped?.checked_at || Date.now(),
  };
}

export function useFonts(families: string[]) {
  const key = [...new Set(families)].sort().join('|');
  useEffect(() => {
    for (const f of key.split('|').filter(Boolean)) {
      // one stylesheet per family: an unknown family must not break the others
      const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}&display=swap`;
      if (document.querySelector(`link[href="${href}"]`)) continue;
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      document.head.appendChild(l);
    }
  }, [key]);
}

export default function BrandingLens({ info, data, accept, extra }: { info: WsInfo; data: MarketData; accept: (r: Row) => void; extra?: React.ReactNode }) {
  const agency = info.access.isAgency;
  const [kit, setKit] = useState<Kit | null>(null);
  useEffect(() => { api<{ data: Kit } | null>(`/w/${info.slug}/research/brand_kit`).then((r) => setKit(r?.data || null)).catch(() => {}); }, [info.slug]);
  const { busy, progress, err, refresh, label } = useCompanyQueue({
    slug: info.slug, data, accept, agency, path: 'branding/refresh', idle: 'Update branding',
    stale: (d, id) => { const b = d.branding?.[id]; return !!companyById(d, id)?.url && (!b || b.v !== BRANDING_V || Date.now() - b.checked_at > 30 * 864e5); },
  });
  const ids = focusOrder(data);
  const brandOf = (id: string) => (id === '__client' ? kitBranding(kit, data.branding?.[id]) : data.branding?.[id]);
  useEffect(() => { warmShots(ids.map((id) => companyById(data, id)?.url)); }, [ids.join()]);
  useFonts(ids.flatMap((id) => brandOf(id)?.fonts.map((f) => f.family) || []));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Competitor branding</h1>
          <div className="mt-1 text-[13px] text-muted">Colours, fonts and first screens of {data.client.name} and {ids.length - 1} competitors in focus</div>
        </div>
        <div className="flex gap-2">
          {agency && <Btn disabled={busy} onClick={() => refresh(undefined, true)}>{label}</Btn>}
          {extra}
        </div>
      </div>
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      <HueWheel data={data} ids={ids} brandOf={brandOf} />

      <div className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {ids.map((id) => <BrandCard key={id} data={data} id={id} b={brandOf(id)} working={progress.active.includes(id)} busy={busy} />)}
      </div>
    </div>
  );
}

function HueWheel({ data, ids, brandOf }: { data: MarketData; ids: string[]; brandOf: (id: string) => Branding | undefined }) {
  // each company's accents (up to two), placed at their hue
  const marks = useMemo(() => ids.flatMap((id) => {
    const accents = (brandOf(id)?.palette || []).filter((p) => p.role === 'accent').slice(0, 2);
    return accents.map((p, i) => ({ id, hex: p.hex, h: hsl(p.hex).h, main: i === 0 }));
  }), [ids, brandOf]);
  const neutralOnly = ids.filter((id) => brandOf(id) && !brandOf(id)!.palette.some((p) => p.role === 'accent'));
  const owners = HUES.map((_, i) => [...new Set(marks.filter((m) => m.main && segmentOf(m.h) === i).map((m) => m.id))]);
  const seconds = HUES.map((_, i) => [...new Set(marks.filter((m) => !m.main && segmentOf(m.h) === i).map((m) => m.id))].filter((id) => !owners[i].includes(id)));

  const W = 520, cx = W / 2, cy = W / 2, R1 = 150, R0 = 112;
  const pt = (deg: number, r: number) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0, R1), [x1, y1] = pt(a1, R1), [x2, y2] = pt(a1, R0), [x3, y3] = pt(a0, R0);
    return `M${x0},${y0} A${R1},${R1} 0 0 1 ${x1},${y1} L${x2},${y2} A${R0},${R0} 0 0 0 ${x3},${y3} Z`;
  };
  // dots stack inward when they share a hue
  const placed: { x: number; y: number; m: (typeof marks)[number] }[] = [];
  for (const m of [...marks].sort((a, b) => Number(b.main) - Number(a.main))) {
    let r = R0 - 16;
    while (placed.some((p) => Math.hypot(p.x - pt(m.h, r)[0], p.y - pt(m.h, r)[1]) < 15)) r -= 15;
    const [x, y] = pt(m.h, r);
    placed.push({ x, y, m });
  }
  // labels outside the ring for each company's main accent, pushed apart when close
  const labels: { id: string; h: number; r: number }[] = [];
  for (const m of marks.filter((x) => x.main).sort((a, b) => a.h - b.h)) {
    let r = R1 + 22;
    while (labels.some((l) => Math.abs(((l.h - m.h + 540) % 360) - 180) < 14 && l.r === r)) r += 16;
    labels.push({ id: m.id, h: m.h, r });
  }

  return (
    <Card className="grid gap-6 p-5 @4xl:grid-cols-[minmax(0,520px)_1fr]">
      <svg viewBox={`0 0 ${W} ${W}`} className="mx-auto w-full max-w-[520px]">
        {HUES.map((hue, i) => {
          const taken = owners[i].length > 0, touched = seconds[i].length > 0;
          return (
            <path key={hue.name} d={arc(hue.h - 15 + 0.6, hue.h + 15 - 0.6)} fill={`hsl(${hue.h} 75% 55%)`} opacity={taken ? 1 : touched ? 0.45 : 0.14} stroke={taken || touched ? 'none' : 'var(--mb-muted)'} strokeDasharray={taken || touched ? undefined : '3 3'} strokeWidth={taken || touched ? 0 : 0.8}>
              <title>{`${hue.name}: ${taken ? owners[i].map((id) => displayName(data, id)).join(', ') : touched ? `second colour of ${seconds[i].map((id) => displayName(data, id)).join(', ')}` : 'free'}`}</title>
            </path>
          );
        })}
        {placed.map(({ x, y, m }) => (
          <circle key={m.id + m.hex} cx={x} cy={y} r={m.main ? (m.id === '__client' ? 8 : 6.5) : 4} fill={m.hex} stroke={m.id === '__client' ? 'var(--mb-text)' : 'var(--mb-panel)'} strokeWidth={m.id === '__client' ? 2 : 1.5}>
            <title>{`${displayName(data, m.id)}: ${m.hex}`}</title>
          </circle>
        ))}
        {labels.map((l) => {
          const [x, y] = pt(l.h, l.r);
          const [lx, ly] = pt(l.h, R1 + 4);
          const anchor = Math.abs(Math.sin((l.h * Math.PI) / 180)) < 0.2 ? 'middle' : Math.sin((l.h * Math.PI) / 180) > 0 ? 'start' : 'end';
          return (
            <g key={l.id}>
              <line x1={lx} y1={ly} x2={x} y2={y} stroke="var(--mb-line)" />
              <text x={x + (anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0)} y={y + 4} textAnchor={anchor} fontSize={12} fill="var(--mb-text)" fontWeight={l.id === '__client' ? 600 : 400}>{displayName(data, l.id)}</text>
            </g>
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill="var(--mb-muted)">{neutralOnly.length ? 'Black and white only' : ''}</text>
        {neutralOnly.slice(0, 4).map((id, i) => <text key={id} x={cx} y={cy + 12 + i * 15} textAnchor="middle" fontSize={12} fill="var(--mb-text)">{displayName(data, id)}</text>)}
      </svg>
      <div className="min-w-0 self-center">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[.08em] text-muted">Main accent colour by hue</div>
        <div className="divide-y divide-[var(--mb-line)] text-[12px]">
          {HUES.map((hue, i) => (
            <div key={hue.name} className="flex items-center gap-3 py-1.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `hsl(${hue.h} 75% 55%)`, opacity: owners[i].length ? 1 : seconds[i].length ? 0.45 : 0.2 }} />
              <span className={`w-16 shrink-0 ${owners[i].length ? '' : 'text-muted'}`}>{hue.name}</span>
              <span className="min-w-0 truncate">
                {owners[i].map((id) => displayName(data, id)).join(', ')}
                {!!seconds[i].length && <span className="text-muted">{owners[i].length ? ', ' : ''}{seconds[i].map((id) => `${displayName(data, id)} (2nd)`).join(', ')}</span>}
                {!owners[i].length && !seconds[i].length && <span className="text-muted">Free</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function BrandCard({ data, id, b, working, busy }: { data: MarketData; id: string; b?: Branding; working: boolean; busy: boolean }) {
  const c = companyById(data, id);
  const [copied, setCopied] = useState('');
  const copy = (hex: string) => { navigator.clipboard.writeText(hex).catch(() => {}); setCopied(hex); setTimeout(() => setCopied(''), 1200); };
  const accents = b?.palette.filter((p) => p.role === 'accent') || [];
  const neutrals = b?.palette.filter((p) => p.role === 'neutral') || [];
  return (
    <Card className={`overflow-hidden ${working ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className={`flex min-w-0 items-center gap-2 text-[13px] ${id === '__client' ? 'font-semibold' : 'font-medium'}`}><Favicon url={c.url} name={c.name} />{displayName(data, id)}</span>
        {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-[12px] text-muted hover:text-text">{domain(c.url)} ↗</a>}
      </div>
      {c.url ? (
        <a href={c.url} target="_blank" rel="noreferrer" className="block border-y border-line bg-panel-2">
          <Shot url={c.url} className="aspect-[16/10] w-full object-cover object-top" />
        </a>
      ) : <div className="aspect-[16/10] border-y border-line bg-panel-2" />}
      <div className="space-y-3 p-4">
        {!b && <div className="text-[12px] text-muted">{working || busy ? 'Reading the site…' : c.url ? 'Not checked yet' : 'No website'}</div>}
        {b && (
          <>
            <div className="flex h-9 overflow-hidden rounded-md border border-line">
              {[...accents, ...neutrals].map((p) => (
                <button key={p.hex} onClick={() => copy(p.hex)} title={`${p.hex}, copy`} className="group relative min-w-[28px] flex-1" style={{ background: p.hex, flexGrow: p.role === 'accent' ? 2 : 1 }}>
                  <span className={`absolute inset-x-0 bottom-0.5 text-center text-[9px] opacity-0 group-hover:opacity-100 ${isLight(p.hex) ? 'text-black/70' : 'text-white/80'}`}>{copied === p.hex ? '✓' : p.hex.slice(1)}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="min-w-0 space-y-1">
                {b.fonts.length ? b.fonts.map((f) => (
                  <div key={f.family} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[17px] leading-tight" style={{ fontFamily: `"${f.family}", var(--font-sans)` }}>{f.family}</span>
                    <span className="shrink-0 text-[10px] text-muted">{f.source === 'google' ? 'Google' : f.source === 'self-hosted' ? 'Own files' : f.source === 'brand kit' ? 'Brand kit' : ''}</span>
                  </div>
                )) : <div className="text-[12px] text-muted">No custom fonts found</div>}
              </div>
              {b.image ? (
                <a href={b.image} target="_blank" rel="noreferrer" title="Social image (og:image)" className="block self-start overflow-hidden rounded border border-line bg-panel-2">
                  <img src={b.image} alt="" loading="lazy" className="aspect-[1.91/1] w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).parentElement!.style.display = 'none')} />
                </a>
              ) : <div />}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

