import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Me, STAGES, fmtDate } from '../api';
import { Btn, Input, Logo, Label, Badge } from '../components/ui';

const STAGE_COLOR: Record<string, string> = { lead: '#8a919c', proposal: '#ffc94a', active: '#5ab0ff', launched: 'var(--mb-brand)', monitoring: '#b48cff', archived: '#a1a1aa' };

export default function Projects() {
  const nav = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', client_url: '', category_description: '' });

  async function load() {
    const m = await api<Me>('/me');
    setMe(m);
    const ws = await api<any[]>('/workspaces');
    if (!m.isAgency && ws.length === 1) return nav(`/${ws[0].slug}`);
    setRows(ws);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ slug: string }>('/workspaces', { body: form });
    nav(`/${r.slug}`);
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <Logo url={me?.org?.logo_url} name={me?.org?.name || 'Metabrand'} />
        <div className="flex items-center gap-3 text-[12px] text-muted">
          {me?.user.email}
          <Btn onClick={async () => { await api('/auth/logout', { body: {} }); nav('/login'); }}>Sign out</Btn>
        </div>
      </div>

      <div className="mt-12 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-[13px] text-muted">{rows.length} workspaces</p>
        </div>
        {me?.isAgency && <Btn kind="primary" onClick={() => setCreating((v) => !v)}>New project</Btn>}
      </div>

      {creating && (
        <form onSubmit={create} className="anim-rise mt-6 grid gap-3 rounded-xl border border-line bg-panel p-5 md:grid-cols-3">
          <div><Label>Name</Label><Input required placeholder="Acme" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Website</Label><Input placeholder="https://acme.com" value={form.client_url} onChange={(e) => setForm({ ...form, client_url: e.target.value })} /></div>
          <div><Label>Category</Label><Input placeholder="What they do, in one line" value={form.category_description} onChange={(e) => setForm({ ...form, category_description: e.target.value })} /></div>
          <div className="md:col-span-3"><Btn kind="primary" type="submit">Create /{(form.name || 'slug').toLowerCase().replace(/[^a-z0-9]+/g, '-')}</Btn></div>
        </form>
      )}

      <div className="mt-8 overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-[1.4fr_1fr_.6fr_.6fr_.8fr] border-b border-line bg-panel px-5 py-2.5 text-[11px] uppercase tracking-[.08em] text-muted">
          <div>Project</div><div>Website</div><div>Memory</div><div>Assets</div><div>Stage</div>
        </div>
        {rows.map((w) => (
          <Link key={w.id} to={`/${w.slug}`} className="grid grid-cols-[1.4fr_1fr_.6fr_.6fr_.8fr] items-center border-b border-line px-5 py-4 text-[14px] last:border-0 hover:bg-panel">
            <div>
              <div className="font-medium">{w.name}</div>
              <div className="text-[12px] text-muted">/{w.slug}{w.created_at ? ` · ${fmtDate(w.created_at)}` : ''}</div>
            </div>
            <div className="truncate text-[13px] text-muted">{w.client_url?.replace(/^https?:\/\//, '')}</div>
            <div className="num text-[13px]">{w.docs ?? '—'}</div>
            <div className="num text-[13px]">{w.assets ?? '—'}</div>
            <div>{w.stage && <Badge color={STAGE_COLOR[w.stage]}>{w.stage}</Badge>}</div>
          </Link>
        ))}
        {!rows.length && <div className="px-5 py-10 text-center text-[13px] text-muted">No projects yet</div>}
      </div>
      <p className="mt-4 text-[11px] text-muted">Stages: {STAGES.join(' → ')}</p>
    </div>
  );
}
