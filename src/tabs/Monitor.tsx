// PR Monitor: backlinks from articles (Ahrefs) and own news (blog, changelog) for the client and the
// competitors in focus, newest first. Same view for any project.
import { useState } from 'react';
import { api } from '../api';
import { Input } from '../components/ui';
import { Icon } from '../components/icons';
import { Btn, Card, Favicon, Select } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { EmptyResearch, MarketData, Row, RefreshButton, companyById, displayName, domain, focusOrder, useActivityRefresh, useClientColor, useResearch } from './marketShared';
import { Bar, Bars } from './Bars';

type Item = { id: string; kind: 'post' | 'link'; title: string; url: string; date?: string; source?: string; site?: string; dr?: number; type?: string };

/** Small preview: the page's own image (og:image), or the site's icon when it has none. */
function Thumb({ x }: { x: Item }) {
  const [failed, setFailed] = useState(false);
  const box = 'h-10 w-16 shrink-0 overflow-hidden rounded border border-line bg-panel-2';
  if (!failed) return <img src={`/api/og?u=${encodeURIComponent(x.url)}`} alt="" loading="lazy" onError={() => setFailed(true)} className={`${box} object-cover`} />;
  return <span className={`${box} flex items-center justify-center`}><img src={`https://www.google.com/s2/favicons?domain=${domain(x.url)}&sz=64`} alt="" loading="lazy" className="h-5 w-5 rounded-sm" /></span>;
}
const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const KINDS = ['all', 'link', 'post'] as const;
const KIND_LABEL: Record<Item['kind'], string> = { link: 'Backlink', post: 'Own news' };
const PERIODS = ['30', '90', 'all'] as const;

export default function Monitor({ info }: { info: WsInfo }) {
  const agency = info.access.isAgency;
  const { row, reload, hasNew, accept, save } = useResearch(info.slug);
  const data = row?.data;
  const { busy, progress, err, refresh, label } = useActivityRefresh(info.slug, data, accept, agency);
  const accent = useClientColor(info.slug);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('30');

  if (row === undefined) return <div className="text-muted">Loading…</div>;
  if (!data) return <EmptyResearch info={info} title="PR Monitor" onLoaded={reload} />;

  const ids = focusOrder(data);
  const activity = data.activity || {};
  const since = period === 'all' ? 0 : Date.now() - Number(period) * 864e5;
  const itemsOf = (id: string): Item[] => {
    const a = activity[id];
    if (!a) return [];
    return [
      ...(a.links?.latest || []).map((l) => ({ id, kind: 'link' as const, ...l })),
      ...(a.latest || []).map((p) => ({ id, kind: 'post' as const, ...p, source: domain(p.url) })),
    ]
      .filter((x) => (kind === 'all' || x.kind === kind) && (!since || (x.date && +new Date(x.date) >= since)))
      .sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  };
  const bars = (f: (id: string) => number | null | undefined, label?: (id: string) => string | undefined): Bar[] =>
    ids.map((id) => { const v = f(id); return { id, c: companyById(data, id), value: v == null ? null : v, label: v != null ? label?.(id) : undefined }; });

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PR Monitor</h1>
          <div className="mt-1 text-[13px] text-muted">Backlinks from articles and own news of {data.client.name} and {ids.length - 1} competitors in focus</div>
        </div>
        <div className="flex gap-2">
          {agency && <Btn disabled={busy} onClick={() => refresh(undefined, true)}>{label}</Btn>}
          <RefreshButton hasNew={hasNew} onClick={reload} />
        </div>
      </div>
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Bars accent={accent} title="New backlinks from articles" hint="Ahrefs, last 30 days" rows={bars((id) => activity[id]?.links?.count_30d, (id) => (activity[id]?.links?.capped ? `${activity[id].links!.count_30d}+` : undefined))} format={(n) => String(n)} />
        <Bars accent={accent} title="Own news" hint="Blog and changelog, last 30 days" rows={bars((id) => activity[id]?.posts_30d, (id) => (activity[id]?.posts_30d_more ? `${activity[id].posts_30d}+` : undefined))} format={(n) => String(n)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onChange={(v) => setKind(v as typeof kind)} options={KINDS} labels={{ all: 'All types', link: 'Backlinks from articles', post: 'Own news' }} />
        <Select value={period} onChange={(v) => setPeriod(v as typeof period)} options={PERIODS} labels={{ 30: 'Last 30 days', 90: 'Last 90 days', all: 'Any time' }} />
      </div>

      <div className="grid items-start gap-3 @3xl:grid-cols-2">
        {ids.map((id) => <CompanyFeed key={id} data={data} id={id} items={itemsOf(id)} working={progress.active.includes(id)} busy={busy} />)}
      </div>

      <Ideas info={info} data={data} accept={accept} />

    </div>
  );
}

/** One company: counts, then its backlinks from articles and own news, newest first. */
function CompanyFeed({ data, id, items, working, busy }: { data: MarketData; id: string; items: Item[]; working: boolean; busy: boolean }) {
  const [all, setAll] = useState(false);
  const c = companyById(data, id);
  const a = data.activity?.[id];
  const shown = all ? items : items.slice(0, 6);
  const stat = (n: number | undefined, more: boolean | undefined, word: string, hint: string) => (
    <span title={`${hint}, last 30 days`} className="rounded border border-line px-1.5 py-0.5"><span className="num text-text">{n == null ? '—' : `${n}${more ? '+' : ''}`}</span> {n === 1 ? word.replace(/s$/, '') : word}</span>
  );
  return (
    <Card className={`overflow-hidden ${working ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <span className={`flex min-w-0 items-center gap-2 text-[13px] ${id === '__client' ? 'font-semibold' : 'font-medium'}`}><Favicon url={c.url} name={c.name} />{displayName(data, id)}</span>
        <span className="flex flex-wrap gap-1.5 text-[11px] text-muted">
          {working ? 'Checking…' : (
            <>
              {stat(a?.links?.count_30d, a?.links?.capped, 'backlinks', 'New links from articles, Ahrefs')}
              {stat(a?.posts_30d, a?.posts_30d_more, 'own news', 'Blog and changelog')}
            </>
          )}
        </span>
      </div>
      {!a && <div className="px-4 py-6 text-[12px] text-muted">{busy ? 'Waiting…' : 'Not checked yet'}</div>}
      {a && !items.length && <div className="px-4 py-6 text-[12px] text-muted">Nothing for these filters.</div>}
      <ul className="divide-y divide-[var(--mb-line)]">
        {shown.map((x) => (
          <li key={x.kind + x.url} className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2">
            <Thumb x={x} />
            <div className="min-w-0 flex-1">
              <a href={x.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-[12px] leading-snug hover:underline">{x.title}</a>
              <div className="mt-0.5 flex min-w-0 gap-2 text-[11px] text-muted">
                <span className="num shrink-0">{fmtDay(x.date)}</span>
                <span className="shrink-0" title={x.type}>{KIND_LABEL[x.kind]}</span>
                <span className="truncate">{x.source}</span>
                {x.dr != null && <span className="num shrink-0" title="Ahrefs Domain Rating of the linking site">DR {x.dr}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <button onClick={() => setAll(!all)} className="w-full border-t border-line px-4 py-2 text-left text-[12px] text-muted hover:text-text">{all ? 'Show fewer' : `Show all ${items.length}`}</button>
      )}
      {a && !a.latest?.length && <div className="border-t border-line px-4 py-2 text-[11px] text-muted">No blog, changelog or feed found on the site</div>}
    </Card>
  );
}


const titleOf = (data: MarketData, url: string) => {
  for (const [id, a] of Object.entries(data.activity || {})) {
    const l = a.links?.latest?.find((x) => x.url === url);
    if (l) return { id, title: l.title, source: l.source };
  }
  return null;
};

/** Article ideas for the client, drawn from what the press writes about the competitors (and about the client). */
function Ideas({ info, data, accept }: { info: WsInfo; data: MarketData; accept: (r: Row) => void }) {
  const agency = info.access.isAgency;
  const [focus, setFocus] = useState(data.pr_ideas?.focus || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const p = data.pr_ideas;
  const run = async () => {
    setBusy(true); setErr('');
    try { accept(await api<Row>(`/w/${info.slug}/monitor/ideas`, { method: 'POST', body: { focus } })); }
    catch (e: any) { setErr(e.message || 'Could not generate ideas'); }
    setBusy(false);
  };
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[15px] font-semibold"><Icon name="generate" />Article ideas for {data.client.name}</div>
          <div className="mt-1 max-w-[640px] text-[12px] text-muted">From what the press writes about the competitors and about {data.client.name}: what to publish or pitch, where, and which coverage it answers.</div>
        </div>
        {agency && (
          <form onSubmit={(e) => { e.preventDefault(); if (!busy) run(); }} className="flex min-w-[320px] flex-1 justify-end gap-2 @3xl:flex-none">
            <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (optional): launch, funding, security…" className="@3xl:w-[300px]" />
            <button type="submit" disabled={busy} className="brand-dot flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium text-brand-ink hover:brightness-95 disabled:opacity-60">
              {busy ? 'Thinking…' : p ? 'Generate new ideas' : 'Generate article ideas'}
            </button>
          </form>
        )}
      </div>
      {err && <div className="px-5 pt-3 text-[12px] text-[var(--color-direct)]">{err}</div>}
      {!p && !busy && <div className="px-5 py-6 text-[13px] text-muted">{agency ? 'No ideas yet.' : 'The agency has not generated ideas yet.'}</div>}
      {busy && !p && <div className="px-5 py-6 text-[13px] text-muted">Reading the coverage of every company…</div>}
      {p && (
        <div className={busy ? 'opacity-60' : ''}>
          {p.summary && <p className="border-b border-line px-5 py-3 text-[13px] leading-relaxed">{p.summary}</p>}
          <div className="grid gap-px bg-[var(--mb-line)] @3xl:grid-cols-2">
            {p.ideas.map((x, i) => (
              <div key={i} className="bg-panel px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[14px] font-medium leading-snug">{x.title}</div>
                  {x.format && <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[.06em] text-muted">{x.format}</span>}
                </div>
                {x.angle && <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{x.angle}</p>}
                {x.gap && <p className="mt-1.5 text-[11px] text-muted"><span className="text-text">Gap:</span> {x.gap}</p>}
                {!!x.pitch_to.length && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-muted">Pitch to</span>
                    {x.pitch_to.map((d) => (
                      <a key={d} href={`https://${d}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 hover:bg-panel-2">
                        <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=32`} alt="" className="h-3 w-3 rounded-sm" />{d}
                      </a>
                    ))}
                  </div>
                )}
                {!!x.inspired_by.length && (
                  <div className="mt-2 space-y-0.5 text-[11px] text-muted">
                    {x.inspired_by.map((u) => {
                      const t = titleOf(data, u);
                      return (
                        <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate hover:text-text">
                          ↳ {t ? `${displayName(data, t.id)}: “${t.title}”` : domain(u)}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-line px-5 py-2 text-[11px] text-muted">Generated {new Date(p.generated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{p.focus ? `, focus: ${p.focus}` : ''}</div>
        </div>
      )}
    </Card>
  );
}
