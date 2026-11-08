// Shared pieces for the Market (companies) and Lenses (matrices) tabs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { Btn, Card, Favicon, Label } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';

export type Company = {
  id: string; name: string; short?: string; url?: string; tier: number; overlap: string; segment?: string; category_label?: string;
  hero?: string; sub?: string; claims?: string[]; proof?: string[]; funding?: string | null; hq?: string; founded?: number;
  open_source?: boolean | null; x: number; y: number; sources?: string[]; founders?: string;
  employees?: string; last_round?: string; linkedin?: string; founder?: string; founder_linkedin?: string;
  ahrefs?: { dr?: number; traffic?: number; refdomains?: number; brand_query?: string; brand_us?: number; brand_global?: number; as_of?: string; note?: string };
  data_sources?: string[];
  socials?: { x?: string; github?: string; youtube?: string; facebook?: string };
  client_pick?: { quote?: string; doc?: string };
  geo?: { lat: number; lng: number; q?: string };
  selected?: boolean;
};
export type Finding = { lens?: string; title: string; what: string; so_what: string; now_what: string; confidence?: string };
export type Axes = { x: { left: string; right: string }; y: { bottom: string; top: string }; note?: string };
export type Pos = { x: number; y: number; ai_x?: number; ai_y?: number; adjusted?: boolean; note?: string };
export type Lens = { id: string; kind: 'matrix'; title: string; why?: string; source: 'ai' | 'manual'; axes: Axes; positions: Record<string, Pos>; created_at?: number };
export type SeoKw = { keyword: string; position: number; traffic: number; volume: number; url?: string };
export type SeoCountry = {
  as_of: string; ids: string[]; source?: string;
  top: Record<string, { all: SeoKw[]; content: SeoKw[] }>;
  gap: { keywords: { keyword: string; volume: number; kd?: number; category?: boolean }[]; positions: Record<string, Record<string, { position: number; traffic: number }>>; checked: string[] };
};
export type Activity = { source?: string; posts_30d: number; latest: { title: string; url: string; date?: string }[]; checked_at: number };
export type MarketData = {
  client: Company; axes: Axes; companies: Company[]; findings: Finding[]; lenses?: Lens[]; research_log_stats?: Record<string, number>;
  seo?: Record<string, SeoCountry>;
  activity?: Record<string, Activity>;
};
export type Row = { data: MarketData; status: string; updated_at: number };

// Three validated hues + a neutral hollow mark for "may enter" (not in the market yet).
export const OVERLAP: Record<string, { label: string; color: string; note: string }> = {
  direct: { label: 'Direct', color: 'var(--color-direct)', note: 'Same buyer, same job' },
  angle: { label: 'Adjacent', color: 'var(--color-angle)', note: 'Platform approaching from another side' },
  substitute: { label: 'Substitute', color: 'var(--color-substitute)', note: 'Different product, same budget' },
  may_enter: { label: 'May enter', color: 'var(--mb-muted)', note: 'Could move into the space' },
};
export const shortName = (c: Company) => c.short || c.name.replace(/\s*\(.*\)/, '');
export const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** Lenses stored in the data; older data gets its single matrix from axes + company x/y. */
export function lensesOf(d: MarketData): Lens[] {
  if (d.lenses?.length) return d.lenses;
  return [{
    id: 'product_model', kind: 'matrix', title: 'Product model', why: 'How each player builds and governs agent work.', source: 'ai', axes: d.axes,
    positions: Object.fromEntries([['__client', { x: d.client.x, y: d.client.y }], ...d.companies.map((c) => [c.id, { x: c.x, y: c.y }])]),
  }];
}

/** Competitors in focus: explicit flags, or the first five by priority when nobody has chosen yet. */
export function selectedIds(d: MarketData): Set<string> {
  if (d.companies.some((c) => typeof c.selected === 'boolean')) return new Set(d.companies.filter((c) => c.selected).map((c) => c.id));
  return new Set([...d.companies].sort((a, b) => Number(!!b.client_pick) - Number(!!a.client_pick) || (a.tier || 9) - (b.tier || 9)).slice(0, 5).map((c) => c.id));
}

export const fmtNum = (n?: number) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** Loads market research; checks for newer data on focus and every minute. */
export function useResearch(slug: string) {
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [hasNew, setHasNew] = useState(false);
  const loaded = useRef(0);
  const reload = useCallback(async () => {
    const r = await api<Row | null>(`/w/${slug}/research/market_map`).catch(() => null);
    setRow(r); setHasNew(false); loaded.current = r?.updated_at || 0;
  }, [slug]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const check = async () => {
      const r = await api<Row | null>(`/w/${slug}/research/market_map`).catch(() => null);
      if (r && r.updated_at > loaded.current) setHasNew(true);
    };
    const t = setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => { clearInterval(t); window.removeEventListener('focus', check); };
  }, [slug]);
  const save = useCallback(async (data: MarketData) => {
    setRow((r) => (r ? { ...r, data } : r));
    const res = await api<{ updated_at: number }>(`/w/${slug}/research/market_map`, { method: 'PUT', body: { data, status: 'published' } });
    loaded.current = res.updated_at;
    setRow((r) => (r ? { ...r, updated_at: res.updated_at } : r));
  }, [slug]);
  return { row, setRow, reload, hasNew, save };
}

/** Reloads the research from the database (changes made elsewhere: another tab, the chat, an import). */
export function RefreshButton({ hasNew, onClick }: { hasNew: boolean; onClick: () => Promise<void> | void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const run = async () => {
    setState('busy');
    await Promise.all([onClick(), new Promise((r) => setTimeout(r, 400))]);
    setState('done');
    setTimeout(() => setState('idle'), 1800);
  };
  if (hasNew && state === 'idle') return <Btn kind="brand" onClick={run}>New data, refresh</Btn>;
  return (
    <span title="Reload the latest data saved for this project">
      <Btn onClick={run} disabled={state === 'busy'}>{state === 'busy' ? 'Refreshing…' : state === 'done' ? 'Up to date ✓' : 'Refresh'}</Btn>
    </span>
  );
}

const SOCIAL: [keyof NonNullable<Company['socials']> | 'linkedin', string, string][] = [
  ['linkedin', 'LinkedIn', 'https://linkedin.com'], ['x', 'X', 'https://x.com'], ['github', 'GitHub', 'https://github.com'], ['youtube', 'YouTube', 'https://youtube.com'], ['facebook', 'Facebook', 'https://facebook.com'],
];
/** Company social profiles as small platform icons (the platforms' own favicons). */
export function Socials({ c }: { c: Company }) {
  const links = SOCIAL.map(([k, label, site]) => [k === 'linkedin' ? c.linkedin : c.socials?.[k], label, site] as const).filter(([href]) => href);
  if (!links.length) return <span className="text-muted">—</span>;
  return (
    <span className="flex w-max items-center gap-1.5">
      {links.map(([href, label, site]) => (
        <a key={label} href={href!} target="_blank" title={label} onClick={(e) => e.stopPropagation()} className="inline-flex h-[14px] w-[14px] shrink-0 opacity-80 hover:opacity-100"><Favicon url={site} name={label} size={14} /></a>
      ))}
    </span>
  );
}
export const siteName = (u?: string) => (u ? domain(u) : '');

/** First-screen screenshot of a site (WordPress mShots: free, no key; the first request starts rendering). */
export const shotUrl = (u: string) => `https://s.wordpress.com/mshots/v1/${encodeURIComponent(u)}?w=1280&h=800`;
/** Ask for screenshots in advance so hover previews are ready. */
export function warmShots(urls: (string | undefined)[]) {
  for (const u of urls) if (u) { const i = new Image(); i.src = shotUrl(u); }
}

/** Shows a small first-screen preview of the site while hovering the link. */
export function SitePreview({ url, children }: { url: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const W = 320, H = 200;
  return (
    <span
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const below = r.bottom + 8 + H + 28 < window.innerHeight;
        setPos({ x: Math.min(r.left, window.innerWidth - W - 12), y: below ? r.bottom + 8 : r.top - H - 36 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        <div style={{ position: 'fixed', left: pos.x, top: pos.y, width: W }} className="pointer-events-none z-50 overflow-hidden rounded-md border border-line bg-panel shadow-xl">
          <img src={shotUrl(url)} alt="" style={{ width: W, height: H }} className="block bg-panel-2 object-cover object-top" />
          <div className="border-t border-line px-2.5 py-1.5 text-[11px] text-muted">{domain(url)}</div>
        </div>,
        document.body,
      )}
    </span>
  );
}

export function Swatch({ k }: { k: string }) {
  if (k === 'may_enter') return <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-muted" />;
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OVERLAP[k]?.color }} />;
}

export function Dossier({ c, isClient, onClose, extra }: { c: Company; isClient: boolean; onClose?: () => void; extra?: React.ReactNode }) {
  const rows: [string, React.ReactNode][] = ([
    ['Calls itself', c.category_label],
    ['Founded', c.founded],
    ['Employees', c.employees],
    ['Last round', c.last_round || c.funding],
    ['Location', c.hq],
    ['Founder', c.founder_linkedin ? <a href={c.founder_linkedin} target="_blank" className="underline decoration-line underline-offset-2 hover:decoration-text">{c.founder || c.founders || 'LinkedIn'}</a> : c.founder || c.founders],
    ['Social', c.linkedin || c.socials ? <Socials c={c} /> : null],
    ['Ahrefs DR', c.ahrefs?.dr],
    ['Search traffic', c.ahrefs?.traffic != null ? `${fmtNum(c.ahrefs.traffic)}/mo` : null],
    ['Brand searches', c.ahrefs?.brand_global != null ? `${fmtNum(c.ahrefs.brand_global)}/mo (“${c.ahrefs.brand_query}”)` : null],
    ['Linking sites', c.ahrefs?.refdomains != null ? fmtNum(c.ahrefs.refdomains) : null],
    ['Data', c.data_sources?.join(', ')],
    ['Open source', c.open_source == null ? null : c.open_source ? 'Yes' : 'No'],
  ] as [string, React.ReactNode][]).filter(([, v]) => v != null && v !== '');
  return (
    <Card className="h-fit p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          {isClient ? <><span className="brand-dot h-2.5 w-2.5 rounded-full" />Client</> : <><Swatch k={c.overlap} />{OVERLAP[c.overlap]?.label}</>}
        </div>
        {onClose && <button onClick={onClose} className="text-muted hover:text-text" aria-label="Close">✕</button>}
      </div>
      <div className="mt-2 flex items-center gap-2 text-lg font-semibold tracking-tight"><Favicon url={c.url} name={c.name} size={20} />{c.name}</div>
      {c.url && <a href={c.url} target="_blank" className="text-[12px] text-muted hover:text-text">{domain(c.url)} ↗</a>}
      {c.client_pick && <div className="mt-3 rounded-md bg-panel-2 px-3 py-2 text-[12px]"><span className="font-medium">Named by the client</span>{c.client_pick.quote && <span className="mt-1 block text-muted">“{c.client_pick.quote}”</span>}{c.client_pick.doc && <span className="text-muted"> ({c.client_pick.doc})</span>}</div>}
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
      {extra}
      {!!c.sources?.length && (
        <div className="mt-5">
          <Label>Sources ({c.sources.length})</Label>
          <ul className="space-y-1 text-[12px]">{c.sources.map((u) => <li key={u}><a href={u} target="_blank" className="text-muted hover:text-text">{domain(u)} ↗</a></li>)}</ul>
        </div>
      )}
    </Card>
  );
}

export function JsonEditor({ data, onSave }: { data: MarketData; onSave: (d: MarketData) => void }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="text-[12px]">
      <button onClick={() => { setOpen(!open); setTxt(JSON.stringify(data, null, 2)); setErr(''); }} className="text-muted hover:text-text">{open ? '▾' : '▸'} Data (JSON), agency only</button>
      {open && (
        <div className="mt-2 space-y-2">
          <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={14} className="mono w-full rounded-md border border-line bg-panel p-3 outline-none" />
          {err && <div className="text-[var(--color-direct)]">{err}</div>}
          <Btn kind="primary" onClick={() => { try { const d = JSON.parse(txt); if (!Array.isArray(d.companies)) throw new Error('Needs a "companies" array'); onSave(d); setOpen(false); } catch (e: any) { setErr(e.message); } }}>Save data</Btn>
        </div>
      )}
    </div>
  );
}

export function EmptyResearch({ info, title, onLoaded }: { info: WsInfo; title: string; onLoaded: () => void }) {
  const [txt, setTxt] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="p-6">
        <div className="text-[14px]">{info.access.isAgency ? 'No market research for this project yet.' : 'This section will fill in once the research is shared with you.'}</div>
        {info.access.isAgency && (
          <div className="mt-4 space-y-2">
            <div className="text-[13px] text-muted">Paste research JSON (client, axes, companies, findings), produced by a research run.</div>
            <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={8} placeholder='{"client": {...}, "axes": {...}, "companies": [...], "findings": [...]}' className="mono w-full rounded-md border border-line bg-panel p-3 text-[12px] outline-none" />
            {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}
            <Btn kind="primary" onClick={async () => {
              try {
                const d = JSON.parse(txt);
                if (!Array.isArray(d.companies)) throw new Error('Needs a "companies" array');
                await api(`/w/${info.slug}/research/market_map`, { method: 'PUT', body: { data: d, status: 'published' } });
                onLoaded();
              } catch (e: any) { setErr(e.message); }
            }}>Save</Btn>
          </div>
        )}
      </Card>
    </div>
  );
}
