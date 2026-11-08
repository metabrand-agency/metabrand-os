import { useEffect, useState } from 'react';
import { api } from '../api';
import { Btn, Card, Input, Label, Select, Badge } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import BrandKit, { type Kit, type KitVideo } from './BrandKit';
import Lightbox from '../components/Lightbox';
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
  const [kit, setKit] = useState<Kit | null>(null);
  useEffect(() => { api<{ data: Kit } | null>(`/w/${s}/research/brand_kit`).then((r) => setKit(r?.data || null)).catch(() => setKit(null)); }, [s]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <p className="mt-1 text-[13px] text-muted">What the brand ships with: logos, colours, fonts and icons to download, Figma libraries and videos. Sites, repositories, briefs and calls are in Memory.</p>
      </div>

      <BrandKit info={info} />
      <Backgrounds kit={kit} />

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

      <CaseVideos kit={kit} />

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onClick={() => setPreview(null)}>
          <iframe src={figmaEmbed(preview.url)} className="h-full w-full max-w-6xl rounded-md border border-line bg-panel" allowFullScreen />
        </div>
      )}
    </div>
  );
}

/** Generative art backgrounds from the brand kit: full-size files to download, a viewer to flip through them. */
function Backgrounds({ kit }: { kit: Kit | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const bgs = kit?.backgrounds || [];
  if (!bgs.length) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight">Generative backgrounds</h2>
        <span className="text-[12px] text-muted">{bgs.length} images, JPG</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {bgs.map((b, i) => (
          <Card key={b.src} className="group overflow-hidden">
            <button onClick={() => setOpen(i)} className="block aspect-[2500/1816] w-full cursor-zoom-in overflow-hidden bg-[#0B0B0E]">
              <img src={b.thumb || b.src} alt={b.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
            </button>
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]">
              <span className="truncate text-[13px] font-medium">{b.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-muted">
                {b.w && <span>{b.w}×{b.h}</span>}
                <a href={b.src} download className="rounded border border-line px-2 py-0.5 text-text hover:bg-panel-2">JPG ↓</a>
              </span>
            </div>
          </Card>
        ))}
      </div>
      <Lightbox items={bgs.map((b) => ({ src: b.src, title: b.name, label: 'Backgrounds' }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </section>
  );
}

function VideoTile({ v }: { v: KitVideo }) {
  const [hover, setHover] = useState(false);
  const tall = (v.h || 0) > (v.w || 0);
  return (
    <Card className="overflow-hidden">
      <a href={v.src} target="_blank" rel="noreferrer" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="relative block aspect-[1920/1360] overflow-hidden bg-[#0B0B0E]">
        {hover
          ? <video src={v.light || v.src} poster={v.poster} autoPlay muted loop playsInline className={`h-full w-full ${tall ? 'object-contain' : 'object-cover'}`} />
          : <img src={v.poster} alt={v.title} loading="lazy" className={`h-full w-full ${tall ? 'object-contain' : 'object-cover'}`} />}
        {!hover && <span className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white backdrop-blur"><svg viewBox="0 0 16 16" className="ml-0.5 h-3.5 w-3.5"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg></span>}
      </a>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-[13px] font-medium">{v.title}</span>
        <a href={v.src} target="_blank" rel="noreferrer" className="shrink-0 rounded border border-line px-2 py-0.5 text-[12px] hover:bg-panel-2">MP4 ↗</a>
      </div>
    </Card>
  );
}

/** Videos from the agency's case study, as links. */
function CaseVideos({ kit }: { kit: Kit | null }) {
  const vids = kit?.videos || [];
  if (!vids.length) return null;
  return (
    <section className="border-t border-line pt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight">Case videos</h2>
        <a href={kit?.guide?.film?.link || '#'} target="_blank" rel="noreferrer" className="text-[12px] text-muted hover:text-text">{vids.length} films from the case study ↗</a>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {vids.map((v) => <VideoTile key={v.src} v={v} />)}
      </div>
    </section>
  );
}
