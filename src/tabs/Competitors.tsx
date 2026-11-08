// Competitors: the project's competitor list. Add by name or website (Apollo + AI research),
// tick which are in focus (maps and lenses show those), enrich facts, remove.
// The table is configurable: choose columns, sort by any column, filter by type, focus and text.
import { Fragment, ReactNode, useEffect, useState } from 'react';
import { api, fmtDate } from '../api';
import { Btn, Card, Favicon, Input, Select } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { Company, Dossier, EmptyResearch, JsonEditor, MarketData, OVERLAP, RefreshButton, Swatch, fmtNum, lensesOf, selectedIds, shortName, useResearch } from './marketShared';

const OVERLAP_ORDER = ['direct', 'angle', 'substitute', 'may_enter'];
const FACTS = ['founded', 'employees', 'last_round', 'hq', 'linkedin', 'founder', 'founder_linkedin', 'open_source'] as const;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'company';

type Col = { id: string; label: string; title?: string; num?: boolean; short?: boolean; sortable?: boolean; get: (c: Company) => string | number | undefined | null; render?: (c: Company) => ReactNode; cls?: string };

const linkEl = (href: string | undefined, label: string, title: string) =>
  href ? <a href={href} target="_blank" title={title} onClick={(e) => e.stopPropagation()} className="text-muted hover:text-text">{label}</a> : <span className="text-line">{label}</span>;

const COLUMNS: Col[] = [
  { id: 'overlap', label: 'Type', get: (c) => OVERLAP_ORDER.indexOf(c.overlap), render: (c) => (c.overlap ? <span className="flex items-center gap-1.5 whitespace-nowrap"><Swatch k={c.overlap} />{OVERLAP[c.overlap]?.label}</span> : <span className="text-muted">Client</span>) },
  { id: 'segment', label: 'Segment', get: (c) => c.segment, cls: 'text-[12px] text-muted min-w-[140px]' },
  { id: 'hero', label: 'Hero line', get: (c) => c.hero, cls: 'min-w-[200px]' },
  { id: 'founded', label: 'Founded', num: true, get: (c) => c.founded },
  { id: 'employees', label: 'Team', num: true, title: 'Employees (Apollo estimate)', get: (c) => (c.employees ? parseInt(String(c.employees).replace(/\D/g, ''), 10) : null), render: (c) => (c.employees ? fmtNum(parseInt(String(c.employees).replace(/\D/g, ''), 10)) : '—') },
  { id: 'last_round', label: 'Last round', get: (c) => c.last_round || c.funding, cls: 'min-w-[160px] text-[12px]' },
  { id: 'hq', label: 'Location', get: (c) => c.hq, cls: 'text-[12px] min-w-[120px]' },
  { id: 'links', label: 'Links', sortable: false, get: () => '', render: (c) => <span className="flex gap-2 whitespace-nowrap text-[12px]">{linkEl(c.url, 'Site', 'Website')}{linkEl(c.linkedin, 'in', 'Company LinkedIn')}{linkEl(c.founder_linkedin, 'Founder', c.founder ? `${c.founder} on LinkedIn` : 'Founder LinkedIn')}</span> },
  { id: 'dr', label: 'DR', num: true, title: 'Ahrefs Domain Rating: strength of the backlink profile, 0–100', get: (c) => c.ahrefs?.dr },
  { id: 'traffic', label: 'Search traffic', num: true, short: true, title: 'Ahrefs: estimated monthly visits from organic search', get: (c) => c.ahrefs?.traffic },
  { id: 'brand', label: 'Brand searches', num: true, title: 'Ahrefs: monthly searches for the brand name, worldwide', get: (c) => c.ahrefs?.brand_global, render: (c) => <span title={c.ahrefs?.brand_query ? `“${c.ahrefs.brand_query}” · US ${fmtNum(c.ahrefs.brand_us)}` : undefined}>{fmtNum(c.ahrefs?.brand_global)}</span> },
  { id: 'refdomains', label: 'Linking sites', num: true, short: true, title: 'Ahrefs: referring domains', get: (c) => c.ahrefs?.refdomains },
];
const DEFAULT_COLS = ['overlap', 'founded', 'employees', 'last_round', 'hq', 'links', 'dr', 'traffic', 'brand'];

function useCols(slug: string) {
  const key = `mos_cols_${slug}`;
  const [cols, setCols] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(v) ? v : DEFAULT_COLS; } catch { return DEFAULT_COLS; }
  });
  const set = (v: string[]) => { setCols(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  return [cols, set] as const;
}

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
  const mergeFacts = (c: Company, found: any): Company => {
    const out: any = { ...c };
    for (const k of FACTS) if (found[k] != null && found[k] !== '') out[k] = found[k];
    out.sources = [...new Set([...(c.sources || []), ...(found.sources || [])])];
    out.data_sources = [...new Set([...((c as any).data_sources || []), ...(found.data_sources || [])])];
    return out;
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setErr(''); setBusy('add');
    try {
      const r = await api<{ company: any }>(`/w/${info.slug}/competitors/research`, { body: { query: q.trim() } });
      const found = r.company;
      const ids = new Set(data!.companies.map((c) => c.id));
      let id = slugify(found.name || q);
      for (let i = 2; ids.has(id); i++) id = `${slugify(found.name || q)}-${i}`;
      const d = withFlags(data!);
      const company: Company = { ...found, id, overlap, tier: 2, x: 50, y: 50, selected: chosen.size < 5 };
      await save({ ...d, companies: [...d.companies, company] });
      setQ(''); setSel(id);
    } catch (x: any) { setErr(x.message); } finally { setBusy(''); }
  }

  async function enrich(list: Company[]) {
    setErr('');
    let d = withFlags(data!);
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(list.length > 1 ? `Enriching ${i + 1} of ${list.length}…` : `enrich:${list[0].id}`);
        const c = list[i];
        const r = await api<{ company: any }>(`/w/${info.slug}/competitors/research`, { body: { name: c.name, url: c.url } });
        d = { ...d, companies: d.companies.map((x) => (x.id === c.id ? mergeFacts(x, r.company) : x)) };
        await save(d);
      }
    } catch (x: any) { setErr(x.message); } finally { setBusy(''); }
  }
  const focusList = data.companies.filter((c) => chosen.has(c.id) && c.url);

  const N = data.companies.length;
  const counts = Object.fromEntries(OVERLAP_ORDER.map((k) => [k, data.companies.filter((c) => c.overlap === k).length]));
  const shown = COLUMNS.filter((c) => cols.includes(c.id));
  const t = text.trim().toLowerCase();
  const list = data.companies
    .filter((c) => (!filter || c.overlap === filter) && (!focusOnly || chosen.has(c.id)))
    .filter((c) => !t || [c.name, c.segment, c.hero, c.hq, c.category_label].some((v) => v && v.toLowerCase().includes(t)))
    .sort((a, b) => {
      if (sort) {
        const col = COLUMNS.find((x) => x.id === sort.id)!;
        const va = col.get(a), vb = col.get(b);
        if (va == null || va === '') return 1;
        if (vb == null || vb === '') return -1;
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
      }
      return Number(chosen.has(b.id)) - Number(chosen.has(a.id)) || OVERLAP_ORDER.indexOf(a.overlap) - OVERLAP_ORDER.indexOf(b.overlap);
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
    return <td key={col.id} className={`px-3 py-2.5 ${col.num ? 'num whitespace-nowrap text-right' : ''} ${col.cls || ''} ${dim ? 'opacity-45' : ''}`}>{v}</td>;
  };

  return (
    <div className="@container space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Competitors</h1>
          <div className="mt-1 text-[13px] text-muted">{chosen.size} in focus of {N} · updated {fmtDate(row!.updated_at)}</div>
        </div>
        <div className="flex gap-2">
          {agency && focusList.length > 0 && (
            <Btn disabled={!!busy} onClick={() => enrich(focusList)}>{busy.startsWith('Enriching') ? busy : `Enrich ${focusList.length} in focus`}</Btn>
          )}
          <RefreshButton hasNew={hasNew} onClick={reload} />
        </div>
      </div>

      {agency && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <div className="min-w-[260px] flex-1"><Input placeholder="Add a competitor: name or website, e.g. linear.app" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={overlap} options={OVERLAP_ORDER} labels={Object.fromEntries(OVERLAP_ORDER.map((k) => [k, OVERLAP[k].label]))} onChange={setOverlap} />
          <Btn kind="primary" type="submit" disabled={!q.trim() || !!busy}>{busy === 'add' ? 'Researching… about 20 s' : 'Add'}</Btn>
        </form>
      )}
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      {/* filters + column picker, one row above the table */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter(null)} className={`rounded-full border px-3 py-1 text-[12px] ${!filter ? 'border-text' : 'border-line text-muted hover:text-text'}`}>All {N}</button>
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
                <th className="w-8 py-2 pl-4" />
                <th className="px-3 py-2 font-medium">Company</th>
                {shown.map((c) => (
                  <th key={c.id} title={c.title} onClick={() => clickSort(c)} className={`px-3 py-2 font-medium whitespace-nowrap ${c.num ? 'text-right' : ''} ${c.sortable === false ? '' : 'cursor-pointer select-none hover:text-text'}`}>
                    {c.label}{sort?.id === c.id && <span className="ml-0.5">{sort.dir === 1 ? '↑' : '↓'}</span>}
                  </th>
                ))}
                {agency && <th className="w-14" />}
              </tr>
            </thead>
            <tbody>
              <tr onClick={() => setSel(null)} className="cursor-pointer border-b border-line align-top hover:bg-panel-2">
                <td className="py-2.5 pl-4"><span className="brand-dot mt-1 block h-3 w-3 rounded-full" title="Client" /></td>
                <td className="px-3 py-2.5"><div className="flex items-center gap-2 font-semibold whitespace-nowrap"><Favicon url={data.client.url} name={data.client.name} />{data.client.name}</div></td>
                {shown.map((col) => cell(data.client, col))}
                {agency && <td />}
              </tr>
              {list.map((c) => {
                const on = chosen.has(c.id);
                return (
                  <Fragment key={c.id}>
                    <tr onClick={() => setSel(c.id === sel ? null : c.id)} className={`group cursor-pointer border-b border-line align-top last:border-0 hover:bg-panel-2 ${sel === c.id ? 'bg-panel-2' : ''}`}>
                      <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={on} disabled={!agency} onChange={() => toggle(c.id)} className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--mb-text)] disabled:cursor-default" aria-label={`${c.name} in focus`} />
                      </td>
                      <td className={`px-3 py-2.5 ${on ? '' : 'opacity-45'}`}>
                        <div className="flex items-center gap-2 font-medium whitespace-nowrap"><Favicon url={c.url} name={c.name} />{shortName(c)}</div>
                      </td>
                      {shown.map((col) => cell(c, col, !on))}
                      {agency && (
                        <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <span className="invisible group-hover:visible">
                            {c.url && <button title="Enrich facts (Apollo + AI)" disabled={!!busy} onClick={() => enrich([c])} className="px-1 text-muted hover:text-text">{busy === `enrich:${c.id}` ? '…' : '↻'}</button>}
                            <button title="Remove" onClick={() => remove(c)} className="px-1 text-muted hover:text-text">✕</button>
                          </span>
                        </td>
                      )}
                    </tr>
                    {sel === c.id && (
                      <tr className="@6xl:hidden">
                        <td colSpan={span} className="bg-panel-2 p-3"><Dossier c={c} isClient={false} onClose={() => setSel(null)} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="text-[11px] text-muted">Sources: company facts from Apollo and AI web research; DR, search traffic, brand searches and linking sites from Ahrefs. Click a column to sort.</div>

      {agency && <JsonEditor data={data} onSave={save} />}
    </div>
  );
}
