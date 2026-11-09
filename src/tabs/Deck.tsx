// Pitch deck: the brand's deck templates as editable screens. Generate a deck from content (pasted text,
// a PDF or a document from Memory), edit any text in place, add slides by layout, present or save as PDF.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { Btn, Card } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { useGoogleFonts, type Kit } from './BrandKit';
import { H, LAYOUTS, W, blank, lookOf, starterDeck, uid, type Deck, type Layout, type Slide } from './deck';
import { Frame, SlideView } from './DeckSlide';

type Doc = { id: string; title: string; kind: string };

/** Shrinks a picture to at most 1920 px on the long side before upload. */
async function shrink(file: File): Promise<Blob> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  try {
    await img.decode();
    const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && file.size < 900_000 && /png|jpeg|webp/.test(file.type)) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Could not read the picture'))), 'image/webp', 0.86));
  } finally { URL.revokeObjectURL(img.src); }
}
const fileB64 = (f: File) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => no(r.error); r.readAsDataURL(f); });

export default function DeckTab({ info }: { info: WsInfo }) {
  const [kit, setKit] = useState<Kit | null | undefined>(undefined);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error' | ''>('');
  const [present, setPresent] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<(u: string) => void>(() => {});
  const first = useRef(true);

  useEffect(() => {
    (async () => {
      const k = (await api<{ data: Kit } | null>(`/w/${info.slug}/research/brand_kit`).catch(() => null))?.data || null;
      setKit(k);
      const d = await api<{ deck: Deck } | null>(`/w/${info.slug}/deck`).catch(() => null);
      setDeck(d?.deck?.slides?.length ? d.deck : starterDeck(k));
    })();
  }, [info.slug]);
  useGoogleFonts(kit?.fonts || []);
  const look = useMemo(() => (kit ? lookOf(kit) : null), [kit]);

  // autosave, a moment after the last change
  useEffect(() => {
    if (!deck) return;
    if (first.current) { first.current = false; return; }
    setSaved('saving');
    const t = setTimeout(() => api(`/w/${info.slug}/deck`, { method: 'PUT', body: { deck } }).then(() => setSaved('saved')).catch(() => setSaved('error')), 700);
    return () => clearTimeout(t);
  }, [deck, info.slug]);

  if (kit === undefined || !deck) return <div className="text-[13px] text-muted">Loading…</div>;
  if (!kit || !look) return <div className="max-w-xl text-[13px] text-muted">The pitch deck templates are drawn from the brand kit. Add the brand kit first (Assets).</div>;

  const slides = deck.slides;
  const update = (i: number, patch: Partial<Slide>) => setDeck({ ...deck, slides: slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: number) => { const a = [...slides]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); setDeck({ ...deck, slides: a }); };
  const remove = (i: number) => setDeck({ ...deck, slides: slides.filter((_, j) => j !== i) });
  const dup = (i: number) => { const a = [...slides]; a.splice(i + 1, 0, { ...structuredClone(slides[i]), id: uid() }); setDeck({ ...deck, slides: a }); };
  const add = (at: number, layout: Layout) => { const a = [...slides]; a.splice(at, 0, blank(layout, kit, deck.footer)); setDeck({ ...deck, slides: a }); setMenu(null); };
  const pick = (apply: (u: string) => void) => { pickRef.current = apply; fileRef.current?.click(); };
  async function onFile(f?: File) {
    if (!f) return;
    try {
      const blob = await shrink(f);
      const r = await fetch(`/api/w/${info.slug}/deck/image`, { method: 'POST', headers: { 'content-type': blob.type || f.type }, body: blob });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      pickRef.current(j.url);
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pitch deck</h1>
          <div className="mt-1 text-[13px] text-muted">The {kit.brand} deck templates. Click any text to edit it, click a picture to change it. {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved.' : saved === 'error' ? 'Not saved, check the connection.' : ''}</div>
        </div>
        <div className="flex gap-2">
          <Btn onClick={() => { if (confirm('Start over from the template? Your changes to this deck will be replaced.')) setDeck(starterDeck(kit)); }}>Start over</Btn>
          <Btn onClick={() => setPresent(0)}>Present</Btn>
          <Btn onClick={() => printDeck()}>Download PDF</Btn>
        </div>
      </div>

      <Generator info={info} kit={kit} onDeck={(d) => { setDeck(d); }} has={slides.length} />

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="mx-auto max-w-[1100px] space-y-3">
        {slides.map((s, i) => {
          const L = LAYOUTS.find((l) => l.id === s.layout)!;
          const themeable = s.layout !== 'cover' && s.layout !== 'contacts';
          return (
            <Fragment key={s.id}>
              <div className="group">
                <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
                  <span className="num w-6 text-text">{String(i + 1).padStart(2, '0')}</span>
                  <span>{L.name}</span>
                  <span className="flex-1" />
                  {themeable && <button className="deck-tool" onClick={() => update(i, { dark: !s.dark })}>{s.dark ? 'Light' : 'Dark'}</button>}
                  {s.layout === 'steps' && <button className="deck-tool" onClick={() => update(i, { stat: { ...(s.stat || { value: '4x', label: 'Key result' }), on: s.stat?.on === false } })}>{s.stat?.on === false ? 'Show figure' : 'Hide figure'}</button>}
                  {(s.layout === 'cover' || s.layout === 'contacts') && !!kit.backgrounds?.length && (
                    <button className="deck-tool" onClick={() => { const b = kit.backgrounds!; const k = b.findIndex((x) => x.src === s.bg); update(i, { bg: b[(k + 1) % b.length].src }); }}>Next background</button>
                  )}
                  <button className="deck-tool" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</button>
                  <button className="deck-tool" disabled={i === slides.length - 1} onClick={() => move(i, 1)} title="Move down">↓</button>
                  <button className="deck-tool" onClick={() => dup(i)}>Duplicate</button>
                  <button className="deck-tool" onClick={() => { if (confirm('Delete this slide?')) remove(i); }}>Delete</button>
                </div>
                <Frame className="rounded-md border border-line shadow-sm">
                  <SlideView slide={s} n={i + 1} total={slides.length} footer={deck.footer} look={look} kit={kit} edit={{ set: (p) => update(i, p), pick }} />
                </Frame>
              </div>
              <AddSlide open={menu === i + 1} onOpen={() => setMenu(menu === i + 1 ? null : i + 1)} onAdd={(l) => add(i + 1, l)} />
            </Fragment>
          );
        })}
        {!slides.length && <AddSlide open={menu === 0} onOpen={() => setMenu(menu === 0 ? null : 0)} onAdd={(l) => add(0, l)} />}
      </div>

      {present !== null && <Presenter deck={deck} look={look} kit={kit} start={present} onClose={() => setPresent(null)} />}
      {createPortal(
        <div id="deck-print">{slides.map((s, i) => <div key={s.id} className="deck-page"><SlideView slide={s} n={i + 1} total={slides.length} footer={deck.footer} look={look} kit={kit} edit={null} /></div>)}</div>,
        document.body,
      )}
    </div>
  );
}

/** Wait for the pictures, then print: the browser's Save as PDF gives a vector PDF, one slide a page. */
async function printDeck() {
  const root = document.getElementById('deck-print');
  if (!root) return;
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.complete ? null : img.decode().catch(() => null))));
  await document.fonts.ready;
  window.print();
}

function AddSlide({ open, onOpen, onAdd }: { open: boolean; onOpen: () => void; onAdd: (l: Layout) => void }) {
  return (
    <div className="relative py-1">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <button onClick={onOpen} className={`rounded-full border border-line px-3 py-1 text-[12px] ${open ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}>+ Add slide</button>
        <div className="h-px flex-1 bg-line" />
      </div>
      {open && (
        <div className="mx-auto mt-2 grid max-w-[720px] grid-cols-2 gap-2 rounded-md border border-line bg-panel p-2 shadow-xl @3xl:grid-cols-3">
          {LAYOUTS.map((l) => (
            <button key={l.id} onClick={() => onAdd(l.id)} className="rounded-md px-3 py-2.5 text-left hover:bg-panel-2">
              <LayoutIcon id={l.id} />
              <div className="mt-2 text-[13px] font-medium">{l.name}</div>
              <div className="text-[11px] leading-snug text-muted">{l.hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A small wireframe of each layout for the add-slide menu. */
function LayoutIcon({ id }: { id: Layout }) {
  const b = 'fill-current text-muted/40', d = 'fill-current text-text/70';
  return (
    <svg viewBox="0 0 64 36" className="h-9 w-16 rounded-[3px] border border-line">
      {id === 'cover' && <><rect width="64" height="36" className="fill-current text-text/85" /><rect x="5" y="16" width="30" height="4" className="fill-current text-panel" /><rect x="5" y="22" width="22" height="4" className="fill-current text-[var(--mb-brand-fill)]" /></>}
      {id === 'text' && <><rect x="5" y="6" width="34" height="4" className={d} /><rect x="5" y="18" width="40" height="2" className={b} /><rect x="5" y="22" width="34" height="2" className={b} /></>}
      {id === 'image' && <><rect x="5" y="6" width="22" height="4" className={d} /><rect x="5" y="16" width="20" height="2" className={b} /><rect x="35" y="3" width="26" height="30" className={b} /></>}
      {id === 'cards' && <><rect x="5" y="5" width="26" height="4" className={d} />{[0, 1, 2].map((k) => <rect key={k} x={5 + k * 19} y="15" width="16" height="16" className={b} />)}</>}
      {id === 'steps' && <><rect x="5" y="6" width="22" height="4" className={d} /><rect x="5" y="25" width="20" height="6" className="fill-current text-[var(--mb-brand-fill)]" /><rect x="35" y="3" width="26" height="30" className={b} />{[0, 1, 2].map((k) => <rect key={k} x="40" y={6 + k * 9} width="18" height="7" className="fill-current text-panel" />)}</>}
      {id === 'contacts' && <><rect width="64" height="36" className="fill-current text-text/85" /><rect x="5" y="10" width="26" height="3" className="fill-current text-panel" /><rect x="5" y="22" width="9" height="9" className="fill-current text-muted" /><rect x="14" y="22" width="16" height="9" className="fill-current text-panel" /></>}
    </svg>
  );
}

function Generator({ info, kit, onDeck, has }: { info: WsInfo; kit: Kit; onDeck: (d: Deck) => void; has: number }) {
  const [text, setText] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [doc, setDoc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api<Doc[]>(`/w/${info.slug}/documents`).then((d) => setDocs(Array.isArray(d) ? d : [])).catch(() => {}); }, [info.slug]);

  async function onUpload(f?: File) {
    if (!f) return;
    setErr('');
    if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { if (f.size > 20_000_000) { setErr('The PDF is over 20 MB.'); return; } setPdf(f); return; }
    if (/^text\//.test(f.type) || /\.(md|txt|csv)$/i.test(f.name)) { const body = await f.text(); setText((t) => (t ? `${t}\n\n` : '') + body); return; }
    setErr('Upload a PDF or a text file. For Word or Google Docs, paste the text.');
  }
  async function go() {
    if (!text.trim() && !pdf && !doc) { setErr('Paste the content, upload a PDF or pick a document.'); return; }
    if (has > 0 && !confirm('Replace the current slides with a new deck?')) return;
    setBusy(true); setErr('');
    try {
      const r = await api<{ footer: string; slides: any[] }>(`/w/${info.slug}/deck/generate`, { body: { text: text.trim() || undefined, doc_id: doc || undefined, pdf_base64: pdf ? await fileB64(pdf) : undefined } });
      onDeck(fromAi(r, kit));
    } catch (e: any) { setErr(e.message || 'Generation failed'); } finally { setBusy(false); }
  }
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-medium">Make a deck from content</div>
        <div className="text-[12px] text-muted">A brief, notes, a one-pager or an old deck. The AI lays it out on these templates; then edit anything.</div>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste the content here…"
        className="w-full resize-y rounded-md border border-line bg-panel px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-muted" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-[13px] hover:bg-panel-2">
          Upload PDF or text
          <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden" onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {pdf && <span className="flex items-center gap-1 rounded-md bg-panel-2 px-2 py-1 text-[12px]">{pdf.name}<button className="text-muted hover:text-text" onClick={() => setPdf(null)}>×</button></span>}
        {!!docs.length && (
          <select value={doc} onChange={(e) => setDoc(e.target.value)} className="max-w-[260px] rounded-md border border-line bg-panel px-2 py-1.5 text-[13px] outline-none">
            <option value="">Or take a document from Memory…</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        )}
        <span className="flex-1" />
        {err && <span className="text-[12px] text-[var(--color-direct)]">{err}</span>}
        <Btn kind="brand" disabled={busy} onClick={go}>{busy ? 'Making the deck… about a minute' : '✦ Generate deck'}</Btn>
      </div>
    </Card>
  );
}

/** AI slides to deck slides: ids, the brand's art and icons where the template has them. */
function fromAi(r: { footer: string; slides: any[] }, kit: Kit): Deck {
  const bgs = kit.backgrounds || [];
  const globe = bgs.find((b) => /globe/i.test(b.src))?.src || bgs[0]?.src;
  const field = bgs.find((b) => /field/i.test(b.src))?.src || bgs[1]?.src || globe;
  const icons = (kit.icons || []).map((i) => i.id);
  let cards = 0;
  return {
    v: 1,
    footer: r.footer || kit.brand,
    slides: r.slides.map((s) => {
      const out: Slide = { ...s, id: uid() };
      delete (out as any).picture;
      if (s.layout === 'cover') out.bg = globe;
      if (s.layout === 'contacts') { out.bg = field; out.person = s.person || { name: '', role: '' }; }
      if (s.layout === 'cards') {
        out.dark = cards++ % 2 === 0;
        if (!out.dark) out.cards = (s.cards || []).map((c: any, k: number) => ({ ...c, icon: icons[(k * 3 + cards) % Math.max(1, icons.length)] }));
      }
      if (s.layout === 'image' && s.picture) out.text = out.text || '';
      return out;
    }),
  };
}

function Presenter({ deck, look, kit, start, onClose }: { deck: Deck; look: ReturnType<typeof lookOf>; kit: Kit; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const n = deck.slides.length;
  useEffect(() => {
    ref.current?.requestFullscreen?.().catch(() => {});
    const fit = () => setK(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    const key = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(n - 1, x + 1)); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
      if (e.key === 'Escape') onClose();
    };
    const fs = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener('resize', fit); window.addEventListener('keydown', key); document.addEventListener('fullscreenchange', fs);
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fs); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, [n, onClose]);
  const s = deck.slides[i];
  return (
    <div ref={ref} className="fixed inset-0 z-[100] flex items-center justify-center bg-black" onClick={(e) => { const x = e.clientX / window.innerWidth; setI((v) => (x < 0.3 ? Math.max(0, v - 1) : Math.min(n - 1, v + 1))); }}>
      <div style={{ width: W * k, height: H * k, position: 'relative' }}>
        <div style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}>{s && <SlideView slide={s} n={i + 1} total={n} footer={deck.footer} look={look} kit={kit} edit={null} />}</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/70 hover:text-white">Esc</button>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[12px] text-white/40">{i + 1} / {n}</div>
    </div>
  );
}
