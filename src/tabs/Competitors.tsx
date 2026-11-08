// Competitors: the project's competitor list. Client-named competitors come from Memory (brief, calls)
// and are flagged; we complement them with adjacent and substitute players.
// Add by name or website (Apollo + AI research), tick which are in focus, enrich facts, remove.
// The table is configurable: columns, sort, filters. It scrolls sideways with the company column pinned.
import { Fragment, ReactNode, useEffect, useState } from 'react';
import { api, fmtDate } from '../api';
import { Btn, Card, Favicon, Input, Select } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { Company, Dossier, EmptyResearch, JsonEditor, MarketData, OVERLAP, RefreshButton, Socials, Swatch, fmtNum, lensesOf, selectedIds, shortName, siteName, useResearch } from './marketShared';

const OVERLAP_ORDER = ['direct', 'angle', 'substitute', 'may_enter'];
const FACTS = ['founded', 'employees', 'last_round', 'hq', 'linkedin', 'founder', 'founder_linkedin', 'open_source'] as const;
const FACT_LABEL: Record<string, string> = { founded: 'founded', employees: 'team', last_round: 'round', hq: 'location', linkedin: 'LinkedIn', founder: 'founder', founder_linkedin: 'founder LinkedIn', open_source: 'open source', socials: 'socials' };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'company';
const teamNum = (c: Company) => (c.employees ? parseInt(String(c.employees).replace(/\D/g, ''), 10) : null);

type Col = { id: string; label: string; title?: string; num?: boolean; short?: boolean; sortable?: boolean; get: (c: Company) => string | number | undefined | null; render?: (c: Company) => ReactNode; cls?: string };

const COLUMNS: Col[] = [
  { id: 'overlap', label: 'Type', get: (c) => OVERLAP_ORDER.indexOf(c.overlap), render: (c) => (c.overlap ? <span className="flex items-center gap-1.5"><Swatch k={c.overlap} />{OVERLAP[c.overlap]?.label}</span> : '') },
  { id: 'website', label: 'Website', get: (c) => siteName(c.url), render: (c) => (c.url ? <a href={c.url} target="_blank" onClick={(e) => e.stopPropagation()} className="text-muted underline decoration-line underline-offset-2 hover:text-text">{siteName(c.url)}</a> : '—') },
  { id: 'social', label: 'Social', sortable: false, get: () => '', render: (c) => <Socials c={c} /> },
  { id: 'founder', label: 'Founder / CEO', get: (c) => c.founder, render: (c) => (c.founder ? (c.founder_linkedin ? <a href={c.founder_linkedin} target="_blank" onClick={(e) => e.stopPropagation()} className="underline decoration-line underline-offset-2 hover:decoration-text">{c.founder}</a> : c.founder) : '—') },
  { id: 'segment', label: 'Segment', get: (c) => c.segment, cls: 'text-muted' },
  { id: 'hero', label: 'Hero line', get: (c) => c.hero, cls: 'max-w-[280px] truncate' },
  { id: 'founded', label: 'Founded', num: true, get: (c) => c.founded },
  { id: 'employees', label: 'Team', num: true, title: 'Employees (Apollo estimate)', get: teamNum, render: (c) => (teamNum(c) != null ? fmtNum(teamNum(c)!) : '—') },
  { id: 'last_round', label: 'Last round', get: (c) => c.last_round || c.funding, cls: 'max-w-[240px] truncate' },
  { id: 'hq', label: 'Location', get: (c) => c.hq, cls: 'max-w-[180px] truncate' },
  { id: 'dr', label: 'DR', num: true, title: 'Ahrefs Domain Rating: strength of the backlink profile, 0–100', get: (c) => c.ahrefs?.dr },
  { id: 'traffic', label: 'Search traffic', num: true, short: true, title: 'Ahrefs: estimated monthly visits from organic search', get: (c) => c.ahrefs?.traffic },
  { id: 'brand', label: 'Brand searches', num: true, title: 'Ahrefs: monthly searches for the brand name, worldwide', get: (c) => c.ahrefs?.brand_global, render: (c) => <span title={c.ahrefs?.brand_query ? `“${c.ahrefs.brand_query}” · US ${fmtNum(c.ahrefs.brand_us)}` : undefined}>{fmtNum(c.ahrefs?.brand_global)}</span> },
  { id: 'refdomains', label: 'Linking sites', num: true, short: true, title: 'Ahrefs: referring domains', get: (c) => c.ahrefs?.refdomains },
];
const DEFAULT_COLS = ['overlap', 'website', 'social', 'founder', 'founded', 'employees', 'last_round', 'hq', 'dr', 'traffic', 'brand'];

function useCols(slug: string) {
  const key = `mos_cols2_${slug}`;
  const [cols, setCols] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(v) ? v : DEFAULT_COLS; } catch { return DEFAULT_COLS; }
  });
  const set = (v: string[]) => { setCols(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  return [cols, set] as const;
}

type Review = {
  named: { name: string; url?: string; existing_id?: string; overlap?: string; quote: string; doc?: string }[];
  review: { id: string; verdict: 'keep' | 'indirect' | 'drop'; overlap?: string; reason: string }[];
  summary: string; docs: string[];
};

export default function Competitors({ info, focus }: { info: WsInfo; focus?: string }) {
  const agency = info.access.isAgency;
  const { row, reload, hasNew, save } = useResearch(info.slug);
  const [cols, setCols] = useCols(info.slug);
  const [picker, setPicker] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const [text, setText] = useState('');
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState('');
  const [overlap, setOverlap] = useState('direct');
  const [busy, setBusy] = useState('');
  const [working, setWorking] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [err, setErr] = useState('');
  const data = row?.data;

  useEffect(() => {
    if (!data || !focus) return;
    const f = focus.toLowerCase();
    if (OVERLAP[f]) { setFilter(f); return; }
    const c = data.companies.find((x) => x.id === f || x.name.toLowerCase().includes(f));
    if (c) setSel(c.id);
  }, [data, focus]);

  if (row === undefined) return <div className="text-muted">Loading…</div>;
  if (!data) return <EmptyResearch info={info} title="Competitors" onLoaded={reload} />;

  const chosen = selectedIds(data);
  const withFlags = (d: MarketData): MarketData => ({ ...d, companies: d.companies.map((c) => ({ ...c, selected: chosen.has(c.id) })) });
  const toggle = (id: string) => {
    const d = withFlags(data);
    save({ ...d, companies: d.companies.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)) });
  };
  const remove = (c: Company) => {
    if (!confirm(`Remove ${c.name} from competitors?`)) return;
    const lenses = lensesOf(data).map((l) => { const { [c.id]: _gone, ...rest } = l.positions; return { ...l, positions: rest }; });
    save({ ...data, companies: data.companies.filter((x) => x.id !== c.id).map((x) => ({ ...x, selected: chosen.has(x.id) })), lenses });
    if (sel === c.id) setSel(null);
  };
  const note = (id: string, msg: string) => {
    setNotes((n) => ({ ...n, [id]: msg }));
    setTimeout(() => setNotes((n) => { const { [id]: _done, ...rest } = n; return rest; }), 6000);
  };
  const mergeFacts = (c: Company, found: any): [Company, string[]] => {
    const out: any = { ...c };
    const changed: string[] = [];
    for (const k of FACTS) if (found[k] != null && found[k] !== '' && String(found[k]) !== String(out[k] ?? '')) { out[k] = found[k]; changed.push(FACT_LABEL[k]); }
    const socials = { ...(c.socials || {}), ...(found.socials || {}) };
    if (JSON.stringify(socials) !== JSON.stringify(c.socials || {})) { out.socials = socials; changed.push('socials'); }
    out.sources = [...new Set([...(c.sources || []), ...(found.sources || [])])];
    out.data_sources = [...new Set([...(c.data_sources || []), ...(found.data_sources || [])])];
    return [out, changed];
  };
  const research = (body: any) => api<{ company: any }>(`/w/${info.slug}/competitors/research`, { body }).then((r) => r.company);
  const uniqueId = (name: string, taken: Set<string>) => { let id = slugify(name); for (let i = 2; taken.has(id); i++) id = `${slugify(name)}-${i}`; taken.add(id); return id; };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setErr(''); setBusy('add');
    try {
      const found = await research({ query: q.trim() });
      const id = uniqueId(found.name || q, new Set(data!.companies.map((c) => c.id)));
      const d = withFlags(data!);
      await save({ ...d, companies: [...d.companies, { ...found, id, overlap, tier: 2, x: 50, y: 50, selected: chosen.size < 5 }] });
      setQ(''); setSel(id);
    } catch (x: any) { setErr(x.message); } finally { setBusy(''); }
  }

  async function enrich(list: Company[]) {
    setErr(''); setBusy('enrich');
    let d = withFlags(data!);
    try {
      for (const c of list) {
        setWorking([c.id]);
        const found = await research({ name: c.name, url: c.url });
        let changed: string[] = [];
        d = { ...d, companies: d.companies.map((x) => { if (x.id !== c.id) return x; const [m, ch] = mergeFacts(x, found); changed = ch; return m; }) };
        note(c.id, changed.length ? `Updated: ${changed.join(', ')}` : 'Nothing new found');
        await save(d);
      }
    } catch (x: any) { setErr(x.message); } finally { setWorking([]); setBusy(''); }
  }

  async function checkMemory() {
    setErr(''); setBusy('memory');
    try { setReview(await api<Review>(`/w/${info.slug}/competitors/from-memory`, { body: {} })); } catch (x: any) { setErr(x.message); } finally { setBusy(''); }
  }

  async function applyReview(addNamed: Review['named'], changes: Review['review']) {
    setErr(''); setBusy('apply');
    try {
      let d = withFlags(data!);
      const taken = new Set(d.companies.map((c) => c.id));
      // client-named companies already in the list: flag and put in focus
      d = { ...d, companies: d.companies.map((c) => {
        const n = addNamed.find((x) => x.existing_id === c.id);
        return n ? { ...c, client_pick: { quote: n.quote, doc: n.doc }, selected: true, overlap: c.overlap || n.overlap || 'direct' } : c;
      }) };
      // our list: re-type or drop
      for (const ch of changes) {
        if (ch.verdict === 'drop') d = { ...d, companies: d.companies.filter((c) => c.id !== ch.id || c.client_pick), lenses: lensesOf(d).map((l) => { const { [ch.id]: _x, ...rest } = l.positions; return { ...l, positions: rest }; }) };
        else if (ch.overlap) d = { ...d, companies: d.companies.map((c) => (c.id === ch.id ? { ...c, overlap: ch.overlap! } : c)) };
      }
      await save(d);
      // new client-named companies: research each, add flagged and in focus
      for (const n of addNamed.filter((x) => !x.existing_id)) {
        setBusy(`Adding ${n.name}…`);
        const found = await research(n.url ? { name: n.name, url: n.url } : { query: n.name });
        const id = uniqueId(found.name || n.name, taken);
        d = { ...d, companies: [...d.companies, { ...found, id, overlap: n.overlap || 'direct', tier: 1, x: 50, y: 50, selected: true, client_pick: { quote: n.quote, doc: n.doc } }] };
        await save(d);
      }
      setReview(null);
    } catch (x: any) { setErr(x.message); } finally { setBusy(''); }
  }

  const focusList = data.companies.filter((c) => chosen.has(c.id) && c.url);
  const N = data.companies.length;
  const counts = Object.fromEntries(OVERLAP_ORDER.map((k) => [k, data.companies.filter((c) => c.overlap === k).length]));
  const picks = data.companies.filter((c) => c.client_pick).length;
  const shown = COLUMNS.filter((c) => cols.includes(c.id));
  const t = text.trim().toLowerCase();
  const list = data.companies
    .filter((c) => (!filter || (filter === 'client_pick' ? !!c.client_pick : c.overlap === filter)) && (!focusOnly || chosen.has(c.id)))
    .filter((c) => !t || [c.name, c.segment, c.hero, c.hq, c.category_label, c.founder].some((v) => v && v.toLowerCase().includes(t)))
    .sort((a, b) => {
      if (sort) {
        const col = COLUMNS.find((x) => x.id === sort.id)!;
        const va = col.get(a), vb = col.get(b);
        if (va == null || va === '') return 1;
        if (vb == null || vb === '') return -1;
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
      }
      return Number(chosen.has(b.id)) - Number(chosen.has(a.id)) || Number(!!b.client_pick) - Number(!!a.client_pick) || OVERLAP_ORDER.indexOf(a.overlap) - OVERLAP_ORDER.indexOf(b.overlap);
    });
  const selected = sel ? data.companies.find((c) => c.id === sel) : null;
  const span = shown.length + 2 + (agency ? 1 : 0);
  const clickSort = (c: Col) => {
    if (c.sortable === false) return;
    setSort((s) => (s?.id === c.id ? (s.dir === (c.num ? -1 : 1) ? { id: c.id, dir: c.num ? 1 : -1 } : null) : { id: c.id, dir: c.num ? -1 : 1 }));
  };
  const cell = (c: Company, col: Col, dim = false) => {
    const raw = col.get(c);
    const v = col.render ? col.render(c) : raw == null || raw === '' ? '—' : col.short ? fmtNum(raw as number) : (raw as ReactNode);
    return <td key={col.id} title={typeof raw === 'string' && col.cls?.includes('truncate') ? raw : undefined} className={`px-3 py-2.5 whitespace-nowrap ${col.num ? 'num text-right' : ''} ${col.cls || ''} ${dim ? 'opacity-45' : ''}`}>{v}</td>;
  };
  // pinned columns need their own background so scrolled cells pass underneath
  const pin = (rowBg: string) => `sticky z-[1] ${rowBg} group-hover:bg-panel-2`;

  return (
    <div className="@container space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Competitors</h1>
          <div className="mt-1 text-[13px] text-muted">{chosen.size} in focus of {N}{picks ? ` · ${picks} named by the client` : ''} · updated {fmtDate(row!.updated_at)}</div>
        </div>
        <div className="flex gap-2">
          {agency && <Btn disabled={!!busy} onClick={checkMemory}>{busy === 'memory' ? 'Reading Memory… about 30 s' : 'Check against Memory'}</Btn>}
          {agency && focusList.length > 0 && <Btn disabled={!!busy} onClick={() => enrich(focusList)}>{busy === 'enrich' && working.length ? `Enriching ${data.companies.find((c) => c.id === working[0])?.name}…` : `Enrich ${focusList.length} in focus`}</Btn>}
          <RefreshButton hasNew={hasNew} onClick={reload} />
        </div>
      </div>

      {review && <ReviewPanel review={review} data={data} busy={busy} onApply={applyReview} onClose={() => setReview(null)} />}

      {agency && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <div className="min-w-[260px] flex-1"><Input placeholder="Add a competitor: name or website, e.g. linear.app" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={overlap} options={OVERLAP_ORDER} labels={Object.fromEntries(OVERLAP_ORDER.map((k) => [k, OVERLAP[k].label]))} onChange={setOverlap} />
          <Btn kind="primary" type="submit" disabled={!q.trim() || !!busy}>{busy === 'add' ? 'Researching… about 20 s' : 'Add'}</Btn>
        </form>
      )}
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter(null)} className={`rounded-full border px-3 py-1 text-[12px] ${!filter ? 'border-text' : 'border-line text-muted hover:text-text'}`}>All {N}</button>
        {picks > 0 && <button onClick={() => setFilter(filter === 'client_pick' ? null : 'client_pick')} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${filter === 'client_pick' ? 'border-text' : 'border-line text-muted hover:text-text'}`}><span className="brand-dot h-2.5 w-2.5 rounded-full" /> Named by client <span className="num">{picks}</span></button>}
        {OVERLAP_ORDER.map((k) => (
          <button key={k} title={OVERLAP[k].note} onClick={() => setFilter(filter === k ? null : k)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${filter === k ? 'border-text' : 'border-line text-muted hover:text-text'}`}>
            <Swatch k={k} /> {OVERLAP[k].label} <span className="num">{counts[k]}</span>
          </button>
        ))}
        <button onClick={() => setFocusOnly(!focusOnly)} className={`rounded-full border px-3 py-1 text-[12px] ${focusOnly ? 'border-text' : 'border-line text-muted hover:text-text'}`}>In focus only</button>
        <div className="ml-auto flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter…" className="w-36 rounded-md border border-line bg-panel px-2.5 py-1 text-[12px] outline-none placeholder:text-muted focus:border-muted" />
          <div className="relative">
            <button onClick={() => setPicker(!picker)} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-text">Columns ▾</button>
            {picker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPicker(false)} />
                <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-line bg-panel p-2 shadow-lg">
                  {COLUMNS.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-[13px] hover:bg-panel-2">
                      <span>{c.label}{c.title?.startsWith('Ahrefs') && <span className="ml-1 text-[11px] text-muted">Ahrefs</span>}</span>
                      <input type="checkbox" checked={cols.includes(c.id)} onChange={() => setCols(cols.includes(c.id) ? cols.filter((x) => x !== c.id) : COLUMNS.map((x) => x.id).filter((x) => x === c.id || cols.includes(x)))} className="h-4 w-4 accent-[var(--mb-text)]" />
                    </label>
                  ))}
                  <button onClick={() => setCols(DEFAULT_COLS)} className="mt-1 w-full rounded px-2 py-1.5 text-left text-[12px] text-muted hover:bg-panel-2 hover:text-text">Reset to default</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 @6xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="hidden @6xl:col-start-2 @6xl:row-start-1 @6xl:block">
          <Dossier c={selected || data.client} isClient={!selected} onClose={selected ? () => setSel(null) : undefined} />
        </div>
        <Card className="h-fit overflow-x-auto @6xl:col-start-1 @6xl:row-start-1">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="sticky left-0 z-[2] w-10 min-w-10 max-w-10 bg-panel py-2 pl-3 pr-0" />
                <th className="sticky left-10 z-[2] bg-panel px-3 py-2 font-medium shadow-[1px_0_0_var(--mb-line)]">Company</th>
                {shown.map((c) => (
                  <th key={c.id} title={c.title} onClick={() => clickSort(c)} className={`px-3 py-2 font-medium whitespace-nowrap ${c.num ? 'text-right' : ''} ${c.sortable === false ? '' : 'cursor-pointer select-none hover:text-text'}`}>
                    {c.label}{sort?.id === c.id && <span className="ml-0.5">{sort.dir === 1 ? '↑' : '↓'}</span>}
                  </th>
                ))}
                {agency && <th className="w-14" />}
              </tr>
            </thead>
            <tbody>
              <tr onClick={() => setSel(null)} className="group cursor-pointer border-b border-line hover:bg-panel-2">
                <td className={`${pin('bg-panel')} left-0 w-10 min-w-10 max-w-10 py-2.5 pl-3 pr-0`}><Favicon url={data.client.url} name={data.client.name} /></td>
                <td className={`${pin('bg-panel')} left-10 px-3 py-2.5 font-semibold whitespace-nowrap shadow-[1px_0_0_var(--mb-line)]`}>{data.client.name}</td>
                {shown.map((col) => cell(data.client, col))}
                {agency && <td />}
              </tr>
              {list.map((c) => {
                const on = chosen.has(c.id);
                const isWorking = working.includes(c.id);
                const bg = sel === c.id || isWorking ? 'bg-panel-2' : 'bg-panel';
                return (
                  <Fragment key={c.id}>
                    <tr onClick={() => setSel(c.id === sel ? null : c.id)} className={`group cursor-pointer border-b border-line last:border-0 hover:bg-panel-2 ${sel === c.id ? 'bg-panel-2' : ''} ${isWorking ? 'bg-panel-2' : ''}`}>
                      <td className={`${pin(bg)} left-0 w-10 min-w-10 max-w-10 py-2.5 pl-3 pr-0`} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={on} disabled={!agency} onChange={() => toggle(c.id)} className="h-4 w-4 cursor-pointer align-middle accent-[var(--mb-text)] disabled:cursor-default" aria-label={`${c.name} in focus`} />
                      </td>
                      <td className={`${pin(bg)} left-10 px-3 py-2.5 whitespace-nowrap shadow-[1px_0_0_var(--mb-line)]`}>
                        <div className={`flex items-center gap-2 font-medium ${on ? '' : 'opacity-45'}`}>
                          <Favicon url={c.url} name={c.name} />{shortName(c)}
                          {c.client_pick && <span title="Named by the client" className="brand-dot h-2 w-2 rounded-full" />}
                          {isWorking && <span className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-line border-t-text" />}
                        </div>
                        {isWorking && <div className="mt-0.5 pl-6 text-[11px] text-muted"><span className="animate-pulse">Enriching: Apollo, then AI web search…</span></div>}
                        {notes[c.id] && <div className="mt-0.5 pl-6 text-[11px] text-muted">{notes[c.id]}</div>}
                      </td>
                      {shown.map((col) => cell(c, col, !on))}
                      {agency && (
                        <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <span className={isWorking ? '' : 'invisible group-hover:visible'}>
                            {c.url && <button title="Enrich facts (Apollo + AI)" disabled={!!busy} onClick={() => enrich([c])} className="px-1 text-muted hover:text-text disabled:opacity-40">↻</button>}
                            <button title="Remove" disabled={!!busy} onClick={() => remove(c)} className="px-1 text-muted hover:text-text disabled:opacity-40">✕</button>
                          </span>
                        </td>
                      )}
                    </tr>
                    {sel === c.id && (
                      <tr className="@6xl:hidden">
                        <td colSpan={span} className="bg-panel-2 p-3"><div className="sticky left-3 max-w-[640px]"><Dossier c={c} isClient={false} onClose={() => setSel(null)} /></div></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="text-[11px] text-muted">Facts from Apollo and AI web research; DR, search traffic, brand searches and linking sites from Ahrefs. Click a column to sort; scroll the table sideways.</div>

      {agency && <JsonEditor data={data} onSave={save} />}
    </div>
  );
}

function ReviewPanel({ review, data, busy, onApply, onClose }: { review: Review; data: MarketData; busy: string; onApply: (n: Review['named'], r: Review['review']) => void; onClose: () => void }) {
  const [named, setNamed] = useState(() => review.named.map(() => true));
  const changes = review.review.filter((r) => r.verdict !== 'keep');
  const [ch, setCh] = useState(() => changes.map(() => true));
  const name = (id?: string) => data.companies.find((c) => c.id === id)?.name;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-medium">Competitors in Memory</div>
          <div className="mt-0.5 text-[12px] text-muted">Read: {review.docs.join(', ')}</div>
          {review.summary && <p className="mt-2 max-w-3xl text-[13px]">{review.summary}</p>}
        </div>
        <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close">✕</button>
      </div>

      <div className="mt-5 grid gap-6 @4xl:grid-cols-2">
        <div>
          <div className="mb-2 text-[12px] font-medium">Named by the client · {review.named.length}</div>
          {!review.named.length && <div className="text-[13px] text-muted">No competitors named in these documents.</div>}
          <div className="space-y-2">
            {review.named.map((n, i) => (
              <label key={i} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 text-[13px] hover:bg-panel-2">
                <input type="checkbox" checked={named[i]} onChange={() => setNamed(named.map((v, j) => (j === i ? !v : v)))} className="mt-0.5 h-4 w-4 accent-[var(--mb-text)]" />
                <span className="min-w-0">
                  <span className="font-medium">{n.name}</span>
                  <span className="ml-2 text-[11px] text-muted">{n.existing_id ? 'already in the list: will be flagged and put in focus' : 'new: will be researched and added in focus'}</span>
                  <span className="mt-1 block text-muted">“{n.quote}”{n.doc && ` (${n.doc})`}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[12px] font-medium">Our list against the brief · {changes.length} suggestions</div>
          {!changes.length && <div className="text-[13px] text-muted">Everything else still fits.</div>}
          <div className="space-y-2">
            {changes.map((r, i) => (
              <label key={r.id} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 text-[13px] hover:bg-panel-2">
                <input type="checkbox" checked={ch[i]} onChange={() => setCh(ch.map((v, j) => (j === i ? !v : v)))} className="mt-0.5 h-4 w-4 accent-[var(--mb-text)]" />
                <span className="min-w-0">
                  <span className="font-medium">{name(r.id)}</span>
                  <span className="ml-2 text-[11px] text-muted">{r.verdict === 'drop' ? 'remove' : `make ${OVERLAP[r.overlap || 'angle']?.label.toLowerCase()}`}</span>
                  <span className="mt-1 block text-muted">{r.reason}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Btn kind="primary" disabled={!!busy} onClick={() => onApply(review.named.filter((_, i) => named[i]), changes.filter((_, i) => ch[i]))}>{busy.startsWith('Adding') ? busy : busy === 'apply' ? 'Applying…' : 'Apply selected'}</Btn>
        <span className="text-[12px] text-muted">Nothing changes until you apply. New companies take about 20 s each.</span>
      </div>
    </Card>
  );
}
