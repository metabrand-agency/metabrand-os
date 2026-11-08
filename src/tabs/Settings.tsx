import { useEffect, useState } from 'react';
import { api, Me, STAGES } from '../api';
import { Btn, Card, Input, Label, Select } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';

const ROLES = ['client_admin', 'client_member', 'brand_guest'] as const;
const ROLE_NOTE: Record<string, string> = {
  client_admin: 'Sees everything shared with the client',
  client_member: 'Same view; for the wider client team',
  brand_guest: 'For partners and contractors; brand materials only (later)',
};
const CLIENT_TABS = [
  ['overview', 'Overview'],
  ['memory', 'Memory (shared items only)'],
  ['competitors', 'Competitors'],
  ['lenses', 'Lenses'],
  ['visibility', 'Brand Visibility'],
  ['monitor', 'PR Monitor'],
  ['assets', 'Assets (shared items only)'],
] as const;

export default function Settings({ info, reload }: { info: WsInfo; reload: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>('/me').then(setMe); }, []);
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/login'; };

  if (!info.access.isAgency) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Card className="p-5 text-[14px]">
          <div>Signed in as <span className="font-medium">{me?.user.email}</span></div>
          <div className="mt-1 text-muted">Access to {info.name}, {info.access.level.replace('_', ' ')}</div>
          <div className="mt-4 text-[13px] text-muted">To add teammates or change access, write to your Metabrand team.</div>
          <div className="mt-4"><Btn onClick={logout}>Sign out</Btn></div>
        </Card>
      </div>
    );
  }
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <ProjectCard info={info} reload={reload} />
      <AccessCard info={info} />
      <VisibilityCard info={info} reload={reload} />
      <SourcesCard info={info} />
      <div className="flex items-center justify-between border-t border-line pt-4 text-[13px] text-muted">
        <span>Signed in as {me?.user.email} (agency)</span>
        <Btn onClick={logout}>Sign out</Btn>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <div className="text-[15px] font-medium">{title}</div>
        {note && <div className="mt-0.5 text-[13px] text-muted">{note}</div>}
      </div>
      <Card className="p-5">{children}</Card>
    </section>
  );
}

function ProjectCard({ info, reload }: { info: WsInfo; reload: () => void }) {
  const [f, setF] = useState({ name: info.name, client_url: info.client_url || '', category_description: info.category_description || '', stage: info.stage || 'lead' });
  const [saved, setSaved] = useState(false);
  const dirty = f.name !== info.name || f.client_url !== (info.client_url || '') || f.category_description !== (info.category_description || '') || f.stage !== info.stage;
  return (
    <Section title="Project" note="Stage and internals are never shown to the client.">
      <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await api(`/w/${info.slug}/info`, { method: 'PATCH', body: f }); setSaved(true); reload(); setTimeout(() => setSaved(false), 1500); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Client website</Label><Input value={f.client_url} placeholder="https://" onChange={(e) => setF({ ...f, client_url: e.target.value })} /></div>
        </div>
        <div>
          <Label>What the client does</Label>
          <textarea value={f.category_description} rows={3} onChange={(e) => setF({ ...f, category_description: e.target.value })} className="w-full rounded-md border border-line bg-panel px-3 py-2 text-[13px] outline-none focus:border-muted" />
        </div>
        <div className="flex items-end justify-between gap-4">
          <div><Label>Stage</Label><Select value={f.stage} options={STAGES} onChange={(v) => setF({ ...f, stage: v })} /></div>
          <div className="flex items-center gap-3">
            {saved && <span className="text-[12px] text-muted">Saved</span>}
            <Btn kind="primary" type="submit" disabled={!dirty}>Save</Btn>
          </div>
        </div>
        <div className="text-[12px] text-muted">Address: <span className="mono">{location.host}/{info.slug}</span></div>
      </form>
    </Section>
  );
}

function AccessCard({ info }: { info: WsInfo }) {
  const [members, setMembers] = useState<{ email: string; role: string; has_code: number }[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('client_admin');
  const [issued, setIssued] = useState<{ email: string; code: string } | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const load = () => api(`/w/${info.slug}/members`).then(setMembers);
  useEffect(() => { load(); }, [info.slug]);

  const message = issued
    ? `Hi! Here is your access to the ${info.name} project space at Metabrand.\n\n${location.origin}/login\nEmail: ${issued.email}\nCode: ${issued.code}\n\nYou will see the materials we share with you as the project goes.`
    : '';

  return (
    <Section title="Client access" note={`Each person signs in at ${location.host} with their email and a personal code. They see only this project, only items marked as shared, and published research.`}>
      {members.length > 0 && (
        <table className="mb-5 w-full text-[13px]">
          <tbody>
            {members.map((m) => (
              <tr key={m.email} className="border-b border-line last:border-0">
                <td className="py-2 font-medium">{m.email}</td>
                <td className="py-2 text-muted">{m.role.replace('_', ' ')}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button className="text-[12px] text-muted hover:text-text" onClick={async () => setIssued(await api(`/w/${info.slug}/members/reset-code`, { body: { email: m.email } }))}>New code</button>
                  <button className="ml-4 text-[12px] text-muted hover:text-text" onClick={async () => { if (confirm(`Remove ${m.email} from ${info.name}?`)) { await api(`/w/${info.slug}/members?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }); load(); } }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {issued && (
        <div className="mb-5 rounded-md border border-line bg-panel-2 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px]">Code for <span className="font-medium">{issued.email}</span>, shown once:</div>
            <button onClick={() => setIssued(null)} className="text-muted hover:text-text" aria-label="Close">✕</button>
          </div>
          <div className="mono mt-2 inline-block rounded-md bg-brand px-3 py-1.5 text-[18px] tracking-widest text-brand-ink">{issued.code}</div>
          <pre className="mt-3 whitespace-pre-wrap text-[12px] text-muted">{message}</pre>
          <div className="mt-3"><Btn onClick={async () => { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy message'}</Btn></div>
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault(); setErr('');
          try { setIssued(await api(`/w/${info.slug}/members`, { body: { email, role } })); setEmail(''); load(); } catch (x: any) { setErr(x.message); }
        }}
      >
        <div className="min-w-[220px] flex-1"><Label>Email</Label><Input type="email" required value={email} placeholder="founder@client.com" onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>Role</Label><Select value={role} options={ROLES} onChange={setRole} /></div>
        <Btn kind="primary" type="submit">Give access</Btn>
      </form>
      <div className="mt-2 text-[12px] text-muted">{ROLE_NOTE[role]}</div>
      {err && <div className="mt-2 text-[12px] text-[var(--color-direct)]">{err}</div>}
    </Section>
  );
}

function VisibilityCard({ info, reload }: { info: WsInfo; reload: () => void }) {
  const hidden: string[] = info.settings?.hidden_tabs || [];
  async function toggle(id: string) {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    await api(`/w/${info.slug}/info`, { method: 'PATCH', body: { settings: { ...(info.settings || {}), hidden_tabs: next } } });
    reload();
  }
  return (
    <Section title="What the client sees" note="Sections switched off here disappear from the client's sidebar. Stage, contacts, internal notes and usage are always hidden.">
      <div className="space-y-2">
        {CLIENT_TABS.map(([id, label]) => (
          <label key={id} className="flex cursor-pointer items-center justify-between rounded-md px-1 py-1 text-[13px] hover:bg-panel-2">
            <span>{label}</span>
            <input type="checkbox" checked={!hidden.includes(id)} onChange={() => toggle(id)} className="h-4 w-4 accent-[var(--mb-text)]" />
          </label>
        ))}
      </div>
    </Section>
  );
}

function SourcesCard({ info }: { info: WsInfo }) {
  const [health, setHealth] = useState<{ ai: boolean; apollo?: boolean; ahrefs?: boolean } | null>(null);
  const [usage, setUsage] = useState<{ provider: string; units: number; calls: number }[]>([]);
  useEffect(() => {
    api('/health').then(setHealth);
    api(`/w/${info.slug}/usage`).then(setUsage);
  }, [info.slug]);
  const ai = usage.find((u) => u.provider === 'anthropic');
  const rows: [string, string, boolean][] = [
    ['AI chat, research and documents', health?.ai ? 'Anthropic API connected' : 'Anthropic API key not set', Boolean(health?.ai)],
    ['Company facts (team, rounds, LinkedIn)', health?.apollo ? 'Apollo API connected' : 'Apollo key not set (APOLLO_API_KEY)', Boolean(health?.apollo)],
    ['DR, search traffic, brand searches', health?.ahrefs ? 'Ahrefs API connected' : 'Ahrefs key not set (AHREFS_API_KEY)', Boolean(health?.ahrefs)],
    ['Design files', 'Figma links now, sync later', false],
  ];
  return (
    <Section title="Data sources and usage" note="We start without paid integrations and add trials one by one to compare quality.">
      <div className="divide-y divide-line text-[13px]">
        {rows.map(([k, v, on]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-2">
            <span>{k}</span>
            <span className="flex items-center gap-2 text-muted">{v}<span className={`h-2 w-2 rounded-full ${on ? 'bg-text' : 'border border-line'}`} /></span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-8 border-t border-line pt-4">
        <div><div className="num text-[20px] font-medium">{ai ? ai.calls : 0}</div><div className="text-[11px] text-muted">AI answers in this project</div></div>
        <div><div className="num text-[20px] font-medium">{ai ? Math.round(ai.units / 1000) : 0}k</div><div className="text-[11px] text-muted">tokens used</div></div>
      </div>
    </Section>
  );
}
