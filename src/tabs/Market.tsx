// Market: who is in the space. Company list with dossiers; matrices live in Lenses.
import { Fragment, useEffect, useState } from 'react';
import { fmtDate } from '../api';
import { Card } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { Dossier, EmptyResearch, JsonEditor, OVERLAP, RefreshButton, Swatch, shortName, useResearch } from './marketShared';

export default function Market({ info, focus }: { info: WsInfo; focus?: string }) {
  const { row, reload, hasNew, save } = useResearch(info.slug);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [tierMax, setTierMax] = useState(3);
  const data = row?.data;

  useEffect(() => {
    if (!data || !focus) return;
    const f = focus.toLowerCase();
    if (OVERLAP[f]) { setFilter(f); return; }
    const c = data.companies.find((x) => x.id === f || x.name.toLowerCase().includes(f));
    if (c) setSel(c.id);
  }, [data, focus]);

  if (row === undefined) return <div className="text-muted">Loading…</div>;
  if (!data) return <EmptyResearch info={info} title="Market" onLoaded={reload} />;

  const stats = data.research_log_stats || {};
  const N = data.companies.length;
  const counts = Object.fromEntries(Object.keys(OVERLAP).map((k) => [k, data.companies.filter((c) => c.overlap === k).length]));
  const list = data.companies.filter((c) => (!filter || c.overlap === filter) && c.tier <= tierMax).sort((a, b) => a.tier - b.tier);
  const selected = sel ? data.companies.find((c) => c.id === sel) : null;

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
          <div className="mt-1 text-[13px] text-muted">{data.client.category_label} · {N} companies · updated {fmtDate(row!.updated_at)}</div>
        </div>
        <RefreshButton hasNew={hasNew} onClick={reload} />
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line @xl:grid-cols-5">
        {([
          ['Searches', stats.searches],
          ['Pages read', stats.pages_fetched],
          ['Sources', stats.sources],
          ['Claims extracted', stats.claims_extracted],
          ['Companies', N],
        ] as [string, number | undefined][]).map(([l, v]) => (
          <div key={l} className="bg-panel px-4 py-3">
            <div className="num text-[22px] font-medium">{v ?? '—'}</div>
            <div className="mt-0.5 text-[11px] text-muted">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter(null)} className={`rounded-full border px-3 py-1 text-[12px] ${!filter ? 'border-text' : 'border-line text-muted hover:text-text'}`}>All {N}</button>
        {Object.entries(OVERLAP).map(([k, o]) => (
          <button key={k} title={o.note} onClick={() => setFilter(filter === k ? null : k)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${filter === k ? 'border-text' : 'border-line text-muted hover:text-text'}`}>
            <Swatch k={k} /> {o.label} <span className="num">{counts[k]}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-[12px]">
          {([[1, 'Key'], [2, 'Key + 2nd'], [3, 'All tiers']] as [number, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setTierMax(v)} className={`rounded-md px-2 py-1 ${tierMax === v ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="hidden @4xl:col-start-2 @4xl:row-start-1 @4xl:block">
          <Dossier c={selected || data.client} isClient={!selected} onClose={selected ? () => setSel(null) : undefined} />
        </div>
        <Card className="h-fit overflow-x-auto @4xl:col-start-1 @4xl:row-start-1">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Overlap</th>
                <th className="px-4 py-2 font-medium">Tier</th>
                <th className="px-4 py-2 font-medium">Hero line</th>
                <th className="px-4 py-2 font-medium">Funding</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (<Fragment key={c.id}>
                <tr onClick={() => setSel(c.id === sel ? null : c.id)} className={`cursor-pointer border-b border-line align-top last:border-0 hover:bg-panel-2 ${sel === c.id ? 'bg-panel-2' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium whitespace-nowrap">{shortName(c)}</div>
                    <div className="text-[12px] text-muted">{c.segment}</div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap"><span className="flex items-center gap-1.5"><Swatch k={c.overlap} />{OVERLAP[c.overlap]?.label}</span></td>
                  <td className="num px-4 py-2.5">{c.tier}</td>
                  <td className="px-4 py-2.5">{c.hero}</td>
                  <td className="px-4 py-2.5 text-muted">{c.funding || '—'}</td>
                </tr>
                {sel === c.id && (
                  <tr className="@4xl:hidden">
                    <td colSpan={5} className="bg-panel-2 p-3"><Dossier c={c} isClient={false} onClose={() => setSel(null)} /></td>
                  </tr>
                )}
              </Fragment>))}
            </tbody>
          </table>
        </Card>
      </div>

      {info.access.isAgency && <JsonEditor data={data} onSave={save} />}
    </div>
  );
}
