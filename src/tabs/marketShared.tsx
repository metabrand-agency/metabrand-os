// Shared pieces for the Market (companies) and Lenses (matrices) tabs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Btn, Card, Label } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';

export type Company = {
  id: string; name: string; short?: string; url?: string; tier: number; overlap: string; segment?: string; category_label?: string;
  hero?: string; sub?: string; claims?: string[]; proof?: string[]; funding?: string | null; hq?: string; founded?: number;
  open_source?: boolean | null; x: number; y: number; sources?: string[]; founders?: string;
};
export type Finding = { lens?: string; title: string; what: string; so_what: string; now_what: string; confidence?: string };
export type Axes = { x: { left: string; right: string }; y: { bottom: string; top: string }; note?: string };
export type Pos = { x: number; y: number; ai_x?: number; ai_y?: number; adjusted?: boolean; note?: string };
export type Lens = { id: string; kind: 'matrix'; title: string; why?: string; source: 'ai' | 'manual'; axes: Axes; positions: Record<string, Pos>; created_at?: number };
export type MarketData = {
  client: Company; axes: Axes; companies: Company[]; findings: Finding[]; lenses?: Lens[]; research_log_stats?: Record<string, number>;
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

export function RefreshButton({ hasNew, onClick }: { hasNew: boolean; onClick: () => void }) {
  return hasNew
    ? <Btn kind="brand" onClick={onClick}>New data · Refresh</Btn>
    : <Btn onClick={onClick}>Refresh</Btn>;
}

export function Swatch({ k }: { k: string }) {
  if (k === 'may_enter') return <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-muted" />;
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OVERLAP[k]?.color }} />;
}

export function Dossier({ c, isClient, onClose, extra }: { c: Company; isClient: boolean; onClose?: () => void; extra?: React.ReactNode }) {
  const rows: [string, React.ReactNode][] = ([
    ['Calls itself', c.category_label],
    ['Funding', c.funding],
    ['HQ', c.hq],
    ['Founded', c.founded],
    ['Founders', c.founders],
    ['Open source', c.open_source == null ? null : c.open_source ? 'Yes' : 'No'],
  ] as [string, React.ReactNode][]).filter(([, v]) => v != null && v !== '');
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
      {extra}
      {!!c.sources?.length && (
        <div className="mt-5">
          <Label>Sources · {c.sources.length}</Label>
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
            <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={8} placeholder='{"client": {...}, "axes": {...}, "companies": [...], "findings": [...]}' className="mono w-full rounded-lg border border-line bg-panel p-3 text-[12px] outline-none" />
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
