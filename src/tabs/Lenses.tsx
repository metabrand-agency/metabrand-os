// Lenses: ways of looking at the market. Matrices are AI-suggested (brand axes) or custom; agency can drag to adjust.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Btn, Card, Input, Label } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import SeoLens from './SeoLens';
import BrandingLens from './BrandingLens';
import MethodsLens from './MethodsLens';
import { Company, Dossier, EmptyResearch, Lens, MarketData, OVERLAP, RefreshButton, Swatch, lensesOf, selectedIds, shortName, useResearch, useClientColor } from './marketShared';

const LENS_LABEL: Record<string, string> = { promise_clusters: 'Promise clusters', perceptual_map: 'Perceptual map', proof: 'Proof audit' };

// plot geometry (SVG viewBox units)
const W = 1000, H = 660, PL = 56, PR = 56, PT = 48, PB = 48;
const px = (x: number) => PL + (x / 100) * (W - PL - PR);
const py = (y: number) => PT + ((100 - y) / 100) * (H - PT - PB);
const R_ON = 10, R_OFF = 6;
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

type Pt = { id: string; x: number; y: number; r: number; text: string; fs: number };
type Place = { x: number; y: number; anchor: 'start' | 'end' | 'middle' };
type Box = { x0: number; y0: number; x1: number; y1: number };

// Greedy label placement: try right, left, diagonals, above, below; avoid dots and earlier labels.
function placeLabels(pts: Pt[]): Record<string, Place> {
  const boxes: Box[] = [];
  const out: Record<string, Place> = {};
  const hitsDot = (b: Box, self: string) => pts.filter((p) => p.id !== self && p.x + p.r + 4 > b.x0 && p.x - p.r - 4 < b.x1 && p.y + p.r + 4 > b.y0 && p.y - p.r - 4 < b.y1).length;
  const hitsBox = (b: Box) => boxes.filter((o) => o.x1 > b.x0 && o.x0 < b.x1 && o.y1 > b.y0 && o.y0 < b.y1).length;
  for (const p of pts) {
    const w = p.text.length * p.fs * (p.id === '__client' ? 0.6 : 0.56), g = p.r + 6, asc = p.fs * 0.75, desc = p.fs * 0.25, d = p.fs * 0.7;
    const side = (dir: 1 | -1, dy: number): Place & { b: Box } => ({
      x: p.x + dir * g, y: p.y + asc / 2 + dy, anchor: dir > 0 ? 'start' : 'end',
      b: { x0: dir > 0 ? p.x + g : p.x - g - w, x1: dir > 0 ? p.x + g + w : p.x - g, y0: p.y - asc / 2 + dy, y1: p.y + asc / 2 + desc + dy },
    });
    const cands = [
      side(1, 0), side(-1, 0), side(1, d), side(1, -d), side(-1, d), side(-1, -d),
      { x: p.x, y: p.y - g, anchor: 'middle' as const, b: { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - g - asc, y1: p.y - g + desc } },
      { x: p.x, y: p.y + g + asc, anchor: 'middle' as const, b: { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y + g, y1: p.y + g + asc + desc } },
    ];
    let best = cands[0], bestScore = Infinity;
    for (const c of cands) {
      const outside = c.b.x0 < PL - 20 || c.b.x1 > W - PR + 20 || c.b.y0 < PT - 4 || c.b.y1 > H - PB + 4 ? 5 : 0;
      const score = outside + hitsDot(c.b, p.id) * 2 + hitsBox(c.b) * 3;
      if (score < bestScore) { best = c; bestScore = score; }
      if (score === 0) break;
    }
    boxes.push(best.b);
    out[p.id] = { x: best.x, y: best.y, anchor: best.anchor };
  }
  return out;
}

export default function Lenses({ info, focus, view = 'maps' }: { info: WsInfo; focus?: string; view?: 'maps' | 'seo' | 'branding' | 'methods' }) {
  const agency = info.access.isAgency;
  const { row, setRow, reload, hasNew, save, accept } = useResearch(info.slug);
  const accent = useClientColor(info.slug);
  const [lensId, setLensId] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hl, setHl] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [scope, setScope] = useState<'focus' | 'all'>('focus');
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState<{ id: string; moved: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const data = row?.data;
  const lenses = useMemo(() => (data ? lensesOf(data) : []), [data]);
  const lens = lenses.find((l) => l.id === lensId) || lenses[0];
  const focusIds = useMemo(() => (data ? selectedIds(data) : new Set<string>()), [data]);

  useEffect(() => {
    if (!data || !focus) return;
    const f = focus.toLowerCase();
    const l = lenses.find((x) => x.id === focus || x.title.toLowerCase().includes(f));
    if (l) { setLensId(l.id); return; }
    if (OVERLAP[f]) { setFilter(f); return; }
    const c = data.companies.find((x) => x.id === f || x.name.toLowerCase().includes(f));
    if (c) setSel(c.id);
  }, [data, focus, lenses]);

  const pts = useMemo(() => {
    if (!data || !lens) return [] as Pt[];
    const cl = lens.positions.__client;
    return [
      ...(cl ? [{ id: '__client', x: px(cl.x), y: py(cl.y), r: 14, text: data.client.name, fs: 18 }] : []),
      ...[...data.companies].sort((a, b) => Number(focusIds.has(b.id)) - Number(focusIds.has(a.id))).filter((c) => lens.positions[c.id] && (scope === 'all' || focusIds.has(c.id)))
        .map((c) => ({ id: c.id, x: px(lens.positions[c.id].x), y: py(lens.positions[c.id].y), r: focusIds.has(c.id) ? R_ON : R_OFF, text: shortName(c), fs: 16 })),
    ];
  }, [data, lens, scope, focusIds]);
  const labels = useMemo(() => placeLabels(pts), [pts]);

  if (row === undefined) return <div className="text-muted">Loading…</div>;
  if (!data || !lens) return <EmptyResearch info={info} title="Lenses" onLoaded={reload} />;

  if (view === 'methods') {
    return <div className="@container"><MethodsLens info={info} data={data} accept={accept} extra={<RefreshButton hasNew={hasNew} onClick={reload} />} /></div>;
  }

  if (view === 'branding') {
    return <div className="@container"><BrandingLens info={info} data={data} accept={accept} extra={<RefreshButton hasNew={hasNew} onClick={reload} />} /></div>;
  }

  if (view === 'seo') {
    return (
      <div className="@container space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">SEO content gap</h1>
            <div className="mt-1 text-[13px] text-muted">Organic search keywords of the client and the competitors in focus, from Ahrefs</div>
          </div>
          <RefreshButton hasNew={hasNew} onClick={reload} />
        </div>
        <SeoLens info={info} data={data} setRow={setRow} />
      </div>
    );
  }

  const saveLenses = (next: Lens[]) => save({ ...data, lenses: next });
  const setLocalLens = (l: Lens) => setRow({ ...row!, data: { ...data, lenses: lenses.map((x) => (x.id === l.id ? l : x)) } as MarketData });

  const N = data.companies.length;
  const inScope = (c: Company) => scope === 'all' || focusIds.has(c.id);
  const visible = (c: Company) => (!filter || c.overlap === filter) && (!hl || hl.includes(c.id));
  const unplaced = data.companies.filter((c) => inScope(c) && !lens.positions[c.id]);
  async function placeMissing() {
    setErr(''); setPlacing(true);
    try {
      const r = await api<{ lenses: Lens[] }>(`/w/${info.slug}/lenses/ai`, { body: { title: lens.title, axes: { x: lens.axes.x, y: lens.axes.y } } });
      const got = r.lenses?.[0]?.positions || {};
      const add = Object.fromEntries(unplaced.filter((c) => got[c.id]).map((c) => [c.id, got[c.id]]));
      saveLenses(lenses.map((l) => (l.id === lens.id ? { ...l, positions: { ...l.positions, ...add } } : l)));
    } catch (e: any) { setErr(e.message); } finally { setPlacing(false); }
  }
  const counts = Object.fromEntries(Object.keys(OVERLAP).map((k) => [k, data.companies.filter((c) => c.overlap === k && inScope(c)).length]));
  const selected = sel ? data.companies.find((c) => c.id === sel) : null;
  const tipId = hover || sel;
  const tipCo = tipId ? (tipId === '__client' ? data.client : data.companies.find((c) => c.id === tipId)) : null;
  const tipPos = tipId ? lens.positions[tipId] : null;

  function toPlot(e: React.PointerEvent) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const q = pt.matrixTransform(m.inverse());
    return { x: clamp(((q.x - PL) / (W - PL - PR)) * 100), y: clamp(100 - ((q.y - PT) / (H - PT - PB)) * 100) };
  }
  function onMove(e: React.PointerEvent) {
    if (!drag || !agency) return;
    const q = toPlot(e);
    if (!q) return;
    const p = lens.positions[drag.id];
    setDrag({ ...drag, moved: true });
    setLocalLens({ ...lens, positions: { ...lens.positions, [drag.id]: { ...p, ai_x: p.ai_x ?? p.x, ai_y: p.ai_y ?? p.y, x: Math.round(q.x), y: Math.round(q.y), adjusted: true } } });
  }
  function onUp() {
    if (!drag) return;
    if (drag.moved) saveLenses(lensesOf(row!.data));
    else setSel(drag.id === sel ? null : drag.id);
    setDrag(null);
  }

  const selPos = selected ? lens.positions[selected.id] : lens.positions.__client;
  const posBlock = selPos && (
    <div className="mt-5 rounded-md bg-panel-2 p-3 text-[12px]">
      <div className="flex items-center justify-between text-muted">
        <span>On “{lens.title}”</span>
        <span className="num">x {selPos.x}, y {selPos.y}</span>
      </div>
      {selPos.note && <div className="mt-1.5 text-text">{selPos.note}</div>}
      <div className="mt-1.5 flex items-center justify-between text-muted">
        <span>{selPos.adjusted ? `Adjusted (AI: ${selPos.ai_x}, ${selPos.ai_y})` : 'AI estimate'}</span>
        {agency && selPos.adjusted && (
          <button className="underline hover:text-text" onClick={() => {
            const id = selected ? selected.id : '__client';
            saveLenses(lenses.map((l) => (l.id === lens.id ? { ...l, positions: { ...l.positions, [id]: { ...selPos, x: selPos.ai_x ?? selPos.x, y: selPos.ai_y ?? selPos.y, adjusted: false } } } : l)));
          }}>Reset</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market maps</h1>
          <div className="mt-1 text-[13px] text-muted">{focusIds.size} competitors in focus of {N}, {lenses.length} {lenses.length === 1 ? 'map' : 'maps'}</div>
        </div>
        <RefreshButton hasNew={hasNew} onClick={reload} />
      </div>

      {/* lens switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {lenses.map((l) => (
          <button key={l.id} onClick={() => { setLensId(l.id); setAdding(false); }} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[13px] ${l.id === lens.id && !adding ? 'border-text bg-panel' : 'border-line text-muted hover:text-text'}`}>
            {l.title}
            <span className="rounded border border-line px-1 text-[10px] text-muted">{l.source === 'ai' ? 'AI' : 'Custom'}</span>
          </button>
        ))}
        {agency && (
          <button onClick={() => setAdding(!adding)} className={`rounded-md border border-dashed px-3 py-1.5 text-[13px] ${adding ? 'border-text' : 'border-line text-muted hover:text-text'}`}>+ New lens</button>
        )}
      </div>

      {adding && agency && (
        <NewLens slug={info.slug} existing={lenses} onAdd={(ls) => { saveLenses([...lenses, ...ls]); setLensId(ls[0]?.id || null); setAdding(false); }} />
      )}

      {/* legend = filter */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter(null)} className={`rounded-full border px-3 py-1 text-[12px] ${!filter ? 'border-text' : 'border-line text-muted hover:text-text'}`}>All types</button>
        {Object.entries(OVERLAP).map(([k, o]) => (
          <button key={k} title={o.note} onClick={() => setFilter(filter === k ? null : k)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${filter === k ? 'border-text' : 'border-line text-muted hover:text-text'}`}>
            <Swatch k={k} /> {o.label} <span className="num">{counts[k]}</span>
          </button>
        ))}
        <span className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] text-muted"><span className="brand-dot h-2.5 w-2.5 rounded-full" /> Client</span>
        <div className="ml-auto flex items-center gap-1 text-[12px]">
          {([['focus', `In focus ${focusIds.size}`], ['all', `All ${N}`]] as ['focus' | 'all', string][]).map(([v, l]) => (
            <button key={v} onClick={() => setScope(v)} className={`rounded-md px-2 py-1 ${scope === v ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="relative overflow-hidden">
          {lens.why && <div className="border-b border-line px-4 py-2.5 text-[13px]"><span className="font-medium">{lens.title}.</span> <span className="text-muted">{lens.why}</span></div>}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full select-none"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => { if (drag) onUp(); }}
            role="img"
            aria-label={`${lens.title}: ${lens.axes.x.left} to ${lens.axes.x.right}, ${lens.axes.y.bottom} to ${lens.axes.y.top}`}
          >
            <defs>
              <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--mb-line)" /></pattern>
            </defs>
            <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="url(#dots)" />
            <line x1={px(50)} x2={px(50)} y1={PT} y2={H - PB} stroke="var(--mb-line)" strokeWidth={1.5} />
            <line x1={PL} x2={W - PR} y1={py(50)} y2={py(50)} stroke="var(--mb-line)" strokeWidth={1.5} />
            <g fontSize={15} fill="var(--mb-muted)">
              <text x={PL} y={H - 16}>← {lens.axes.x.left}</text>
              <text x={W - PR} y={H - 16} textAnchor="end">{lens.axes.x.right} →</text>
              <text x={px(50)} y={PT - 16} textAnchor="middle">↑ {lens.axes.y.top}</text>
              <text x={px(50)} y={H - 16} textAnchor="middle">↓ {lens.axes.y.bottom}</text>
            </g>

            {data.companies.filter((c) => lens.positions[c.id] && inScope(c)).sort((a, b) => Number(focusIds.has(a.id)) - Number(focusIds.has(b.id))).map((c) => {
              const o = OVERLAP[c.overlap] || OVERLAP.direct;
              const p = lens.positions[c.id];
              const on = visible(c);
              const inFocus = focusIds.has(c.id);
              const r = inFocus ? R_ON : R_OFF;
              const isSel = sel === c.id, isHover = hover === c.id;
              const showLabel = on && (inFocus || isSel || isHover || !!hl);
              const lp = labels[c.id];
              const hollow = c.overlap === 'may_enter';
              return (
                <g
                  key={c.id}
                  style={{ opacity: on ? (inFocus ? 1 : 0.55) : 0.13, transition: 'opacity .2s', cursor: agency ? (drag ? 'grabbing' : 'grab') : 'pointer' }}
                  onPointerEnter={() => setHover(c.id)}
                  onPointerLeave={() => setHover(null)}
                  onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: c.id, moved: false }); }}
                >
                  <circle cx={px(p.x)} cy={py(p.y)} r={18} fill="transparent" />
                  {(isSel || isHover) && <circle cx={px(p.x)} cy={py(p.y)} r={r + 5} fill="none" stroke="var(--mb-text)" strokeWidth={1.5} />}
                  <circle cx={px(p.x)} cy={py(p.y)} r={r} fill={hollow ? 'var(--mb-panel)' : o.color} stroke={hollow ? 'var(--mb-muted)' : 'var(--mb-panel)'} strokeWidth={2} strokeDasharray={hollow ? '3 2' : undefined} />
                  {showLabel && (
                    <text x={lp?.x} y={lp?.y} fontSize={16} fill="var(--mb-text)" textAnchor={lp?.anchor} style={{ paintOrder: 'stroke', stroke: 'var(--mb-panel)', strokeWidth: 4 }} fontWeight={isSel ? 600 : 400}>
                      {shortName(c)}{p.adjusted && agency ? '*' : ''}
                    </text>
                  )}
                </g>
              );
            })}

            {lens.positions.__client && (() => {
              const p = lens.positions.__client;
              return (
                <g
                  onPointerEnter={() => setHover('__client')}
                  onPointerLeave={() => setHover(null)}
                  onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: '__client', moved: false }); }}
                  style={{ cursor: agency ? 'grab' : 'pointer' }}
                >
                  <circle cx={px(p.x)} cy={py(p.y)} r={22} fill={accent} opacity={0.22} />
                  <circle cx={px(p.x)} cy={py(p.y)} r={14} fill={accent} />
                  <text x={labels.__client?.x} y={labels.__client?.y} textAnchor={labels.__client?.anchor} fontSize={18} fontWeight={600} fill="var(--mb-text)" style={{ paintOrder: 'stroke', stroke: 'var(--mb-panel)', strokeWidth: 5 }}>{data.client.name}</text>
                </g>
              );
            })()}
          </svg>

          {tipCo && tipPos && !drag && (
            <div
              className="pointer-events-none absolute z-10 w-64 rounded-md border border-line bg-panel p-3 text-[12px] shadow-lg"
              style={{
                left: `${(px(tipPos.x) / W) * 100}%`,
                top: `${(py(tipPos.y) / H) * 100}%`,
                transform: `translate(${tipPos.x > 55 ? 'calc(-100% - 16px)' : '16px'}, ${tipPos.y < 35 ? 'calc(-100% - 12px)' : '12px'})`,
              }}
            >
              <div className="font-medium text-text">{tipCo.name}</div>
              <div className="mt-0.5 text-muted">{tipCo.segment || tipCo.category_label}</div>
              {tipCo.hero && <div className="mt-2 text-text">“{tipCo.hero}”</div>}
              {tipPos.note && <div className="mt-2 text-muted">{tipPos.note}</div>}
              <div className="mt-2 flex justify-between text-muted">
                <span>{tipId === '__client' ? 'Client' : `${OVERLAP[tipCo.overlap]?.label}${focusIds.has(tipCo.id) ? ', in focus' : ''}`}</span>
                <span className="num">x {tipPos.x}, y {tipPos.y}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
            <span>
              {lens.source === 'ai' ? 'AI estimate from public messaging.' : 'Custom axes, companies placed by AI.'}{agency && ' Drag a point to adjust; the AI estimate is kept.'}
              {agency && unplaced.length > 0 && <> <button disabled={placing} onClick={placeMissing} className="underline hover:text-text">{placing ? 'Placing…' : `Place ${unplaced.length} new with AI`}</button></>}
              {err && <span className="text-[var(--color-direct)]"> {err}</span>}
            </span>
            {agency && lenses.length > 1 && (
              <button className="shrink-0 hover:text-text" onClick={() => { if (confirm(`Delete lens “${lens.title}”?`)) { saveLenses(lenses.filter((l) => l.id !== lens.id)); setLensId(null); } }}>Delete lens</button>
            )}
          </div>
        </Card>

        <Dossier c={selected || data.client} isClient={!selected} onClose={selected ? () => setSel(null) : undefined} extra={posBlock} />
      </div>

    </div>
  );
}

function NewLens({ slug, existing, onAdd }: { slug: string; existing: Lens[]; onAdd: (l: Lens[]) => void }) {
  const [busy, setBusy] = useState<'suggest' | 'custom' | null>(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ title: '', xl: '', xr: '', yb: '', yt: '' });
  async function run(kind: 'suggest' | 'custom') {
    setErr(''); setBusy(kind);
    try {
      const body = kind === 'suggest'
        ? { existing: existing.map((l) => `${l.title} (${l.axes.x.left} ↔ ${l.axes.x.right}; ${l.axes.y.bottom} ↔ ${l.axes.y.top})`) }
        : { title: f.title || `${f.xl} ↔ ${f.xr} / ${f.yb} ↔ ${f.yt}`, axes: { x: { left: f.xl, right: f.xr }, y: { bottom: f.yb, top: f.yt } } };
      const r = await api<{ lenses: Lens[] }>(`/w/${slug}/lenses/ai`, { body });
      if (!r.lenses?.length) throw new Error('No lenses returned');
      onAdd(r.lenses);
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  const customOk = f.xl && f.xr && f.yb && f.yt;
  return (
    <Card className="grid gap-6 p-5 @3xl:grid-cols-2">
      <div>
        <div className="text-[14px] font-medium">Suggest with AI</div>
        <p className="mt-1 text-[13px] text-muted">Three brand matrices that separate this market, like Reliable ↔ Visionary or Technical ↔ Human. Every company is placed from its public messaging, with a one-line reason.</p>
        <div className="mt-4"><Btn kind="primary" disabled={!!busy} onClick={() => run('suggest')}>{busy === 'suggest' ? 'Thinking… about 30 s' : 'Suggest 3 lenses'}</Btn></div>
      </div>
      <div>
        <div className="text-[14px] font-medium">Custom matrix</div>
        <div className="mt-3 space-y-2">
          <Input placeholder="Name (optional), e.g. Brand personality" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="X left, e.g. Reliable" value={f.xl} onChange={(e) => setF({ ...f, xl: e.target.value })} />
            <Input placeholder="X right, e.g. Visionary" value={f.xr} onChange={(e) => setF({ ...f, xr: e.target.value })} />
            <Input placeholder="Y bottom, e.g. Technical" value={f.yb} onChange={(e) => setF({ ...f, yb: e.target.value })} />
            <Input placeholder="Y top, e.g. Human" value={f.yt} onChange={(e) => setF({ ...f, yt: e.target.value })} />
          </div>
          <Btn disabled={!customOk || !!busy} onClick={() => run('custom')}>{busy === 'custom' ? 'Placing companies…' : 'Place companies with AI'}</Btn>
        </div>
      </div>
      {err && <div className="text-[12px] text-[var(--color-direct)] @3xl:col-span-2">{err}</div>}
    </Card>
  );
}
