import { useEffect, useState } from 'react';
import { api, fmtDate, STAGES } from '../api';
import { Btn, Card, Input, Label, Select, Stat } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';

export default function Overview({ info, reload }: { info: WsInfo; reload: () => void }) {
  const s = info.slug;
  const [acts, setActs] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [market, setMarket] = useState<any>(null);
  const [note, setNote] = useState('');
  const [c, setC] = useState({ name: '', email: '', role: '' });

  async function load() {
    const [a, d, as, m] = await Promise.all([
      api(`/w/${s}/activities`), api(`/w/${s}/documents`), api(`/w/${s}/assets`), api(`/w/${s}/research/market_map`),
    ]);
    setActs(a); setDocs(d); setAssets(as); setMarket(m?.data || null);
    if (info.access.isAgency) setContacts(await api(`/w/${s}/contacts`));
  }
  useEffect(() => { load(); }, [s]);

  const comps = market?.companies?.length ?? 0;
  const sources = market ? new Set([...(market.client?.sources || []), ...market.companies.flatMap((x: any) => x.sources || [])]).size : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{info.name}</h1>
          {info.client_url && <a href={info.client_url} target="_blank" className="mt-1 block text-[13px] text-muted hover:text-text">{info.client_url.replace(/^https?:\/\//, '')} ↗</a>}
          {info.category_description && <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">{info.category_description}</p>}
        </div>
        {info.access.isAgency && info.stage && (
          <div className="shrink-0">
            <Label>Stage</Label>
            <Select value={info.stage} options={STAGES} onChange={async (v) => { await api(`/w/${s}/info`, { method: 'PATCH', body: { stage: v } }); reload(); load(); }} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Companies mapped" value={comps} />
        <Stat label="Sources" value={sources} />
        <Stat label="Memory documents" value={docs.length} />
        <Stat label="Assets" value={assets.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <Label>Timeline</Label>
          {info.access.isAgency && (
            <form onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await api(`/w/${s}/activities`, { body: { kind: 'note', title: note } }); setNote(''); load(); }} className="mb-4 flex gap-2">
              <Input placeholder="Log a call, decision, next step…" value={note} onChange={(e) => setNote(e.target.value)} />
              <Btn type="submit">Add</Btn>
            </form>
          )}
          <div className="space-y-0">
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

        {info.access.isAgency && (
          <Card className="p-5">
            <Label>Client contacts</Label>
            <div className="space-y-2">
              {contacts.map((x) => (
                <div key={x.id} className="text-[13px]"><span className="font-medium">{x.name}</span> <span className="text-muted">· {x.role} · {x.email}</span></div>
              ))}
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
        )}
      </div>
    </div>
  );
}
