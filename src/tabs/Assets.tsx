import { useEffect, useState } from 'react';
import { api } from '../api';
import { Btn, Card, Input, Label, Select, Badge } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import BrandKit from './BrandKit';
import { LINK_KINDS } from './Memory';

const KIND_LABEL: Record<string, string> = { figma: 'Figma', github_repo: 'GitHub', video: 'Video', webflow_site: 'Webflow', website: 'Website', link: 'Link', logo: 'Logo', font: 'Font' };

function figmaEmbed(url: string) {
  return `https://www.figma.com/embed?embed_host=metabrand-os&url=${encodeURIComponent(url)}`;
}

export default function Assets({ info }: { info: WsInfo }) {
  const s = info.slug;
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ url: '', title: '', visibility: 'internal' });
  const [preview, setPreview] = useState<any>(null);
  // sites, Webflow and repositories live in Project memory
  const load = async () => setRows(((await api<any[]>(`/w/${s}/assets`)) || []).filter((a) => !LINK_KINDS.includes(a.kind)));
  useEffect(() => { load(); }, [s]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <p className="mt-1 text-[13px] text-muted">What the brand ships with: logos, colours, fonts and icons to download, Figma libraries and videos. Sites, repositories, briefs and calls are in Memory.</p>
      </div>

      <BrandKit info={info} />

      <h2 className="border-t border-line pt-8 text-[17px] font-semibold tracking-tight">Figma and video</h2>

      {info.access.isAgency && (
        <Card className="p-5">
          <Label>Add asset by link</Label>
          <form onSubmit={async (e) => { e.preventDefault(); await api(`/w/${s}/assets`, { body: form }); setForm({ url: '', title: '', visibility: 'internal' }); load(); }} className="flex flex-wrap gap-2">
            <Input className="min-w-[320px] flex-[2]" placeholder="Figma or video link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
            <Input className="flex-1" placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Select value={form.visibility} options={['internal', 'client']} onChange={(v) => setForm({ ...form, visibility: v })} />
            <Btn kind="primary" type="submit">Add</Btn>
          </form>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((a) => (
          <Card key={a.id} className="group overflow-hidden">
            <div className="grid-bg flex h-36 items-center justify-center border-b border-line bg-panel-2 text-3xl text-muted">
              {a.kind === 'video' && a.url ? <video src={a.url} className="h-full w-full object-cover" muted /> : <span className="text-[13px] uppercase tracking-[.12em]">{KIND_LABEL[a.kind] || a.kind}</span>}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[14px] font-medium">{a.title}</div>
                <Badge color={a.visibility === 'client' ? 'var(--mb-brand)' : undefined}>{a.visibility}</Badge>
              </div>
              <div className="mt-1 truncate text-[12px] text-muted">{a.url?.replace(/^https?:\/\//, '')}</div>
              <div className="mt-3 flex gap-2">
                {a.url && <a href={a.url} target="_blank" className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-text">Open ↗</a>}
                {a.kind === 'figma' && <button onClick={() => setPreview(a)} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted hover:text-text">Preview</button>}
                {info.access.isAgency && <button onClick={async () => { await api(`/w/${s}/assets/${a.id}`, { method: 'DELETE' }); load(); }} className="ml-auto text-[12px] text-muted opacity-0 hover:text-direct group-hover:opacity-100">Remove</button>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {!rows.length && <div className="text-[13px] text-muted">No assets yet.</div>}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onClick={() => setPreview(null)}>
          <iframe src={figmaEmbed(preview.url)} className="h-full w-full max-w-6xl rounded-md border border-line bg-panel" allowFullScreen />
        </div>
      )}
    </div>
  );
}
