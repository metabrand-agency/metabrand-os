// Brand Visibility: the client and the competitors in focus side by side. Brand searches, search traffic,
// authority, news and posts, team, funding and the HQ map. Same view for any project.
import { lazy, ReactNode, Suspense } from 'react';
import { Btn, Card, Label } from '../components/ui';
import { Bar, Bars } from './Bars';
import type { WsInfo } from '../pages/Workspace';
import { Company, EmptyResearch, RefreshButton, companyById, fmtNum, focusOrder, shortName, useActivityRefresh, useClientColor, useResearch } from './marketShared';

const WorldMap = lazy(() => import('./WorldMap'));

const money = (s?: string | null) => {
  const m = s?.match(/\$\s?([\d.,]+)\s?([KMB])\b/i);
  return m ? parseFloat(m[1].replace(',', '')) * ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[m[2].toUpperCase()] : null;
};
const fmtMoney = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e5) / 10}M` : `$${Math.round(n / 1e3)}K`);

export default function Visibility({ info }: { info: WsInfo }) {
  const agency = info.access.isAgency;
  const { row, reload, hasNew, accept } = useResearch(info.slug);
  const data = row?.data;
  const { busy, err, refresh, label } = useActivityRefresh(info.slug, data, accept, agency);
  const accent = useClientColor(info.slug);
  const ids = data ? focusOrder(data) : [];
  const byId = (id: string) => companyById(data!, id);

  if (row === undefined) return <div className="text-muted">Loading…</div>;
  if (!data) return <EmptyResearch info={info} title="Brand Visibility" onLoaded={reload} />;

  const bars = (f: (c: Company, id: string) => number | null | undefined, label?: (c: Company, id: string) => string | undefined): Bar[] =>
    ids.map((id) => { const c = byId(id); const v = f(c, id); return { id, c, value: v == null || isNaN(v) ? null : v, label: v != null ? label?.(c, id) : undefined }; });
  const team = (c: Company) => (c.employees ? parseInt(String(c.employees).replace(/\D/g, ''), 10) : null);
  const geo = ids.map((id) => ({ id, c: byId(id) })).filter((x) => x.c.geo);

  const chart = (node: ReactNode) => node;
  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brand Visibility</h1>
          <div className="mt-1 text-[13px] text-muted">{data.client.name} and {ids.length - 1} competitors in focus</div>
        </div>
        <div className="flex gap-2">
          {agency && <Btn disabled={busy} onClick={() => refresh()}>{label}</Btn>}
          <RefreshButton hasNew={hasNew} onClick={reload} />
        </div>
      </div>
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      <div className="grid gap-4 @3xl:grid-cols-2">
        {chart(<Bars accent={accent} title="Brand searches" hint="Ahrefs, per month, worldwide" rows={bars((c) => c.ahrefs?.brand_global)} />)}
        {chart(<Bars accent={accent} title="Search traffic" hint="Ahrefs, organic visits per month" rows={bars((c) => c.ahrefs?.traffic)} />)}
        {chart(<Bars accent={accent} title="Domain Rating" hint="Ahrefs, 0–100" rows={bars((c) => c.ahrefs?.dr)} format={(n) => String(n)} />)}
        {chart(<Bars accent={accent} title="Linking sites" hint="Ahrefs, referring domains" rows={bars((c) => c.ahrefs?.refdomains)} />)}
        {chart(<Bars accent={accent} title="Team" hint="Employees, Apollo estimate" rows={bars(team)} />)}
        {chart(<Bars accent={accent} title="Last round" hint="Amount, Apollo and research" rows={bars((c) => money(c.last_round || c.funding), (c) => (c.last_round || c.funding || '').replace(/\s*\(.*?\)/, ''))} format={fmtMoney} />)}
      </div>

      <div>
        <Label>Headquarters</Label>
        <Card className="p-2">
          {geo.length ? (
            <Suspense fallback={<div className="h-64" />}>
              <WorldMap accent={accent} points={geo.map(({ id, c }) => ({ id, name: id === '__client' ? c.name : shortName(c), lat: c.geo!.lat, lng: c.geo!.lng, client: id === '__client' }))} />
            </Suspense>
          ) : <div className="p-6 text-[13px] text-muted">{busy ? 'Locating headquarters…' : 'No locations yet.'}</div>}
        </Card>
      </div>

    </div>
  );
}

