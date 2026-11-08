// SEO lens: what brings each company organic traffic, and the content gap against the client.
// Data per country from Ahrefs; agency can load another country (local clients).
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Btn, Card, Favicon, Label, Select } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { Company, MarketData, Row, SeoCountry, SeoKw, fmtNum, shortName } from './marketShared';

const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'NL', 'ES', 'IT', 'CH', 'AT', 'SE', 'PL', 'CY', 'AE', 'IL', 'IN', 'CA', 'AU', 'SG', 'BR'];
const NAMES: Record<string, string> = { US: 'United States', GB: 'United Kingdom', DE: 'Germany', FR: 'France', NL: 'Netherlands', ES: 'Spain', IT: 'Italy', CH: 'Switzerland', AT: 'Austria', SE: 'Sweden', PL: 'Poland', CY: 'Cyprus', AE: 'UAE', IL: 'Israel', IN: 'India', CA: 'Canada', AU: 'Australia', SG: 'Singapore', BR: 'Brazil' };

function Pos({ p }: { p?: number }) {
  if (p == null) return null;
  const cls = p <= 3 ? 'bg-text text-ink' : p <= 10 ? 'border border-text text-text' : 'text-muted';
  return <span className={`num inline-flex min-w-[30px] justify-center rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>#{p}</span>;
}

export default function SeoLens({ info, data, setRow }: { info: WsInfo; data: MarketData; setRow: (r: Row) => void }) {
  const agency = info.access.isAgency;
  const have = Object.keys(data.seo || {});
  const [country, setCountry] = useState(have.includes('US') ? 'US' : have[0] || 'US');
  const [mode, setMode] = useState<'content' | 'all'>('content');
  const [ahrefs, setAhrefs] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api<{ ahrefs?: boolean }>('/health').then((h) => setAhrefs(!!h.ahrefs)).catch(() => setAhrefs(false)); }, []);

  const seo: SeoCountry | undefined = data.seo?.[country];
  const byId = (id: string): Company | undefined => (id === '__client' ? data.client : data.companies.find((c) => c.id === id));
  const ids = (seo?.ids || []).filter((id) => byId(id));

  async function load() {
    setErr(''); setBusy(true);
    try { setRow(await api<Row>(`/w/${info.slug}/seo`, { body: { country } })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  // gap summary: keywords where a competitor is in the top 10 and the client does not rank
  const rows = seo ? [...seo.gap.keywords].sort((a, b) => Number(!!b.category) - Number(!!a.category) || b.volume - a.volume) : [];
  const gapRows = seo ? rows.filter((k) => !seo.gap.positions[k.keyword]?.__client && Object.entries(seo.gap.positions[k.keyword] || {}).some(([id, v]) => id !== '__client' && v.position <= 10)) : [];
  const clientRanks = seo ? seo.gap.keywords.filter((k) => seo.gap.positions[k.keyword]?.__client).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={country} options={[...new Set([...have, ...COUNTRIES])]} labels={Object.fromEntries([...new Set([...have, ...COUNTRIES])].map((c) => [c, `${NAMES[c] || c}${have.includes(c) ? '' : ' · no data'}`]))} onChange={setCountry} />
        <div className="flex items-center gap-1 rounded-md border border-line p-0.5 text-[12px]">
          {([['content', 'Content pages'], ['all', 'All keywords']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)} className={`rounded px-2 py-1 ${mode === v ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
        {agency && (
          <span className="ml-auto" title={ahrefs === false ? 'Connect Ahrefs: add AHREFS_API_KEY in Cloudflare' : undefined}>
            <Btn disabled={busy || ahrefs === false} onClick={load}>{busy ? 'Loading from Ahrefs… about 20 s' : seo ? `Reload ${country} from Ahrefs` : `Load ${country} from Ahrefs`}</Btn>
          </span>
        )}
      </div>
      {err && <div className="text-[12px] text-[var(--color-direct)]">{err}</div>}

      {!seo ? (
        <Card className="p-6 text-[14px]">
          No SEO data for {NAMES[country] || country} yet.
          {agency && <span className="text-muted"> {ahrefs ? 'Load it from Ahrefs: the client and the competitors in focus.' : 'Connect Ahrefs (AHREFS_API_KEY) to load it from here.'}</span>}
        </Card>
      ) : (
        <>
          <div>
            <Label>Top 5 by organic traffic · {NAMES[country] || country}{mode === 'content' ? ' · content pages, own brand excluded' : ''}</Label>
            <div className="grid gap-3 @xl:grid-cols-2 @6xl:grid-cols-3">
              {ids.map((id) => {
                const c = byId(id)!;
                const list: SeoKw[] = seo.top[id]?.[mode] || [];
                return (
                  <Card key={id} className={`p-4 ${id === '__client' ? 'shadow-[inset_4px_0_0_var(--mb-brand)]' : ''}`}>
                    <div className="mb-2 flex items-center gap-2 text-[13px] font-medium"><Favicon url={c.url} name={c.name} />{id === '__client' ? c.name : shortName(c)}</div>
                    {!list.length && <div className="py-2 text-[12px] text-muted">{mode === 'content' ? 'No content pages bringing search traffic.' : 'No keywords with traffic.'}</div>}
                    <ol className="space-y-1.5">
                      {list.map((k) => (
                        <li key={k.keyword} className="flex items-center gap-2 text-[12px]">
                          <Pos p={k.position} />
                          <span className="min-w-0 flex-1 truncate" title={k.url || k.keyword}>{k.keyword}</span>
                          <span className="num text-muted" title="Monthly visits from this keyword">{fmtNum(k.traffic)}/mo</span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Content gap</Label>
            <p className="mb-3 max-w-3xl text-[13px]">
              {data.client.name} ranks for {clientRanks} of {seo.gap.keywords.length} keywords that bring competitors traffic.
              {gapRows.length > 0 && <> {gapRows[0].category ? 'Open category keywords' : 'Biggest open topics'}: {gapRows.slice(0, 3).map((k, i) => <span key={k.keyword}>{i ? ', ' : ''}<b className="font-medium">{k.keyword}</b> ({fmtNum(k.volume)}/mo)</span>)}.</>}
            </p>
            <Card className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] text-muted">
                    <th className="sticky left-0 z-[1] bg-panel px-4 py-2 font-medium">Keyword</th>
                    <th className="px-3 py-2 text-right font-medium" title="Monthly searches">Volume</th>
                    {ids.map((id) => {
                      const c = byId(id)!;
                      return <th key={id} className={`px-3 py-2 text-center font-medium whitespace-nowrap ${id === '__client' ? 'bg-panel-2 text-text' : ''}`}><span className="inline-flex items-center gap-1.5"><Favicon url={c.url} name={c.name} size={14} />{id === '__client' ? c.name : shortName(c)}</span></th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((k) => {
                    const row = seo.gap.positions[k.keyword] || {};
                    const isGap = gapRows.includes(k);
                    return (
                      <tr key={k.keyword} className="group border-b border-line last:border-0 hover:bg-panel-2">
                        <td className="sticky left-0 z-[1] bg-panel px-4 py-2 whitespace-nowrap group-hover:bg-panel-2">
                          {k.keyword}{k.category && <span className="ml-2 rounded border border-line px-1 text-[10px] text-muted">category</span>}
                        </td>
                        <td className="num px-3 py-2 text-right text-muted">{fmtNum(k.volume)}</td>
                        {ids.map((id) => (
                          <td key={id} className={`px-3 py-2 text-center ${id === '__client' ? 'bg-panel-2' : ''}`} title={row[id] ? `${fmtNum(row[id].traffic)} visits/mo` : undefined}>
                            {row[id] ? <Pos p={row[id].position} /> : id === '__client' && isGap ? <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-brand-ink">gap</span> : <span className="text-line">·</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            <div className="mt-2 text-[11px] text-muted">
              Ahrefs · organic search {NAMES[country] || country} · {seo.as_of}. Rows: the keywords that bring each competitor the most traffic to content pages; category keywords first. Position #1–3 filled, #4–10 outlined. Gap = a competitor is in the top 10, {data.client.name} does not rank.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
