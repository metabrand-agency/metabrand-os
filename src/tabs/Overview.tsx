// Overview: the client at a glance. Its main numbers against the competitors in focus, new backlinks from
// articles and AI citations side by side, the articles about the client, and the brand essentials (logos,
// the guide, generative art, the banner generator). The project log stays at the bottom for the agency.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, STAGES } from '../api';
import { Btn, Card, Favicon, Input, Label, Select } from '../components/ui';
import { Icon } from '../components/icons';
import type { WsInfo } from '../pages/Workspace';
import { Bar, Bars } from './Bars';
import { logoPng, logoSvg, save, dataUri, type Kit, type KitLogo, type KitVariant } from './BrandKit';
import { MarketData, companyById, domain, fmtNum, focusOrder, shortName, useActivityRefresh, useClientColor, useResearch } from './marketShared';

const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function Overview({ info, reload }: { info: WsInfo; reload: () => void }) {
  const s = info.slug;
  const agency = info.access.isAgency;
  const { row, accept } = useResearch(s);
  const data = row?.data || null;
  useActivityRefresh(s, data, accept, agency); // keeps the numbers fresh when the agency opens the page
  const accent = useClientColor(s);
  const [kit, setKit] = useState<Kit | null>(null);
  useEffect(() => { api<{ data: Kit } | null>(`/w/${s}/research/brand_kit`).then((r) => setKit(r?.data || null)).catch(() => setKit(null)); }, [s]);

  return (
    <div className="@container space-y-8">
      <Header info={info} reload={reload} />
      {data ? <Numbers data={data} accent={accent} /> : row === undefined ? <div className="text-muted">Loading…</div> : null}
      {data && <Charts data={data} accent={accent} />}
      {data && <Articles info={info} data={data} />}
      <BrandBlock info={info} kit={kit} />
      {agency && <ProjectLog info={info} />}
    </div>
  );
}

function Header({ info, reload }: { info: WsInfo; reload: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div className="flex min-w-0 items-start gap-4">
        <Favicon url={info.client_url} name={info.name} size={44} />
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{info.name}</h1>
          {info.client_url && <a href={info.client_url} target="_blank" rel="noreferrer" className="mt-0.5 block text-[13px] text-muted hover:text-text">{info.client_url.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗</a>}
          {info.category_description && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{info.category_description}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-end gap-3">
        {info.access.isAgency && info.stage && (
          <div>
            <Label>Stage</Label>
            <Select value={info.stage} options={STAGES} onChange={async (v) => { await api(`/w/${info.slug}/info`, { method: 'PATCH', body: { stage: v } }); reload(); }} />
          </div>
        )}
        <Link to={`/${info.slug}/generate`} className="brand-dot flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-medium text-brand-ink hover:brightness-95">
          <Icon name="generate" />Generate a banner
        </Link>
      </div>
    </div>
  );
}

/** The client's main numbers, each with its place among the companies in focus. */
function Numbers({ data, accent }: { data: MarketData; accent: string }) {
  const ids = focusOrder(data);
  const c = data.client;
  const metric = (label: string, hint: string, f: (id: string) => number | null | undefined, fmt = fmtNum) => {
    const vals = ids.map((id) => ({ id, v: f(id) })).filter((x) => x.v != null) as { id: string; v: number }[];
    const mine = f('__client');
    const rank = mine == null ? null : 1 + vals.filter((x) => x.v > mine).length;
    const leader = [...vals].sort((a, b) => b.v - a.v)[0];
    return { label, hint, value: mine, fmt, rank, of: vals.length, leader: leader && leader.id !== '__client' ? { name: shortName(companyById(data, leader.id)), v: leader.v } : null };
  };
  const act = (id: string) => data.activity?.[id];
  const cards = [
    metric('Domain Rating', 'Ahrefs, 0–100', (id) => companyById(data, id)?.ahrefs?.dr, (n) => String(n)),
    metric('Linking sites', 'Referring domains', (id) => companyById(data, id)?.ahrefs?.refdomains),
    metric('Search traffic', 'Organic visits a month', (id) => companyById(data, id)?.ahrefs?.traffic),
    metric('Brand searches', 'A month, worldwide', (id) => companyById(data, id)?.ahrefs?.brand_global),
    metric('AI citations', 'All AI platforms', (id) => act(id)?.ai?.citations),
    metric('New articles', 'Backlinks, last 30 days', (id) => act(id)?.links?.count_30d, (n) => String(n)),
  ];
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Label>{c.name} against {ids.length - 1} competitors</Label>
      </div>
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6">
        {cards.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="text-[12px] text-muted">{m.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-[28px] font-semibold leading-none tracking-tight">{m.value == null ? '—' : m.fmt(m.value)}</span>
              {m.rank != null && m.of > 1 && (
                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={m.rank === 1 ? { background: accent, color: '#000' } : { background: 'var(--mb-panel-2)', color: 'var(--mb-muted)' }}>#{m.rank} of {m.of}</span>
              )}
            </div>
            <div className="mt-2 truncate text-[11px] text-muted">{m.leader && m.rank !== 1 ? `${m.leader.name} leads with ${m.fmt(m.leader.v)}` : m.hint}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Charts({ data, accent }: { data: MarketData; accent: string }) {
  const ids = focusOrder(data);
  const act = (id: string) => data.activity?.[id];
  const rows = (f: (id: string) => number | null | undefined, label?: (id: string) => string | undefined): Bar[] =>
    ids.map((id) => { const v = f(id); return { id, c: companyById(data, id), value: v ?? null, label: v != null ? label?.(id) : undefined }; });
  return (
    <div className="grid gap-4 @3xl:grid-cols-2">
      <Bars accent={accent} title="New backlinks from articles" hint="Ahrefs, last 30 days" rows={rows((id) => act(id)?.links?.count_30d, (id) => (act(id)?.links?.capped ? `${act(id)!.links!.count_30d}+` : undefined))} format={(n) => String(n)} />
      <Bars accent={accent} title="AI citations" hint="Ahrefs, all AI platforms" rows={rows((id) => act(id)?.ai?.citations)} />
    </div>
  );
}

/** Articles about the client (backlinks from articles), or its own posts. */
function Articles({ info, data }: { info: WsInfo; data: MarketData }) {
  const a = data.activity?.__client;
  const press = a?.links?.latest || [];
  const own = a?.latest || [];
  const [tab, setTab] = useState<'press' | 'own'>(press.length || !own.length ? 'press' : 'own');
  const list = tab === 'press' ? press : own;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-1 rounded-md border border-line p-0.5 text-[12px]">
          {([['press', `Articles about ${data.client.name}`, press.length], ['own', 'Own posts', own.length]] as const).map(([k, l, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded px-2.5 py-1 ${tab === k ? 'bg-panel-2 font-medium text-text' : 'text-muted hover:text-text'}`}>{l} <span className="text-muted">{n}</span></button>
          ))}
        </div>
        <Link to={`/${info.slug}/monitor`} className="text-[12px] text-muted hover:text-text">PR Monitor →</Link>
      </div>
      {!list.length ? (
        <div className="px-4 py-6 text-[13px] text-muted">{tab === 'press' ? 'No new articles in the last 30 days.' : 'No posts found on the blog or changelog.'}</div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-muted">
              <th className="px-4 py-2 font-normal">{tab === 'press' ? 'Article' : 'Post'}</th>
              <th className="px-3 py-2 font-normal">{tab === 'press' ? 'Site' : 'Where'}</th>
              {tab === 'press' && <th className="px-3 py-2 text-right font-normal">DR</th>}
              <th className="px-4 py-2 text-right font-normal">Date</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 10).map((x: any) => (
              <tr key={x.url} className="border-t border-line align-middle hover:bg-panel-2/50">
                <td className="max-w-0 px-4 py-2">
                  <a href={x.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3">
                    <img src={`/api/og?u=${encodeURIComponent(x.url)}`} alt="" loading="lazy" className="h-9 w-14 shrink-0 rounded border border-line bg-panel-2 object-cover" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                    <span className="min-w-0">
                      <span className="block truncate hover:underline">{x.title}</span>
                      {x.type && <span className="text-[11px] text-muted">{x.type}</span>}
                    </span>
                  </a>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted"><span className="flex items-center gap-1.5"><Favicon url={x.url} name={x.source || domain(x.url)} size={14} />{x.source || domain(x.url)}</span></td>
                {tab === 'press' && <td className="num px-3 py-2 text-right">{x.dr ?? '—'}</td>}
                <td className="num whitespace-nowrap px-4 py-2 text-right text-muted">{fmtDay(x.published || x.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** Two logos to grab right away, and the way into the brand tools. */
function BrandBlock({ info, kit }: { info: WsInfo; kit: Kit | null }) {
  const logo = kit?.logos?.find((l) => l.id === 'logo') || kit?.logos?.[0];
  const sign = kit?.logos?.find((l) => l.id === 'sign');
  const picks: { l: KitLogo; v: KitVariant; label: string }[] = [];
  const add = (l: KitLogo | undefined, pred: (v: KitVariant) => boolean, label: string) => { const v = l?.variants.find(pred); if (l && v) picks.push({ l, v, label }); };
  add(logo, (v) => !!v.bg && /fff/i.test(v.bg), 'Logo on white');
  add(logo, (v) => !!v.bg && !/fff/i.test(v.bg) && /^#0/.test(v.bg), 'Logo on black');
  add(sign, (v) => !!v.bg && !/fff|^#0/i.test(v.bg), 'Sign on colour');
  const art = kit?.links?.[0];
  const tools: { to?: string; href?: string; icon: string; title: string; text: string }[] = [
    { to: `/${info.slug}/guide`, icon: 'guide', title: 'Online guide', text: 'Logo, colour, type, layout and applications' },
    ...(art ? [{ href: art.url, icon: 'link', title: art.title, text: art.note || 'The brand’s own generative art tool' }] : []),
    { to: `/${info.slug}/generate`, icon: 'generate', title: 'Banner generator', text: 'LinkedIn and screen formats in the brand style' },
    { to: `/${info.slug}/assets`, icon: 'assets', title: 'Assets', text: 'Logos, colours, fonts, icons, backgrounds, videos' },
  ];
  const [busy, setBusy] = useState('');
  const get = async (l: KitLogo, v: KitVariant, kind: 'svg' | 'png') => {
    setBusy(v.file + kind);
    try {
      if (kind === 'svg') save(new Blob([logoSvg(l, v).svg], { type: 'image/svg+xml' }), `${v.file}.svg`);
      else save(await logoPng(l, v, 2400), `${v.file}.png`);
    } finally { setBusy(''); }
  };
  if (!kit && !picks.length) return null;
  return (
    <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      {!!picks.length && (
        <Card className="p-4">
          <div className="mb-3 flex items-baseline justify-between"><Label>Logos</Label><Link to={`/${info.slug}/assets`} className="text-[12px] text-muted hover:text-text">All versions →</Link></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {picks.map(({ l, v, label }) => (
              <div key={v.file}>
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-line" style={{ background: v.bg || undefined }}>
                  <img src={dataUri(logoSvg(l, v, 600).svg)} alt={label} className="h-full w-full object-contain" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate text-muted">{label}</span>
                  <span className="flex shrink-0 gap-1">
                    <button onClick={() => get(l, v, 'svg')} className="rounded border border-line px-2 py-0.5 hover:bg-panel-2">{busy === v.file + 'svg' ? '…' : 'SVG'}</button>
                    <button onClick={() => get(l, v, 'png')} className="rounded border border-line px-2 py-0.5 hover:bg-panel-2">{busy === v.file + 'png' ? '…' : 'PNG'}</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="flex flex-col p-4">
        <Label>Brand tools</Label>
        <div className="flex-1 divide-y divide-[var(--mb-line)]">
          {tools.map((t) => {
            const inner = (
              <>
                <Icon name={t.icon} className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">{t.title}</span><span className="block truncate text-[12px] text-muted">{t.text}</span></span>
                <span className="text-muted">{t.href ? '↗' : '→'}</span>
              </>
            );
            return t.href
              ? <a key={t.title} href={t.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 hover:text-text">{inner}</a>
              : <Link key={t.title} to={t.to!} className="flex items-center gap-3 py-2.5">{inner}</Link>;
          })}
        </div>
        <Link to={`/${info.slug}/generate`} className="brand-dot mt-3 flex items-center justify-center gap-2 rounded-md px-4 py-3 text-[15px] font-medium text-brand-ink hover:brightness-95">
          <Icon name="generate" />Generate a banner
        </Link>
      </Card>
    </div>
  );
}

/** Agency only: the project timeline and client contacts. */
function ProjectLog({ info }: { info: WsInfo }) {
  const s = info.slug;
  const [acts, setActs] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [c, setC] = useState({ name: '', email: '', role: '' });
  const load = async () => {
    const [a, k] = await Promise.all([api<any[]>(`/w/${s}/activities`), api<any[]>(`/w/${s}/contacts`)]);
    setActs(a || []); setContacts(k || []);
  };
  useEffect(() => { load(); }, [s]);
  return (
    <div className="grid gap-6 border-t border-line pt-8 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-5">
        <Label>Project timeline</Label>
        <form onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await api(`/w/${s}/activities`, { body: { kind: 'note', title: note } }); setNote(''); load(); }} className="mb-4 flex gap-2">
          <Input placeholder="Log a call, decision, next step…" value={note} onChange={(e) => setNote(e.target.value)} />
          <Btn type="submit">Add</Btn>
        </form>
        <div>
          {acts.map((a) => (
            <div key={a.id} className="flex gap-4 border-b border-line py-2.5 text-[13px] last:border-0">
              <div className="num w-24 shrink-0 text-[12px] text-muted">{fmtDate(a.happened_at)}</div>
              <div className="w-20 shrink-0 text-[12px] text-muted">{a.kind.replace('_', ' ')}</div>
              <div>{a.title}</div>
            </div>
          ))}
          {!acts.length && <div className="text-[13px] text-muted">Nothing yet.</div>}
        </div>
      </Card>
      <Card className="p-5">
        <Label>Client contacts</Label>
        <div className="space-y-2">
          {contacts.map((x) => <div key={x.id} className="text-[13px]"><span className="font-medium">{x.name}</span> <span className="text-muted">{x.role}, {x.email}</span></div>)}
          {!contacts.length && <div className="text-[13px] text-muted">No contacts yet.</div>}
        </div>
        <form onSubmit={async (e) => { e.preventDefault(); await api(`/w/${s}/contacts`, { body: c }); setC({ name: '', email: '', role: '' }); load(); }} className="mt-4 grid gap-2">
          <Input placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Role" value={c.role} onChange={(e) => setC({ ...c, role: e.target.value })} />
            <Input placeholder="Email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
          </div>
          <div><Btn type="submit">Add contact</Btn></div>
        </form>
      </Card>
    </div>
  );
}
