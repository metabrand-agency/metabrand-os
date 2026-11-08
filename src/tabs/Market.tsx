import { useEffect, useMemo, useRef, useState } from 'react';
import { api, fmtDate } from '../api';
import { Badge, Btn, Card, Label } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';

type Company = {
  id: string; name: string; short?: string; url?: string; tier: number; overlap: string; segment?: string; category_label?: string;
  hero?: string; sub?: string; claims?: string[]; proof?: string[]; funding?: string | null; hq?: string; founded?: number;
  open_source?: boolean | null; x: number; y: number; ai_x?: number; ai_y?: number; adjusted?: boolean; sources?: string[];
};
type Finding = { lens?: string; title: string; what: string; so_what: string; now_what: string; confidence?: string };
type MarketData = {
  client: Company & { founders?: string }; axes: { x: { left: string; right: string }; y: { bottom: string; top: string }; note?: string };
  companies: Company[]; findings: Finding[]; research_log_stats?: Record<string, number>;
};

// Three validated hues + a neutral hollow mark for "may enter" (not in the market yet).
const OVERLAP: Record<string, { label: string; color: string; note: string }> = {
  direct: { label: 'Direct', color: 'var(--color-direct)', note: 'Same buyer, same job' },
  angle: { label: 'Adjacent', color: 'var(--color-angle)', note: 'Platform approaching from another side' },
  substitute: { label: 'Substitute', color: 'var(--color-substitute)', note: 'Different product, same budget' },
  may_enter: { label: 'May enter', color: 'var(--mb-muted)', note: 'Could move into the space' },
};
const LENS_LABEL: Record<string, string> = { promise_clusters: 'Promise clusters', perceptual_map: 'Perceptual map', proof: 'Proof audit' };

// plot geometry (SVG viewBox units)
const W = 1000, H = 660, PL = 56, PR = 56, PT = 48, PB = 48;
const px = (x: number) => PL + (x / 100) * (W - PL - PR);
const py = (y: number) => PT + ((100 - y) / 100) * (H - PT - PB);
const R: Record<number, number> = { 1: 11, 2: 8.5, 3: 6.5 };
const shortName = (c: Company) => c.short || c.name.replace(/\s*\(.*\)/, '');
const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Greedy label placement: try right, left, above, below; avoid dots and earlier labels.
type Place = { x: number; y: number; anchor: 'start' | 'end' | 'middle' };
function placeLabels(client: Company | null, companies: Company[]): Record<string, Place> {
  const pts = [
    ...(client && client.x != null ? [{ id: '__client', x: px(client.x), y: py(client.y), r: 14, text: client.name, fs: 18 }] : []),
    ...[...companies].sort((a, b) => a.tier - b.tier).map((c) => ({ id: c.id, x: px(c.x), y: py(c.y), r: R[c.tier] || 6, text: shortName(c), fs: 16 })),
  ];
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out: Record<string, Place> = {};
  const hitsDot = (b: { x0: number; y0: number; x1: number; y1: number }, self: string) =>
    pts.filter((p) => p.id !== self && p.x + p.r + 4 > b.x0 && p.x - p.r - 4 < b.x1 && p.y + p.r + 4 > b.y0 && p.y - p.r - 4 < b.y1).length;
  const hitsBox = (b: { x0: number; y0: number; x1: number; y1: number }) => boxes.filter((o) => o.x1 > b.x0 && o.x0 < b.x1 && o.y1 > b.y0 && o.y0 < b.y1).length;
  for (const p of pts) {
    const w = p.text.length * p.fs * (p.id === '__client' ? 0.6 : 0.56), g = p.r + 6, asc = p.fs * 0.75, desc = p.fs * 0.25;
    const side = (dir: 1 | -1, dy: number): Place & { b: { x0: number; y0: number; x1: number; y1: number } } => ({
      x: p.x + dir * g, y: p.y + asc / 2 + dy, anchor: dir > 0 ? 'start' : 'end',
      b: { x0: dir > 0 ? p.x + g : p.x - g - w, x1: dir > 0 ? p.x + g + w : p.x - g, y0: p.y - asc / 2 + dy, y1: p.y + asc / 2 + desc + dy },
    });
    const d = p.fs * 0.7;
    const cands: (Place & { b: { x0: number; y0: number; x1: number; y1: number } })[] = [
      side(1, 0), side(-1, 0), side(1, d), side(1, -d), side(-1, d), side(-1, -d),
      { x: p.x, y: p.y - g, anchor: 'middle', b: { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - g - asc, y1: p.y - g + desc } },
      { x: p.x, y: p.y + g + asc, anchor: 'middle', b: { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y + g, y1: p.y + g + asc + desc } },
    ];
    let best = cands[0], bestScore = Infinity;
    for (const c of cands) {
      const out_ = c.b.x0 < PL - 20 || c.b.x1 > W - PR + 20 || c.b.y0 < PT - 4 || c.b.y1 > H - PB + 4 ? 5 : 0;
      const score = out_ + hitsDot(c.b, p.id) * 2 + hitsBox(c.b) * 3;
      if (score < bestScore) { best = c; bestScore = score; }
      if (score === 0) break;
    }
    boxes.push(best.b);
    out[p.id] = { x: best.x, y: best.y, anchor: best.anchor };
  }
  return out;
}

// replay timeline (fractions of total)
const T = 9500;
const STEPS = [
  { key: 'client', label: 'Reading the client site', a: 0, b: 0.07 },
  { key: 'search', label: 'Searching the category and lookalikes', a: 0.07, b: 0.25 },
  { key: 'read', label: 'Reading sources', a: 0.25, b: 0.48 },
  { key: 'claims', label: 'Extracting positioning claims', a: 0.48, b: 0.62 },
  { key: 'place', label: 'Placing companies on the axes', a: 0.62, b: 0.9 },
  { key: 'findings', label: 'Writing findings', a: 0.9, b: 1 },
];

export default function Market({ info, focus }: { info: WsInfo; focus?: string }) {
  const s = info.slug;
  const agency = info.access.isAgency;
  const [row, setRow] = useState<{ data: MarketData; status: string; updated_at: number } | null | undefined>(undefined);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hl, setHl] = useState<string[] | null>(null); // highlighted by a finding
  const [filter, setFilter] = useState<string | null>(null);
  const [tierMax, setTierMax] = useState(3);
  const [t, setT] = useState<number | null>(null); // replay clock, null = idle
  const [drag, setDrag] = useState<{ id: string; moved: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api(`/w/${s}/research/market_map`).then((r) => setRow(r || null)).catch(() => setRow(null));
  }, [s]);

  const data = row?.data;

  // focus from the AI chat: a company id/name or an overlap type
  useEffect(() => {
    if (!data || !focus) return;
    const f = focus.toLowerCase();
    if (OVERLAP[f]) { setFilter(f); return; }
    const c = data.companies.find((x) => x.id === f || x.name.toLowerCase().includes(f));
    if (c) setSel(c.id);
  }, [data, focus]);

  // first open in this session → replay the build (for the room / Zoom)
  useEffect(() => {
    if (!data) return;
    const k = `mos_replayed_${s}`;
    if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); setT(0); }
  }, [data, s]);

  useEffect(() => {
    if (t === null) return;
    let raf = 0;
    const start = performance.now() - t;
    const tick = (now: number) => {
      const el = now - start;
      if (el >= T) { setT(null); return; }
      setT(el);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t === null]);

  const sources = useMemo(() => {
    if (!data) return [] as string[];
    return [...new Set([...(data.client.sources || []), ...data.companies.flatMap((c) => c.sources || [])])];
  }, [data]);

  const labels = useMemo(() => (data ? placeLabels(data.client, data.companies) : {}), [data]);

  if (row === undefined) return <div className="text-muted">Loading…</div>;
  if (!data) return <Empty info={info} onLoaded={(r) => setRow(r)} />;

  const stats = data.research_log_stats || {};
  const N = data.companies.length;
  const building = t !== null;
  const p = building ? t! / T : 1;
  const stepP = (k: string) => { const st = STEPS.find((x) => x.key === k)!; return clamp((p - st.a) / (st.b - st.a)); };
  const shownCount = building ? Math.floor(stepP('place') * N) : N;
  const clientShown = !building || p > STEPS[0].b;
  const counters = {
    searches: Math.round(stepP('search') * (stats.searches ?? 0)),
    pages: Math.round(stepP('read') * (stats.pages_fetched ?? 0)),
    sources: Math.round(stepP('read') * (stats.sources ?? sources.length)),
    claims: Math.round(stepP('claims') * (stats.claims_extracted ?? 0)),
    companies: shownCount,
  };

  const visible = (c: Company) => (!filter || c.overlap === filter) && c.tier <= tierMax && (!hl || hl.includes(c.id));
  const counts = Object.fromEntries(Object.keys(OVERLAP).map((k) => [k, data.companies.filter((c) => c.overlap === k).length]));
  const selected = sel ? data.companies.find((c) => c.id === sel) : null;
  const tipId = hover || sel;
  const hovered = tipId ? (tipId === '__client' ? data.client : data.companies.find((c) => c.id === tipId)) : null;

  async function save(next: MarketData, status = row!.status) {
    setSaving(true);
    setRow({ ...row!, data: next, status });
    await api(`/w/${s}/research/market_map`, { method: 'PUT', body: { data: next, status } }).finally(() => setSaving(false));
  }

  function toPlot(e: React.PointerEvent) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const q = pt.matrixTransform(m.inverse());
    return { x: clamp(((q.x - PL) / (W - PL - PR)) * 100, 0, 100), y: clamp(100 - ((q.y - PT) / (H - PT - PB)) * 100, 0, 100) };
  }
  function onMove(e: React.PointerEvent) {
    if (!drag || !agency) return;
    const q = toPlot(e);
    if (!q) return;
    setDrag({ ...drag, moved: true });
    setRow({
      ...row!,
      data: { ...data!, companies: data!.companies.map((c) => (c.id === drag.id ? { ...c, ai_x: c.ai_x ?? c.x, ai_y: c.ai_y ?? c.y, x: Math.round(q.x), y: Math.round(q.y), adjusted: true } : c)) },
    });
  }
  function onUp() {
    if (!drag) return;
    if (drag.moved) save(data!);
    else setSel(drag.id === sel ? null : drag.id);
    setDrag(null);
  }

  // live log lines for the replay
  const log: string[] = [];
  if (building) {
    log.push(`read ${domain(data.client.url || '')} → hero, claims, proof`);
    const segs = [...new Set(data.companies.map((c) => c.segment).filter(Boolean))] as string[];
    segs.slice(0, Math.round(stepP('search') * Math.min(segs.length, stats.searches ?? 9))).forEach((x) => log.push(`search  ${x}`));
    sources.slice(0, Math.round(stepP('read') * sources.length)).forEach((u) => log.push(`fetch   ${domain(u)}`));
    data.companies.slice(0, Math.round(stepP('claims') * N)).forEach((c) => log.push(`claims  ${shortName(c)} · “${(c.hero || '').slice(0, 38)}”`));
    data.companies.slice(0, shownCount).forEach((c) => log.push(`place   ${shortName(c)} → (${c.x}, ${c.y})`));
    data.findings.slice(0, Math.round(stepP('findings') * data.findings.length)).forEach((f) => log.push(`finding ${f.title}`));
  }
  const curStep = STEPS.find((x) => p >= x.a && p < x.b);

  return (
    <div className="@container space-y-6" ref={topRef}>
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market map</h1>
          <div className="mt-1 text-[13px] text-muted">
            {data.client.category_label} · {N} companies · updated {fmtDate(row!.updated_at)}
            {agency && <> · <span className={row!.status === 'published' ? 'text-text' : ''}>{row!.status === 'published' ? 'shared with client' : 'draft, agency only'}</span></>}
            {saving && <span className="ml-2">saving…</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Btn onClick={() => { setSel(null); setFilter(null); setHl(null); setT(0); }} disabled={building}>{building ? 'Building…' : '↻ Replay build'}</Btn>
          {agency && (
            <Btn kind="primary" onClick={() => save(data, row!.status === 'published' ? 'draft' : 'published')}>
              {row!.status === 'published' ? 'Unpublish' : 'Publish to client'}
            </Btn>
          )}
        </div>
      </div>

      {/* research log counters */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line @xl:grid-cols-5">
        {[
          ['Searches', counters.searches],
          ['Pages read', counters.pages],
          ['Sources', counters.sources],
          ['Claims extracted', counters.claims],
          ['Companies mapped', counters.companies],
        ].map(([l, v]) => (
          <div key={l as string} className="bg-panel px-4 py-3">
            <div className="num text-[22px] font-medium">{v}</div>
            <div className="mt-0.5 text-[11px] text-muted">{l}</div>
          </div>
        ))}
      </div>

      {/* legend = filter (one row above the chart) */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter(null)} className={`rounded-full border px-3 py-1 text-[12px] ${!filter ? 'border-text' : 'border-line text-muted hover:text-text'}`}>All {N}</button>
        {Object.entries(OVERLAP).map(([k, o]) => (
          <button key={k} title={o.note} onClick={() => setFilter(filter === k ? null : k)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${filter === k ? 'border-text' : 'border-line text-muted hover:text-text'}`}>
            <Swatch k={k} /> {o.label} <span className="num">{counts[k]}</span>
          </button>
        ))}
        <span className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] text-muted"><span className="brand-dot h-2.5 w-2.5 rounded-full" /> Client</span>
        <div className="ml-auto flex items-center gap-1 text-[12px]">
          {[[1, 'Key'], [2, 'Key + 2nd'], [3, 'All tiers']].map(([v, l]) => (
            <button key={v} onClick={() => setTierMax(v as number)} className={`rounded-md px-2 py-1 ${tierMax === v ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* the map */}
        <Card className="relative overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full select-none"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => { if (drag) onUp(); }}
            role="img"
            aria-label={`Perceptual map: ${data.axes.x.left} to ${data.axes.x.right}, ${data.axes.y.bottom} to ${data.axes.y.top}`}
          >
            <defs>
              <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--mb-line)" /></pattern>
            </defs>
            <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="url(#dots)" />
            <line x1={px(50)} x2={px(50)} y1={PT} y2={H - PB} stroke="var(--mb-line)" strokeWidth={1.5} />
            <line x1={PL} x2={W - PR} y1={py(50)} y2={py(50)} stroke="var(--mb-line)" strokeWidth={1.5} />
            {/* axis labels */}
            <g fontSize={15} fill="var(--mb-muted)">
              <text x={PL} y={H - 16}>← {data.axes.x.left}</text>
              <text x={W - PR} y={H - 16} textAnchor="end">{data.axes.x.right} →</text>
              <text x={px(50)} y={PT - 16} textAnchor="middle">↑ {data.axes.y.top}</text>
              <text x={px(50)} y={H - 16} textAnchor="middle">↓ {data.axes.y.bottom}</text>
            </g>

            {/* companies */}
            {data.companies.slice(0, shownCount).map((c, i) => {
              const o = OVERLAP[c.overlap] || OVERLAP.direct;
              const on = visible(c);
              const r = R[c.tier] || 6;
              const isSel = sel === c.id, isHover = hover === c.id;
              const showLabel = on && (c.tier <= 2 || isSel || isHover || !!hl);
              const lp = labels[c.id];
              const hollow = c.overlap === 'may_enter';
              return (
                <g
                  key={c.id}
                  className={building ? 'anim-pop' : ''}
                  style={{ opacity: on ? 1 : 0.13, transition: 'opacity .2s', cursor: agency ? (drag ? 'grabbing' : 'grab') : 'pointer' }}
                  onPointerEnter={() => setHover(c.id)}
                  onPointerLeave={() => setHover(null)}
                  onPointerDown={(e) => { if (building) return; (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: c.id, moved: false }); }}
                >
                  <circle cx={px(c.x)} cy={py(c.y)} r={18} fill="transparent" />
                  {(isSel || isHover) && <circle cx={px(c.x)} cy={py(c.y)} r={r + 5} fill="none" stroke="var(--mb-text)" strokeWidth={1.5} />}
                  <circle
                    cx={px(c.x)} cy={py(c.y)} r={r}
                    fill={hollow ? 'var(--mb-panel)' : o.color}
                    stroke={hollow ? 'var(--mb-muted)' : 'var(--mb-panel)'}
                    strokeWidth={2}
                    strokeDasharray={hollow ? '3 2' : undefined}
                  />
                  {showLabel && (
                    <text x={lp?.x ?? px(c.x) + r + 6} y={lp?.y ?? py(c.y) + 5.5} fontSize={16} fill="var(--mb-text)" textAnchor={lp?.anchor ?? 'start'} style={{ paintOrder: 'stroke', stroke: 'var(--mb-panel)', strokeWidth: 4 }} fontWeight={isSel ? 600 : 400}>
                      {shortName(c)}{c.adjusted && agency ? ' ·' : ''}
                    </text>
                  )}
                  {i === shownCount - 1 && building && <circle cx={px(c.x)} cy={py(c.y)} r={r} fill="none" stroke={o.color} strokeWidth={2} className="anim-ring" />}
                </g>
              );
            })}

            {/* client */}
            {clientShown && data.client.x != null && (
              <g className={building ? 'anim-pop' : ''} onPointerEnter={() => setHover('__client')} onPointerLeave={() => setHover(null)} onClick={() => setSel(null)} style={{ cursor: 'pointer' }}>
                <circle cx={px(data.client.x)} cy={py(data.client.y)} r={14} fill="var(--mb-brand)" className="anim-ring" />
                <circle cx={px(data.client.x)} cy={py(data.client.y)} r={14} fill="var(--mb-brand)" stroke="var(--mb-text)" strokeWidth={2} />
                <text x={labels.__client?.x} y={labels.__client?.y} textAnchor={labels.__client?.anchor} fontSize={18} fontWeight={600} fill="var(--mb-text)" style={{ paintOrder: 'stroke', stroke: 'var(--mb-panel)', strokeWidth: 5 }}>{data.client.name}</text>
              </g>
            )}
          </svg>

          {/* hover tooltip */}
          {hovered && !drag && (
            <div
              className="pointer-events-none absolute z-10 w-64 rounded-lg border border-line bg-panel p-3 text-[12px] shadow-lg"
              style={{
                left: `${(px(hovered.x) / W) * 100}%`,
                top: `${(py(hovered.y) / H) * 100}%`,
                transform: `translate(${hovered.x > 55 ? 'calc(-100% - 16px)' : '16px'}, ${hovered.y < 35 ? 'calc(-100% - 12px)' : '12px'})`,
              }}
            >
              <div className="font-medium text-text">{hovered.name}</div>
              <div className="mt-0.5 text-muted">{hovered.segment || hovered.category_label}</div>
              {hovered.hero && <div className="mt-2 text-text">“{hovered.hero}”</div>}
              {hovered.funding && <div className="mt-2 text-muted">{hovered.funding}</div>}
              <div className="mt-2 flex justify-between text-muted">
                <span>{hovered.overlap ? OVERLAP[hovered.overlap]?.label : 'Client'}{hovered.tier ? ` · tier ${hovered.tier}` : ''}</span>
                <span className="num">x {hovered.x} · y {hovered.y}</span>
              </div>
            </div>
          )}

          {/* live build console */}
          {building && (
            <div className="absolute bottom-3 right-3 w-[min(420px,70%)] rounded-lg border border-line bg-panel/95 p-3 shadow-lg backdrop-blur">
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="font-medium">{curStep?.label}…</span>
                <span className="num text-muted">{Math.round(p * 100)}%</span>
              </div>
              <div className="mb-2 h-1 overflow-hidden rounded bg-panel-2"><div className="h-full bg-text" style={{ width: `${p * 100}%` }} /></div>
              <div className="mono h-[132px] overflow-hidden text-[11px] leading-[16.5px] text-muted">
                {log.slice(-8).map((l, i) => <div key={log.length - 8 + i} className="truncate anim-rise">{l}</div>)}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-muted">
            <span>{data.axes.note}{agency && ' Drag a point to adjust; the AI estimate is kept.'}</span>
            <span>Size = tier</span>
          </div>
        </Card>

        {/* dossier */}
        <Dossier c={selected || data.client} isClient={!selected} agency={agency}
          onReset={selected?.adjusted ? () => save({ ...data, companies: data.companies.map((c) => (c.id === selected.id ? { ...c, x: c.ai_x ?? c.x, y: c.ai_y ?? c.y, adjusted: false } : c)) }) : undefined}
          onClose={selected ? () => setSel(null) : undefined} />
      </div>

      {/* findings */}
      {!building && (
        <div>
          <Label>Findings</Label>
          <div className="grid gap-4 @3xl:grid-cols-3">
            {data.findings.map((f, i) => {
              const ids = data.companies.filter((c) => f.what.includes(shortName(c)) || f.what.includes(c.name.split(' ')[0])).map((c) => c.id);
              return (
                <Card key={i} className="anim-rise p-4 transition hover:border-muted">
                  <div onMouseEnter={() => ids.length && setHl(ids)} onMouseLeave={() => setHl(null)}>
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>{LENS_LABEL[f.lens || ''] || f.lens}</span>
                      {f.confidence && <span>confidence: {f.confidence}</span>}
                    </div>
                    <div className="mt-2 text-[15px] font-medium leading-snug">{f.title}</div>
                    <dl className="mt-3 space-y-2 text-[13px] leading-relaxed">
                      <div><dt className="text-[11px] text-muted">What</dt><dd>{f.what}</dd></div>
                      <div><dt className="text-[11px] text-muted">So what</dt><dd>{f.so_what}</dd></div>
                      <div><dt className="text-[11px] text-muted">Now what</dt><dd>{f.now_what}</dd></div>
                    </dl>
                    {ids.length > 0 && <div className="mt-3 text-[11px] text-muted">Hover to highlight {ids.length} on the map</div>}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* table view (accessible alternative to the chart) */}
      <div>
        <Label>All companies</Label>
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Overlap</th>
                <th className="px-4 py-2 font-medium">Tier</th>
                <th className="px-4 py-2 font-medium">Segment</th>
                <th className="px-4 py-2 font-medium">Hero line</th>
                <th className="px-4 py-2 font-medium">Funding</th>
              </tr>
            </thead>
            <tbody>
              {[...data.companies].sort((a, b) => a.tier - b.tier).map((c) => (
                <tr key={c.id} onClick={() => { setSel(c.id); topRef.current?.scrollIntoView({ behavior: 'smooth' }); }} className={`cursor-pointer border-b border-line last:border-0 hover:bg-panel-2 ${sel === c.id ? 'bg-panel-2' : ''}`}>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">{shortName(c)}</td>
                  <td className="px-4 py-2 whitespace-nowrap"><span className="flex items-center gap-1.5"><Swatch k={c.overlap} />{OVERLAP[c.overlap]?.label}</span></td>
                  <td className="num px-4 py-2">{c.tier}</td>
                  <td className="px-4 py-2 text-muted">{c.segment}</td>
                  <td className="px-4 py-2">{c.hero}</td>
                  <td className="px-4 py-2 text-muted">{c.funding || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {agency && <JsonEditor data={data} onSave={(d) => save(d)} />}
    </div>
  );
}

function Swatch({ k }: { k: string }) {
  if (k === 'may_enter') return <span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted" />;
  return <span className="h-2.5 w-2.5 rounded-full" style={{ background: OVERLAP[k]?.color }} />;
}

function Dossier({ c, isClient, agency, onReset, onClose }: { c: Company & { founders?: string }; isClient: boolean; agency: boolean; onReset?: () => void; onClose?: () => void }) {
  const rows: [string, React.ReactNode][] = [
    ['Calls itself', c.category_label],
    ['Funding', c.funding],
    ['HQ', c.hq],
    ['Founded', c.founded],
    ['Founders', c.founders],
    ['Open source', c.open_source == null ? null : c.open_source ? 'Yes' : 'No'],
  ].filter(([, v]) => v != null && v !== '') as [string, React.ReactNode][];
  return (
    <Card className="h-fit p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          {isClient ? <><span className="brand-dot h-2.5 w-2.5 rounded-full" />Client</> : <><Swatch k={c.overlap} />{OVERLAP[c.overlap]?.label} · tier {c.tier}</>}
        </div>
        {onClose && <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close">✕</button>}
      </div>
      <div className="mt-2 text-lg font-semibold tracking-tight">{c.name}</div>
      {c.url && <a href={c.url} target="_blank" className="text-[12px] text-muted hover:text-text">{domain(c.url)} ↗</a>}
      {c.hero && <div className="mt-4 text-[17px] leading-snug">“{c.hero}”</div>}
      {c.sub && <div className="mt-1 text-[13px] text-muted">{c.sub}</div>}

      {!!c.claims?.length && (
        <div className="mt-5">
          <Label>Claims</Label>
          <div className="flex flex-wrap gap-1.5">{c.claims.map((x) => <span key={x} className="rounded-md bg-panel-2 px-2 py-1 text-[12px]">{x}</span>)}</div>
        </div>
      )}
      {!!c.proof?.length && (
        <div className="mt-5">
          <Label>Proof</Label>
          <ul className="space-y-1 text-[13px]">{c.proof.map((x) => <li key={x} className="flex gap-2"><span className="text-muted">—</span>{x}</li>)}</ul>
        </div>
      )}
      {rows.length > 0 && (
        <dl className="mt-5 divide-y divide-line border-y border-line text-[13px]">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}
        </dl>
      )}
      {!isClient && (
        <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
          <span className="num">Position x {c.x} · y {c.y} · {c.adjusted ? `adjusted (AI: ${c.ai_x}, ${c.ai_y})` : 'AI estimate'}</span>
          {agency && onReset && <button onClick={onReset} className="underline hover:text-text">Reset</button>}
        </div>
      )}
      {!!c.sources?.length && (
        <div className="mt-5">
          <Label>Sources · {c.sources.length}</Label>
          <ul className="space-y-1 text-[12px]">{c.sources.map((u) => <li key={u}><a href={u} target="_blank" className="text-muted hover:text-text">{domain(u)} ↗</a></li>)}</ul>
        </div>
      )}
    </Card>
  );
}

function JsonEditor({ data, onSave }: { data: MarketData; onSave: (d: MarketData) => void }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="text-[12px]">
      <button onClick={() => { setOpen(!open); setTxt(JSON.stringify(data, null, 2)); setErr(''); }} className="text-muted hover:text-text">{open ? '▾' : '▸'} Data (JSON) · agency only</button>
      {open && (
        <div className="mt-2 space-y-2">
          <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={14} className="mono w-full rounded-lg border border-line bg-panel p-3 outline-none" />
          {err && <div className="text-[var(--color-direct)]">{err}</div>}
          <Btn kind="primary" onClick={() => { try { const d = JSON.parse(txt); if (!Array.isArray(d.companies)) throw new Error('Needs a "companies" array'); onSave(d); setOpen(false); } catch (e: any) { setErr(e.message); } }}>Save data</Btn>
        </div>
      )}
    </div>
  );
}

function Empty({ info, onLoaded }: { info: WsInfo; onLoaded: (r: any) => void }) {
  const [txt, setTxt] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Market map</h1>
      <Card className="p-6">
        <div className="text-[14px]">{info.access.isAgency ? 'No market map for this project yet.' : 'The market map will appear here once the research is shared with you.'}</div>
        {info.access.isAgency && (
          <div className="mt-4 space-y-2">
            <div className="text-[13px] text-muted">Paste research JSON (client, axes, companies, findings), produced by a research run.</div>
            <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={8} placeholder='{"client": {...}, "axes": {...}, "companies": [...], "findings": [...]}' className="mono w-full rounded-lg border border-line bg-panel p-3 text-[12px] outline-none" />
            {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}
            <Btn kind="primary" onClick={async () => {
              try {
                const d = JSON.parse(txt);
                if (!Array.isArray(d.companies)) throw new Error('Needs a "companies" array');
                await api(`/w/${info.slug}/research/market_map`, { method: 'PUT', body: { data: d, status: 'draft' } });
                onLoaded({ data: d, status: 'draft', updated_at: Date.now() });
              } catch (e: any) { setErr(e.message); }
            }}>Save as draft</Btn>
          </div>
        )}
      </Card>
    </div>
  );
}
