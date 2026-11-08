// Methodologies: the client and the competitors in focus through the frameworks big brand agencies use.
// Each method is one AI assessment from public positioning (or, for distinctive assets, computed from data).
// No conclusions on screen: the maps and tables are the output. Same view for any project.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Btn, Card, Favicon } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import type { Kit } from './BrandKit';
import { kitBranding, useFonts } from './BrandingLens';
import { MarketData, Row, companyById, displayName, focusOrder, useClientColor } from './marketShared';

type MethodMeta = { key: string; title: string; source: string; what: string; computed?: boolean };
export const METHOD_LIST: MethodMeta[] = [
  { key: 'bav', title: 'Differentiation × Relevance', source: 'BrandAsset Valuator (Landor, WPP)', what: 'Who stands apart and who matters to buyers' },
  { key: 'vision_execution', title: 'Vision × Execution', source: 'Analyst-style market quadrant', what: 'Ambition against proof of delivery' },
  { key: 'dunford', title: 'Positioning canvas', source: 'April Dunford, Obviously Awesome', what: 'Alternatives, unique attributes, value, customers, category' },
  { key: 'blue_ocean', title: 'Strategy canvas', source: 'Blue Ocean Strategy (Kim & Mauborgne)', what: 'What the category competes on and how offers compare' },
  { key: 'category', title: 'Category claims', source: 'Category Design (Play Bigger)', what: 'Which category each company says it is in' },
  { key: 'jtbd', title: 'Jobs to be done', source: 'Christensen, Ulwick', what: 'Which buyer jobs each company speaks to' },
  { key: 'cep', title: 'Category entry points', source: 'Ehrenberg-Bass Institute', what: 'Buying situations and who is linked to them' },
  { key: 'archetypes', title: 'Brand archetypes', source: 'Mark & Pearson', what: 'Primary and secondary archetype of each brand' },
  { key: 'kapferer', title: 'Identity prism', source: 'Jean-Noël Kapferer', what: 'Six facets of brand identity' },
  { key: 'aaker', title: 'Brand personality', source: 'Jennifer Aaker', what: 'Five dimensions of personality' },
  { key: 'distinctive', title: 'Distinctive assets', source: 'Jenni Romaniuk, Ehrenberg-Bass', what: 'Fame and uniqueness of colours and typefaces', computed: true },
];
const ARCHETYPES = ['Innocent', 'Everyman', 'Hero', 'Outlaw', 'Explorer', 'Creator', 'Ruler', 'Magician', 'Lover', 'Caregiver', 'Jester', 'Sage'];
const fmtDay = (t?: number) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

export default function MethodsLens({ info, data, accept, extra }: { info: WsInfo; data: MarketData; accept: (r: Row) => void; extra?: React.ReactNode }) {
  const agency = info.access.isAgency;
  const accent = useClientColor(info.slug);
  const [kit, setKit] = useState<Kit | null>(null);
  useEffect(() => { api<{ data: Kit } | null>(`/w/${info.slug}/research/brand_kit`).then((r) => setKit(r?.data || null)).catch(() => {}); }, [info.slug]);
  const [active, setActive] = useState(() => { try { return localStorage.getItem(`mos_method_${info.slug}`) || 'bav'; } catch { return 'bav'; } });
  const [running, setRunning] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const methods: Record<string, any> = (data as any).methods || {};
  const ids = focusOrder(data);
  const pick = (k: string) => { setActive(k); try { localStorage.setItem(`mos_method_${info.slug}`, k); } catch { /* private mode */ } };

  async function run(keys: string[]) {
    setErr('');
    setRunning((r) => [...new Set([...r, ...keys])]);
    const queue = [...keys];
    const worker = async () => {
      for (let k = queue.shift(); k; k = queue.shift()) {
        const key = k;
        try { accept(await api<Row>(`/w/${info.slug}/methods/run`, { body: { key } })); }
        catch (e: any) { setErr(`${METHOD_LIST.find((m) => m.key === key)?.title}: ${e.message}`); }
        setRunning((r) => r.filter((x) => x !== key));
      }
    };
    await Promise.all([worker(), worker()]);
  }
  const aiKeys = METHOD_LIST.filter((m) => !m.computed).map((m) => m.key);
  const missing = aiKeys.filter((k) => !methods[k]);
  const meta = METHOD_LIST.find((m) => m.key === active) || METHOD_LIST[0];
  const result = methods[meta.key];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Methodologies</h1>
          <div className="mt-1 text-[13px] text-muted">{data.client.name} and {ids.length - 1} competitors in focus through {METHOD_LIST.length} brand frameworks</div>
        </div>
        <div className="flex gap-2">
          {agency && <Btn disabled={running.length > 0} onClick={() => run(missing.length ? missing : aiKeys)}>{running.length ? `Running ${running.length}…` : missing.length ? `Run ${missing.length} methods` : 'Update all'}</Btn>}
          {extra}
        </div>
      </div>
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      <div className="grid gap-4 @4xl:grid-cols-[230px_minmax(0,1fr)]">
        <nav className="flex flex-wrap gap-1 @4xl:flex-col @4xl:flex-nowrap">
          {METHOD_LIST.map((m) => {
            const on = m.key === active;
            const done = m.computed || !!methods[m.key];
            return (
              <button key={m.key} onClick={() => pick(m.key)} className={`rounded-md px-3 py-2 text-left transition ${on ? 'bg-panel-2' : 'hover:bg-panel-2'}`}>
                <div className={`text-[13px] ${on ? 'font-medium text-text' : done ? 'text-text' : 'text-muted'}`}>{m.title}</div>
                <div className="truncate text-[11px] text-muted">{running.includes(m.key) ? 'Running…' : m.computed ? 'From data' : methods[m.key] ? `Updated ${fmtDay(methods[m.key].generated_at)}` : 'Not run yet'}</div>
              </button>
            );
          })}
        </nav>

        <Card className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[17px] font-semibold tracking-tight">{meta.title}</div>
              <div className="text-[12px] text-muted">{meta.source}. {meta.what}.</div>
            </div>
            {agency && !meta.computed && <Btn disabled={running.includes(meta.key)} onClick={() => run([meta.key])}>{running.includes(meta.key) ? 'Running…' : result ? 'Update' : 'Run'}</Btn>}
          </div>
          {meta.computed ? <Distinctive data={data} ids={ids} kit={kit} accent={accent} />
            : !result ? <div className="py-16 text-center text-[13px] text-muted">{running.includes(meta.key) ? 'Scoring the companies…' : agency ? 'Not run yet. Run it to score the client and the competitors in focus.' : 'Not available yet.'}</div>
            : result.kind === 'scatter' ? <Scatter data={data} r={result} accent={accent} quads={QUADS[meta.key]} />
            : result.kind === 'grid' ? <Grid data={data} r={result} accent={accent} canvas={meta.key === 'blue_ocean'} owns={meta.key === 'jtbd' || meta.key === 'cep'} />
            : result.kind === 'profile' ? <Profile data={data} r={result} />
            : result.kind === 'labels' ? <Labels data={data} r={result} />
            : result.kind === 'archetype' ? <Archetypes data={data} r={result} accent={accent} />
            : null}
          {result && !meta.computed && <div className="mt-4 border-t border-line pt-3 text-[11px] text-muted">AI assessment from public positioning and market facts; hover a mark for its evidence. Companies: the client and the competitors in focus when it was run.</div>}
        </Card>
      </div>
    </div>
  );
}

const QUADS: Record<string, [string, string, string, string]> = {
  // top-left, top-right, bottom-left, bottom-right
  bav: ['Differentiated, less relevant', 'Leadership', 'Unfocused', 'Relevant, undifferentiated'],
  vision_execution: ['Challengers', 'Leaders', 'Niche players', 'Visionaries'],
};
const short = (data: MarketData, id: string) => displayName(data, id);

/** Two-axis map (0-100) with quadrant names and labelled company marks. */
type Pt = { id: string; x: number; y: number; note?: string; label: string; fill?: string; text?: string; font?: string; client?: boolean };
function Scatter({ data, r, accent, quads, points: given, render }: { data: MarketData; r: any; accent: string; quads?: [string, string, string, string]; points?: Pt[]; render?: boolean }) {
  const W = 640, H = 440, L = 44, R = 20, T = 20, B = 40;
  // marks sit inside the frame with a margin, so 0 and 100 don't touch the edges
  const px = (v: number) => L + 16 + (v / 100) * (W - L - R - 32), py = (v: number) => T + 30 + (1 - v / 100) * (H - T - B - 60);
  const pts: Pt[] = given || Object.entries(r.points || {}).map(([id, p]: [string, any]) => ({ id, x: p.x, y: p.y, note: p.note, label: short(data, id), client: id === '__client' }));
  // labels: right of the mark, nudged down when they would overlap
  const sorted = [...pts].sort((a, b) => b.y - a.y);
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const marks: Box[] = sorted.map((p) => ({ x0: px(p.x) - 9, x1: px(p.x) + 9, y0: py(p.y) - 9, y1: py(p.y) + 9 }));
  // quadrant names are obstacles too
  const qw = (t: string) => t.length * 6.2;
  const boxes: Box[] = quads ? [
    { x0: L + 8, x1: L + 8 + qw(quads[0]), y0: T + 5, y1: T + 19 }, { x0: W - R - 8 - qw(quads[1]), x1: W - R - 8, y0: T + 5, y1: T + 19 },
    { x0: L + 8, x1: L + 8 + qw(quads[2]), y0: H - B - 19, y1: H - B - 5 }, { x0: W - R - 8 - qw(quads[3]), x1: W - R - 8, y0: H - B - 19, y1: H - B - 5 },
  ] : [];
  const hit = (b: Box) => [...boxes, ...marks].some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) || b.x0 < L || b.x1 > W - 2;
  const labels = new Map<Pt, { x: number; y: number; anchor: 'start' | 'end' | 'middle' }>();
  for (const p of sorted) {
    const x = px(p.x), y = py(p.y), w = p.label.length * 6.6 + 4;
    const tries: { x: number; y: number; anchor: 'start' | 'end' | 'middle'; b: Box }[] = [];
    for (const dy of [0, -14, 14, -28, 28, -42, 42]) {
      tries.push({ x: x + 12, y: y + 4 + dy, anchor: 'start', b: { x0: x + 11, x1: x + 11 + w, y0: y - 7 + dy, y1: y + 7 + dy } });
      tries.push({ x: x - 12, y: y + 4 + dy, anchor: 'end', b: { x0: x - 11 - w, x1: x - 11, y0: y - 7 + dy, y1: y + 7 + dy } });
    }
    const t = tries.find((c) => !hit(c.b)) || tries[x > W * 0.7 ? 1 : 0];
    boxes.push(t.b);
    labels.set(p, { x: t.x, y: t.y, anchor: t.anchor });
  }
  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[760px]">
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke="var(--mb-line)" />
        <line x1={px(50)} x2={px(50)} y1={T} y2={H - B} stroke="var(--mb-line)" />
        <line x1={L} x2={W - R} y1={py(50)} y2={py(50)} stroke="var(--mb-line)" />
        {quads && [[L + 8, T + 16, 'start', quads[0]], [W - R - 8, T + 16, 'end', quads[1]], [L + 8, H - B - 8, 'start', quads[2]], [W - R - 8, H - B - 8, 'end', quads[3]]].map(([x, y, a, t]) => (
          <text key={String(t)} x={x as number} y={y as number} textAnchor={a as any} fontSize={11} fill="var(--mb-muted)">{t}</text>
        ))}
        <text x={L} y={H - 12} fontSize={11} fill="var(--mb-muted)">{r.axes?.x?.[0]}</text>
        <text x={W - R} y={H - 12} fontSize={11} fill="var(--mb-muted)" textAnchor="end">{r.axes?.x?.[1]} →</text>
        <text transform={`translate(14 ${H - B}) rotate(-90)`} fontSize={11} fill="var(--mb-muted)">{r.axes?.y?.[0]}</text>
        <text transform={`translate(14 ${T}) rotate(-90)`} fontSize={11} fill="var(--mb-muted)" textAnchor="end">{r.axes?.y?.[1]} →</text>
        {sorted.map((p) => {
          const x = px(p.x), y = py(p.y);
          return (
            <g key={p.id + (p.text || '')}>
              <title>{`${p.label}${p.note ? `: ${p.note}` : ''}`}</title>
              {p.text ? (
                <text x={x} y={y + 6} textAnchor="middle" fontSize={17} fill="var(--mb-text)" style={{ fontFamily: p.font ? `"${p.font}"` : undefined }}>{p.text}</text>
              ) : (
                <circle cx={x} cy={y} r={p.client ? 8 : 6} fill={p.fill || (p.client ? accent : 'var(--mb-text)')} stroke="var(--mb-panel)" strokeWidth={2} />
              )}
              {(() => { const l = labels.get(p)!; return <text x={l.x} y={l.y} textAnchor={l.anchor} fontSize={12} fill="var(--mb-text)" fontWeight={p.client ? 600 : 400}>{p.label}</text>; })()}
            </g>
          );
        })}
      </svg>
      {!render && (
        <table className="w-full text-[12px]">
          <tbody className="divide-y divide-[var(--mb-line)]">
            {sorted.map((p) => (
              <tr key={p.id}>
                <td className="w-44 py-1.5 pr-3"><CompanyName data={data} id={p.id} /></td>
                <td className="num w-24 py-1.5 text-muted">{Math.round(p.x)} × {Math.round(p.y)}</td>
                <td className="py-1.5 text-muted">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CompanyName({ data, id }: { data: MarketData; id: string }) {
  const c = companyById(data, id);
  if (!c) return null;
  return <span className={`flex min-w-0 items-center gap-1.5 ${id === '__client' ? 'font-medium' : ''}`}><Favicon url={c.url} name={c.name} size={14} /><span className="truncate">{short(data, id)}</span></span>;
}
const columns = (data: MarketData, r: any) => (r.ids || []).filter((id: string) => companyById(data, id));

/** Rows (factors, jobs, entry points, dimensions) × companies, as a heatmap; the strategy canvas adds lines. */
function Grid({ data, r, accent, canvas, owns }: { data: MarketData; r: any; accent: string; canvas?: boolean; owns?: boolean }) {
  const cols: string[] = columns(data, r);
  const [lo, hi] = r.scale || [0, 2];
  const val = (id: string, i: number) => r.values?.[id]?.scores?.[i] ?? lo;
  const strength = (v: number) => (v - lo) / (hi - lo || 1);
  const word = (v: number) => (hi === 2 ? (v === 2 ? 'Core' : v === 1 ? 'Mentioned' : '') : String(v));
  return (
    <div className="space-y-5">
      {canvas && <StrategyCanvas data={data} r={r} cols={cols} accent={accent} />}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-[12px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-[220px] bg-panel" />
              {cols.map((id) => <th key={id} className="min-w-[92px] px-1 pb-1 text-left font-normal" title={r.values?.[id]?.note}><CompanyName data={data} id={id} /></th>)}
            </tr>
          </thead>
          <tbody>
            {(r.items || []).map((item: string, i: number) => {
              const unowned = owns && !cols.some((id) => val(id, i) === hi);
              return (
                <tr key={item}>
                  <td className="sticky left-0 z-[1] bg-panel py-1 pr-3 align-middle">
                    <div className="leading-snug">{item}</div>
                    {unowned && <div className="text-[11px] text-muted">Nobody owns this</div>}
                  </td>
                  {cols.map((id) => {
                    const v = val(id, i), s = strength(v);
                    const fill = id === '__client' ? accent : 'var(--mb-text)';
                    return (
                      <td key={id} className="relative h-9 overflow-hidden rounded-[4px] border border-line text-center" title={`${short(data, id)}: ${word(v) || 'not addressed'}`}>
                        <span className="absolute inset-0" style={{ background: fill, opacity: s * (id === '__client' ? 0.85 : 0.55) }} />
                        <span className={`relative text-[11px] ${s > 0.6 ? (id === '__client' ? 'text-black' : 'text-[var(--mb-panel)]') : 'text-muted'}`}>{word(v)}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Blue Ocean strategy canvas: factors on x, offering level on y, one line per company (client in its colour). */
function StrategyCanvas({ data, r, cols, accent }: { data: MarketData; r: any; cols: string[]; accent: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const items: string[] = r.items || [];
  const W = 720, H = 300, L = 30, R = 120, T = 16, B = 70;
  const step = (W - L - R) / Math.max(1, items.length - 1);
  const px = (i: number) => L + i * step, py = (v: number) => T + (1 - (v - 1) / 4) * (H - T - B);
  const order = [...cols.filter((id) => id !== '__client'), '__client'];
  const ends: { id: string; y: number }[] = [];
  for (const id of order) {
    let y = py(r.values?.[id]?.scores?.[items.length - 1] ?? 1) + 4;
    while (ends.some((e) => Math.abs(e.y - y) < 13)) y += 13;
    ends.push({ id, y });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[860px]">
      {[1, 2, 3, 4, 5].map((v) => <line key={v} x1={L} x2={W - R} y1={py(v)} y2={py(v)} stroke="var(--mb-line)" strokeDasharray={v === 1 ? undefined : '2 4'} />)}
      <text x={L - 8} y={py(5) + 4} fontSize={10} textAnchor="end" fill="var(--mb-muted)">High</text>
      <text x={L - 8} y={py(1) + 4} fontSize={10} textAnchor="end" fill="var(--mb-muted)">Low</text>
      {items.map((it, i) => (
        <foreignObject key={it} x={px(i) - step / 2} y={H - B + 8} width={step} height={B - 8}>
          <div style={{ fontSize: 10, lineHeight: 1.25, textAlign: 'center', color: 'var(--mb-muted)', padding: '0 3px' }}>{it}</div>
        </foreignObject>
      ))}
      {order.map((id) => {
        const client = id === '__client', on = hover === id;
        const pts = items.map((_, i) => `${px(i)},${py(r.values?.[id]?.scores?.[i] ?? 1)}`).join(' ');
        const end = ends.find((e) => e.id === id)!;
        return (
          <g key={id} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            <polyline points={pts} fill="none" stroke={client ? accent : 'var(--mb-text)'} strokeOpacity={client || on ? 1 : hover ? 0.12 : 0.35} strokeWidth={client ? 3 : on ? 2.5 : 1.5} strokeLinejoin="round" />
            {items.map((_, i) => <circle key={i} cx={px(i)} cy={py(r.values?.[id]?.scores?.[i] ?? 1)} r={client ? 4 : 3} fill={client ? accent : 'var(--mb-text)'} fillOpacity={client || on ? 1 : hover ? 0.12 : 0.45} />)}
            <text x={W - R + 8} y={end.y} fontSize={11} fill="var(--mb-text)" fillOpacity={client || on || !hover ? 1 : 0.3} fontWeight={client ? 600 : 400}>{short(data, id)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Text fields × companies (Dunford's canvas, Kapferer's prism). */
function Profile({ data, r }: { data: MarketData; r: any }) {
  const cols: string[] = columns(data, r);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-[1] min-w-[150px] bg-panel" />
            {cols.map((id) => <th key={id} className="min-w-[190px] px-3 pb-2 text-left font-normal"><CompanyName data={data} id={id} /></th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--mb-line)]">
          {(r.fields || []).map((f: { key: string; label: string }) => (
            <tr key={f.key}>
              <td className="sticky left-0 z-[1] bg-panel py-2.5 pr-3 align-top text-muted">{f.label}</td>
              {cols.map((id) => <td key={id} className={`px-3 py-2.5 align-top leading-snug ${id === '__client' ? 'bg-panel-2' : ''}`}>{r.rows?.[id]?.[f.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Category each company claims, grouped by new, reframed and existing. */
function Labels({ data, r }: { data: MarketData; r: any }) {
  const cols: string[] = columns(data, r);
  const groups: [string, string][] = [['new', 'Coins a new category'], ['reframed', 'Reframes an existing one'], ['existing', 'Existing category']];
  return (
    <div className="space-y-5">
      {groups.map(([type, title]) => {
        const ids = cols.filter((id) => r.values?.[id]?.type === type);
        if (!ids.length) return null;
        return (
          <div key={type}>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[.08em] text-muted">{title} <span className="num">{ids.length}</span></div>
            <div className="divide-y divide-[var(--mb-line)] rounded-md border border-line">
              {ids.map((id) => (
                <div key={id} className={`grid grid-cols-[180px_1fr] gap-3 px-3 py-2.5 text-[12px] @3xl:grid-cols-[180px_260px_1fr] ${id === '__client' ? 'bg-panel-2' : ''}`}>
                  <CompanyName data={data} id={id} />
                  <span className="text-[14px] font-medium">“{r.values[id].label}”</span>
                  <span className="text-muted @3xl:col-auto col-span-2">{r.values[id].note}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 12 archetypes around a wheel: primary archetype as a large mark, secondary as a small one. */
function Archetypes({ data, r, accent }: { data: MarketData; r: any; accent: string }) {
  const cols: string[] = columns(data, r);
  const W = 520, cx = W / 2, cy = W / 2, R = 200;
  const ang = (i: number) => (i * 360) / 12;
  const pt = (deg: number, rad: number) => [cx + rad * Math.sin((deg * Math.PI) / 180), cy - rad * Math.cos((deg * Math.PI) / 180)];
  const primaries = ARCHETYPES.map((a) => cols.filter((id) => r.values?.[id]?.primary === a));
  const seconds = ARCHETYPES.map((a) => cols.filter((id) => r.values?.[id]?.secondary === a));
  const max = Math.max(1, ...primaries.map((p) => p.length));
  const sector = (i: number) => {
    const a0 = ang(i) - 15, a1 = ang(i) + 15;
    const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
    return `M${cx},${cy} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`;
  };
  return (
    <div className="grid gap-6 @4xl:grid-cols-[minmax(0,520px)_1fr]">
      <svg viewBox={`-40 -10 ${W + 80} ${W + 20}`} className="mx-auto w-full max-w-[560px]">
        {ARCHETYPES.map((a, i) => (
          <g key={a}>
            <path d={sector(i)} fill="var(--mb-text)" fillOpacity={0.03 + (primaries[i].length / max) * 0.16} stroke="var(--mb-line)" />
            {(() => { const [x, y] = pt(ang(i), R + 18); return <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fill={primaries[i].length ? 'var(--mb-text)' : 'var(--mb-muted)'} fontWeight={primaries[i].length ? 500 : 400}>{a}</text>; })()}
            {primaries[i].map((id, k) => {
              const spread = (k - (primaries[i].length - 1) / 2) * 9;
              const [x, y] = pt(ang(i) + spread, R * 0.72);
              return <circle key={id} cx={x} cy={y} r={id === '__client' ? 9 : 7} fill={id === '__client' ? accent : 'var(--mb-text)'} stroke="var(--mb-panel)" strokeWidth={2}><title>{`${short(data, id)}: primary ${a}. ${r.values[id].note || ''}`}</title></circle>;
            })}
            {seconds[i].map((id, k) => {
              const spread = (k - (seconds[i].length - 1) / 2) * 9;
              const [x, y] = pt(ang(i) + spread, R * 0.45);
              return <circle key={id} cx={x} cy={y} r={4} fill="none" stroke={id === '__client' ? accent : 'var(--mb-text)'} strokeWidth={1.5}><title>{`${short(data, id)}: secondary ${a}`}</title></circle>;
            })}
          </g>
        ))}
      </svg>
      <div className="min-w-0 self-center">
        <div className="mb-2 flex gap-4 text-[11px] text-muted"><span>● Primary</span><span>○ Secondary</span></div>
        <div className="divide-y divide-[var(--mb-line)] text-[12px]">
          {cols.map((id) => (
            <div key={id} className="grid grid-cols-[150px_1fr] gap-2 py-2">
              <CompanyName data={data} id={id} />
              <div>
                <div>{r.values?.[id]?.primary}{r.values?.[id]?.secondary ? <span className="text-muted">, {r.values[id].secondary}</span> : null}</div>
                <div className="text-muted">{r.values?.[id]?.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Romaniuk's distinctive asset grid from data: fame = brand searches (Ahrefs, log scale within the set);
 * uniqueness = for colours, distance to the nearest other accent on the hue wheel; for typefaces, how few
 * others share it (very common faces score lower).
 */
const COMMON_FONTS = /^(inter|roboto|geist|helvetica|arial|open sans|lato|montserrat|poppins|sf pro|system-ui|ibm plex sans|dm sans|manrope)/i;
function hueOf(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function Distinctive({ data, ids, kit, accent }: { data: MarketData; ids: string[]; kit: Kit | null; accent: string }) {
  const brand = (id: string) => (id === '__client' ? kitBranding(kit, data.branding?.[id]) : data.branding?.[id]);
  useFonts(ids.flatMap((id) => brand(id)?.fonts.map((f) => f.family) || []));
  const rows = useMemo(() => {
    const withB = ids.filter((id) => brand(id));
    const lg = (id: string) => Math.log10(Number(companyById(data, id)?.ahrefs?.brand_global || 0) + 1);
    const lmin = Math.min(...withB.map(lg)), lmax = Math.max(...withB.map(lg));
    const fame = (id: string) => (lmax > lmin ? Math.round(((lg(id) - lmin) / (lmax - lmin)) * 100) : 50);
    const accents = withB.map((id) => ({ id, hex: brand(id)!.accent })).filter((a) => a.hex) as { id: string; hex: string }[];
    const fonts = withB.map((id) => ({ id, f: brand(id)!.fonts[0]?.family })).filter((x) => x.f) as { id: string; f: string }[];
    const out: { id: string; x: number; y: number; label: string; note: string; fill?: string; text?: string; font?: string; client?: boolean }[] = [];
    for (const a of accents) {
      const others = accents.filter((o) => o.id !== a.id).map((o) => { const d = Math.abs(hueOf(o.hex) - hueOf(a.hex)); return Math.min(d, 360 - d); });
      const nearest = others.length ? Math.min(...others) : 180;
      out.push({ id: a.id, x: fame(a.id), y: Math.round(Math.min(1, nearest / 60) * 100), label: `${short(data, a.id)} colour`, note: `${a.hex}, ${Math.round(nearest)}° from the nearest other accent`, fill: a.hex, client: a.id === '__client' });
    }
    for (const f of fonts) {
      const shared = fonts.filter((o) => o.id !== f.id && o.f.toLowerCase() === f.f.toLowerCase()).length;
      let u = 100 - (shared / Math.max(1, fonts.length - 1)) * 100;
      if (COMMON_FONTS.test(f.f)) u = Math.min(u, 30);
      out.push({ id: `${f.id}`, x: fame(f.id), y: Math.round(u), label: `${short(data, f.id)} type`, note: `${f.f}${shared ? `, shared with ${shared} other${shared > 1 ? 's' : ''}` : ''}${COMMON_FONTS.test(f.f) ? ', a very common face' : ''}`, text: 'Aa', font: f.f, client: f.id === '__client' });
    }
    return out;
  }, [data, ids, kit]);
  if (!rows.length) return <div className="py-16 text-center text-[13px] text-muted">Needs colours and fonts: run Lenses → Competitor branding first.</div>;
  const r = { axes: { x: ['Less known (brand searches)', 'Famous'], y: ['Shared with others', 'Unique'] } };
  return (
    <div className="space-y-4">
      <Scatter data={data} r={r} accent={accent} quads={['Investment potential', 'Use or lose', 'Ignore or test', 'Avoid using alone']} points={rows} render />
      <table className="w-full text-[12px]">
        <tbody className="divide-y divide-[var(--mb-line)]">
          {[...rows].sort((a, b) => b.y + b.x - (a.y + a.x)).map((p) => (
            <tr key={p.label}>
              <td className="w-48 py-1.5 pr-3">{p.label}</td>
              <td className="w-10 py-1.5">{p.text ? <span style={{ fontFamily: `"${p.font}"` }}>Aa</span> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-line align-middle" style={{ background: p.fill }} />}</td>
              <td className="num w-28 py-1.5 text-muted">fame {p.x}, unique {p.y}</td>
              <td className="py-1.5 text-muted">{p.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[11px] text-muted">Fame: brand searches per month (Ahrefs), log scale from the least to the most searched brand in this set. Uniqueness: colours by distance to the nearest other accent on the hue wheel; typefaces by how many others use the same one (very common faces score low).</div>
    </div>
  );
}
