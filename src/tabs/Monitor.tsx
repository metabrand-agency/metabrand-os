// PR Monitor: news mentions (Google News) and own posts (blog, changelog) for the client and the
// competitors in focus, newest first. Same view for any project.
import { useState } from 'react';
import { Btn, Card, Favicon, Select } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { EmptyResearch, MarketData, RefreshButton, companyById, displayName, domain, focusOrder, useActivityRefresh, useResearch } from './marketShared';

type Item = { id: string; kind: 'news' | 'post' | 'link'; title: string; url: string; date?: string; source?: string; site?: string; dr?: number; type?: string };

/** Small preview: the page's own image for posts and links; the publisher's icon for news (Google News hides the article URL). */
function Thumb({ x }: { x: Item }) {
  const [failed, setFailed] = useState(false);
  const site = x.kind === 'news' ? x.site : domain(x.url);
  const box = 'h-10 w-16 shrink-0 overflow-hidden rounded border border-line bg-panel-2';
  if (x.kind !== 'news' && !failed) return <img src={`/api/og?u=${encodeURIComponent(x.url)}`} alt="" loading="lazy" onError={() => setFailed(true)} className={`${box} object-cover`} />;
  return (
    <span className={`${box} flex items-center justify-center`}>
      {site ? <img src={`https://www.google.com/s2/favicons?domain=${site}&sz=64`} alt="" loading="lazy" className="h-5 w-5 rounded-sm" /> : <span className="text-[11px] text-muted">{(x.source || '?').slice(0, 1)}</span>}
    </span>
  );
}
const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const cleanSource = (s?: string) => (s || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const cleanTitle = (t: string, src?: string) => (src && t.endsWith(` - ${src}`) ? t.slice(0, -(src.length + 3)) : t);
const KINDS = ['all', 'news', 'link', 'post'] as const;
const KIND_LABEL: Record<Item['kind'], string> = { news: 'News', link: 'New link', post: 'Own post' };
const PERIODS = ['30', '90', 'all'] as const;

export default function Monitor({ info }: { info: WsInfo }) {
  const agency = info.access.isAgency;
  const { row, reload, hasNew, accept, save } = useResearch(info.slug);
  const data = row?.data;
  const { busy, progress, err, refresh, label } = useActivityRefresh(info.slug, data, accept, agency);
  const [who, setWho] = useState('all');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('30');

  if (row === undefined) return <div className="text-muted">Loading…</div>;
  if (!data) return <EmptyResearch info={info} title="PR Monitor" onLoaded={reload} />;

  const ids = focusOrder(data);
  const activity = data.activity || {};
  const since = period === 'all' ? 0 : Date.now() - Number(period) * 864e5;
  const items: Item[] = ids.flatMap((id) => {
    const a = activity[id];
    if (!a) return [];
    return [
      ...(a.news?.latest || []).map((n) => ({ id, kind: 'news' as const, ...n, title: cleanTitle(n.title, n.source), source: cleanSource(n.source) })),
      ...(a.latest || []).map((p) => ({ id, kind: 'post' as const, ...p, source: domain(p.url) })),
      ...(a.links?.latest || []).map((l) => ({ id, kind: 'link' as const, ...l })),
    ];
  });
  const shown = items
    .filter((x) => (who === 'all' || x.id === who) && (kind === 'all' || x.kind === kind) && (!since || (x.date && +new Date(x.date) >= since)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const noBlog = ids.filter((id) => activity[id] && !activity[id].latest?.length);
  const pending = ids.filter((id) => !activity[id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PR Monitor</h1>
          <div className="mt-1 text-[13px] text-muted">News, new links from articles and own posts, {data.client.name} and {ids.length - 1} competitors in focus</div>
        </div>
        <div className="flex gap-2">
          {agency && <Btn disabled={busy} onClick={() => refresh(undefined, true)}>{label}</Btn>}
          <RefreshButton hasNew={hasNew} onClick={reload} />
        </div>
      </div>
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={who} onChange={setWho} options={['all', ...ids]} labels={Object.fromEntries([['all', 'All companies'], ...ids.map((id) => [id, displayName(data, id)])])} />
        <Select value={kind} onChange={(v) => setKind(v as typeof kind)} options={KINDS} labels={{ all: 'All types', news: 'News', link: 'New links (Ahrefs)', post: 'Own posts' }} />
        <Select value={period} onChange={(v) => setPeriod(v as typeof period)} options={PERIODS} labels={{ 30: 'Last 30 days', 90: 'Last 90 days', all: 'Any time' }} />
        <span className="num ml-1 text-[12px] text-muted">{shown.length} items</span>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-muted">
              <th className="w-[110px] px-4 py-2 font-medium">Date</th>
              <th className="w-[170px] px-3 py-2 font-medium">Company</th>
              <th className="w-[90px] px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="w-[200px] px-4 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => {
              const c = companyById(data, x.id);
              return (
                <tr key={`${x.id}:${x.url}`} className={`border-b border-line last:border-0 hover:bg-panel-2 ${progress.active.includes(x.id) ? 'bg-panel-2' : ''}`}>
                  <td className="num whitespace-nowrap px-4 py-2 text-muted">{fmtDay(x.date)}</td>
                  <td className="px-3 py-2">
                    <span className={`flex min-w-0 items-center gap-1.5 ${x.id === '__client' ? 'font-medium' : ''}`}><Favicon url={c.url} name={c.name} size={14} /><span className="truncate">{displayName(data, x.id)}</span></span>
                  </td>
                  <td className="px-3 py-2 text-muted" title={x.type}>{KIND_LABEL[x.kind]}</td>
                  <td className="px-3 py-2"><span className="flex items-center gap-3"><Thumb x={x} /><a href={x.url} target="_blank" rel="noreferrer" className="line-clamp-2 hover:underline">{x.title}</a></span></td>
                  <td className="px-4 py-2 text-muted"><span className="flex items-baseline justify-between gap-2"><span className="truncate">{x.source}</span>{x.dr != null && <span className="num shrink-0 text-[11px]" title="Ahrefs Domain Rating of the linking site">DR {x.dr}</span>}</span></td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{busy ? 'Collecting news and posts…' : 'Nothing for these filters.'}</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {(noBlog.length > 0 || pending.length > 0) && (
        <div className="space-y-1 text-[12px] text-muted">
          {noBlog.length > 0 && <div>No blog, changelog or feed found: {noBlog.map((id) => displayName(data, id)).join(', ')}</div>}
          {pending.length > 0 && <div>Not checked yet: {pending.map((id) => displayName(data, id)).join(', ')}</div>}
        </div>
      )}

      {agency && <SearchTerms data={data} ids={ids} busy={busy} onSave={async (id, q) => {
        const set = <T extends object>(c: T): T => { const n: any = { ...c }; if (q) n.news_query = q; else delete n.news_query; return n; };
        await save({ ...data, client: id === '__client' ? set(data.client) : data.client, companies: data.companies.map((c) => (c.id === id ? set(c) : c)) });
        await refresh([id]);
      }} />}
    </div>
  );
}

/** News search per company: the automatic query, or one set by hand when a name is a common word. */
function SearchTerms({ data, ids, busy, onSave }: { data: MarketData; ids: string[]; busy: boolean; onSave: (id: string, q: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="text-[12px] text-muted hover:text-text">{open ? '▾' : '▸'} News search terms</button>
      {open && (
        <Card className="mt-2 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="w-[170px] px-4 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Google News search</th>
                <th className="w-[110px] px-4 py-2 text-right font-medium">Last 30 days</th>
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const c = companyById(data, id);
                const news = data.activity?.[id]?.news;
                return (
                  <tr key={id} className="border-b border-line last:border-0">
                    <td className="px-4 py-1.5"><span className="flex items-center gap-1.5"><Favicon url={c.url} name={c.name} size={14} />{displayName(data, id)}</span></td>
                    <td className="px-3 py-1.5">
                      <input
                        key={`${id}:${c.news_query || ''}`}
                        defaultValue={c.news_query || ''}
                        placeholder={news?.query || 'Automatic'}
                        disabled={busy}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.news_query || '')) onSave(id, v); }}
                        className="num w-full rounded-md border border-line bg-panel px-2 py-1 outline-none placeholder:text-muted hover:border-muted focus:border-muted disabled:opacity-60"
                      />
                    </td>
                    <td className="num px-4 py-1.5 text-right text-muted">{news ? `${Math.min(news.count_30d, 100)}${news.count_30d >= 100 ? '+' : ''}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-line px-4 py-2 text-[11px] text-muted">Leave empty for the automatic search. Quotes match an exact name, for example "Factory" "Grinberg".</div>
        </Card>
      )}
    </div>
  );
}
