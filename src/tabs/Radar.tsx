// Brand Radar: the client and the competitors in focus side by side. Brand searches, search traffic,
// authority, team, funding, publishing activity, HQ map and the latest posts. Same view for any project.
import { lazy, ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Btn, Card, Favicon, Label } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { Company, EmptyResearch, RefreshButton, Row, fmtNum, selectedIds, shortName, useResearch } from './marketShared';

const WorldMap = lazy(() => import('./WorldMap'));

type Bar = { id: string; c: Company; value: number | null; label?: string };
const money = (s?: string | null) => {
  const m = s?.match(/\$\s?([\d.,]+)\s?([KMB])\b/i);
  return m ? parseFloat(m[1].replace(',', '')) * ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[m[2].toUpperCase()] : null;
};
const fmtMoney = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e5) / 10}M` : `$${Math.round(n / 1e3)}K`);
const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Bars({ title, hint, rows, format = fmtNum }: { title: string; hint: string; rows: Bar[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  const sorted = [...rows].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </div>
      <div className="space-y-2">
        {sorted.map((r) => (
          <div key={r.id} className="grid grid-cols-[120px_1fr] items-center gap-3 text-[12px]" title={r.value != null ? `${r.c.name}: ${r.label || format(r.value)}` : `${r.c.name}: no data`}>
            <span className={`flex min-w-0 items-center gap-1.5 ${r.id === '__client' ? 'font-medium' : ''}`}><Favicon url={r.c.url} name={r.c.name} size={14} /><span className="truncate">{r.id === '__client' ? r.c.name : shortName(r.c)}</span></span>
            <span className="flex min-w-0 items-center gap-2">
              {r.value != null && r.value > 0 && (
                <span
                  className="h-3 shrink-0 rounded-r-[3px]"
                  style={{ width: `${Math.max(1.5, (r.value / max) * 78)}%`, background: r.id === '__client' ? 'var(--mb-brand)' : 'var(--mb-muted)', boxShadow: r.id === '__client' ? 'inset 0 0 0 1px var(--mb-brand-edge)' : undefined }}
                />
              )}
              <span className="num truncate text-muted">{r.value == null ? '—' : r.label || format(r.value)}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Radar({ info }: { info: WsInfo }) {
  const agency = info.access.isAgency;
  const { row, setRow, reload, hasNew } = useResearch(info.slug);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const tried = useRef(false);
  const data = row?.data;

  const ids = data ? ['__client', ...data.companies.filter((c) => selectedIds(data).has(c.id)).map((c) => c.id)] : [];
  const byId = (id: string) => (id === '__client' ? data!.client : data!.companies.find((c) => c.id === id)!);

  async function refresh() {
    setErr(''); setBusy(true);
    try { setRow(await api<Row>(`/w/${info.slug}/radar/refresh`, { body: {} })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  // first visit: collect activity and locations for anyone missing them (agency only, free sources)
  useEffect(() => {
    if (!data || !agency || tried.current) return;
    const act = data.activity || {};
    if (ids.some((id) => !act[id] || (byId(id)?.hq && !byId(id)?.geo))) { tried.current = true; refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (row === undefined) return <div className="text-muted">Loading…</div>;
  if (!data) return <EmptyResearch info={info} title="Brand Radar" onLoaded={reload} />;

  const activity = data.activity || {};
  const bars = (f: (c: Company, id: string) => number | null | undefined, label?: (c: Company) => string | undefined): Bar[] =>
    ids.map((id) => { const c = byId(id); const v = f(c, id); return { id, c, value: v == null || isNaN(v) ? null : v, label: v != null ? label?.(c) : undefined }; });
  const team = (c: Company) => (c.employees ? parseInt(String(c.employees).replace(/\D/g, ''), 10) : null);
  const geo = ids.map((id) => ({ id, c: byId(id) })).filter((x) => x.c.geo);

  const chart = (node: ReactNode) => node;
  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brand Radar</h1>
          <div className="mt-1 text-[13px] text-muted">{data.client.name} and {ids.length - 1} competitors in focus</div>
        </div>
        <div className="flex gap-2">
          {agency && <Btn disabled={busy} onClick={refresh}>{busy ? 'Updating activity…' : 'Update activity'}</Btn>}
          <RefreshButton hasNew={hasNew} onClick={reload} />
        </div>
      </div>
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      <div className="grid gap-4 @3xl:grid-cols-2">
        {chart(<Bars title="Brand searches" hint="Ahrefs, per month, worldwide" rows={bars((c) => c.ahrefs?.brand_global)} />)}
        {chart(<Bars title="Search traffic" hint="Ahrefs, organic visits per month" rows={bars((c) => c.ahrefs?.traffic)} />)}
        {chart(<Bars title="Domain Rating" hint="Ahrefs, 0–100" rows={bars((c) => c.ahrefs?.dr)} format={(n) => String(n)} />)}
        {chart(<Bars title="Linking sites" hint="Ahrefs, referring domains" rows={bars((c) => c.ahrefs?.refdomains)} />)}
        {chart(<Bars title="Posts in the last 30 days" hint="Blog and news, from feeds" rows={bars((_c, id) => activity[id]?.posts_30d ?? null)} format={(n) => String(n)} />)}
        {chart(<Bars title="Team" hint="Employees, Apollo estimate" rows={bars(team)} />)}
        {chart(<Bars title="Last round" hint="Amount, Apollo and research" rows={bars((c) => money(c.last_round || c.funding), (c) => (c.last_round || c.funding || '').replace(/\s*\(.*?\)/, ''))} format={fmtMoney} />)}
      </div>

      <div>
        <Label>Headquarters</Label>
        <Card className="p-2">
          {geo.length ? (
            <Suspense fallback={<div className="h-64" />}>
              <WorldMap points={geo.map(({ id, c }) => ({ id, name: id === '__client' ? c.name : shortName(c), lat: c.geo!.lat, lng: c.geo!.lng, client: id === '__client' }))} />
            </Suspense>
          ) : <div className="p-6 text-[13px] text-muted">{busy ? 'Locating headquarters…' : 'No locations yet.'}</div>}
        </Card>
      </div>

      <div>
        <Label>Latest posts</Label>
        <div className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
          {ids.map((id) => {
            const c = byId(id);
            const a = activity[id];
            return (
              <Card key={id} className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13px] font-medium"><Favicon url={c.url} name={c.name} />{id === '__client' ? c.name : shortName(c)}</span>
                  {a && <span className="num text-[11px] text-muted">{a.posts_30d} in 30 days</span>}
                </div>
                {!a && <div className="text-[12px] text-muted">{busy ? 'Checking…' : 'Not checked yet'}</div>}
                {a && !a.latest?.length && <div className="text-[12px] text-muted">No blog or news feed found</div>}
                <ul className="space-y-1.5">
                  {(a?.latest || []).slice(0, 3).map((p) => (
                    <li key={p.url} className="text-[12px]">
                      <a href={p.url} target="_blank" className="line-clamp-2 hover:underline">{p.title}</a>
                      {p.date && <div className="num text-[11px] text-muted">{fmtDay(p.date)}</div>}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
