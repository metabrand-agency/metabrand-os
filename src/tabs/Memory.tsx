import { useEffect, useState } from 'react';
import { api, DOC_KINDS, fmtDate } from '../api';
import { Btn, Card, Input, Label, Select, Badge } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';

function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export default function Memory({ info, focus }: { info: WsInfo; focus?: string }) {
  const s = info.slug;
  const [docs, setDocs] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [form, setForm] = useState({ kind: 'brief', title: '', text: '', visibility: 'internal' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => setDocs(await api(`/w/${s}/documents`));
  useEffect(() => { load(); }, [s]);
  useEffect(() => {
    if (!focus) return;
    if (focus.startsWith('d_')) { api(`/w/${s}/documents/${focus}`).then(setOpen).catch(() => {}); return; }
    setQ(focus); // a search phrase from the AI chat
    api(`/w/${s}/search?q=${encodeURIComponent(focus)}`).then(setHits).catch(() => {});
  }, [focus]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body: any = { kind: form.kind, title: form.title || file?.name || 'Untitled', visibility: form.visibility };
      if (file) {
        if (file.type === 'application/pdf') body.pdf_base64 = await fileToBase64(file);
        else body.text = await file.text();
      } else body.text = form.text;
      await api(`/w/${s}/documents`, { body });
      setForm({ ...form, title: '', text: '' });
      setFile(null);
      load();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setHits(q.trim() ? await api(`/w/${s}/search?q=${encodeURIComponent(q)}`) : null);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Project memory</h1>
        <p className="mt-1 text-[13px] text-muted">Briefs, meeting transcripts, correspondence, proposals. Searchable by you, the assistant and any connected AI agent.</p>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <Input placeholder="Search memory: “competitors”, “pricing”, “deadline”…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Btn type="submit">Search</Btn>
      </form>

      {hits && (
        <Card className="p-5">
          <Label>{hits.length} matches</Label>
          <div className="space-y-3">
            {hits.map((h) => (
              <button key={h.id} onClick={() => api(`/w/${s}/documents/${h.id}`).then(setOpen)} className="block w-full text-left">
                <div className="text-[13px] font-medium">{h.title} <span className="text-muted">{h.kind}</span></div>
                <div className="mt-0.5 text-[13px] text-muted" dangerouslySetInnerHTML={{ __html: h.snip }} />
              </button>
            ))}
          </div>
        </Card>
      )}

      {info.access.isAgency && (
        <Card className="p-5">
          <Label>Add to memory</Label>
          <form onSubmit={add} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select value={form.kind} options={DOC_KINDS} onChange={(v) => setForm({ ...form, kind: v })} />
              <Select value={form.visibility} options={['internal', 'client']} onChange={(v) => setForm({ ...form, visibility: v })} />
              <Input className="flex-1" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <textarea rows={5} placeholder="Paste text: transcript, email thread, brief… or attach a file below" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} className="w-full rounded-md border border-line bg-panel px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-muted" />
            <div className="flex items-center gap-3">
              <label className="cursor-pointer rounded-md border border-dashed border-line px-3 py-1.5 text-[12px] text-muted hover:text-text">
                {file ? file.name : 'Attach .txt / .md / .pdf'}
                <input type="file" accept=".txt,.md,.pdf,.csv,.json,.vtt,.srt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <Btn kind="primary" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add'}</Btn>
              {err && <span className="text-[12px] text-direct">{err}</span>}
            </div>
          </form>
        </Card>
      )}

      <div className="overflow-hidden rounded-md border border-line">
        {docs.map((d) => (
          <button key={d.id} onClick={() => api(`/w/${s}/documents/${d.id}`).then(setOpen)} className="grid w-full grid-cols-[1fr_auto] gap-4 border-b border-line px-5 py-3.5 text-left last:border-0 hover:bg-panel">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[14px] font-medium">{d.title} <Badge>{d.kind.replace('_', ' ')}</Badge>{d.visibility === 'client' && <Badge color="var(--mb-brand)">shared</Badge>}</div>
              <div className="mt-1 truncate text-[12px] text-muted">{d.preview}</div>
            </div>
            <div className="num text-right text-[12px] text-muted">{fmtDate(d.created_at)}<br />{Math.round(d.chars / 1000)}k chars</div>
          </button>
        ))}
        {!docs.length && <div className="px-5 py-10 text-center text-[13px] text-muted">Memory is empty. Add the brief, meeting transcripts and key emails.</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8" onClick={() => setOpen(null)}>
          <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-md border border-line bg-panel p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><div className="text-xl font-semibold">{open.title}</div><div className="text-[12px] text-muted">{open.kind}, {fmtDate(open.created_at)}</div></div>
              <div className="flex gap-2">
                {info.access.isAgency && <Btn onClick={async () => { await api(`/w/${s}/documents/${open.id}`, { method: 'DELETE' }); setOpen(null); load(); }}>Delete</Btn>}
                <Btn onClick={() => setOpen(null)}>Close</Btn>
              </div>
            </div>
            <pre className="mt-6 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-muted">{open.text_content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
