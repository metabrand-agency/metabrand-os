// Banner generator (Brand OS): pick a format, write a headline or ask AI for options, and get several
// on-brand variants (statement, big number, type wall, generative flow field, app icon, motion, announcement,
// photo) drawn from the project's brand kit. Download each as PNG or SVG, or all of them as a ZIP.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { api } from '../api';
import { Btn, Card, Input, Label } from '../components/ui';
import type { WsInfo } from '../pages/Workspace';
import { useGoogleFonts, type Kit } from './BrandKit';
import { FORMATS, PATTERNS, VARIANTS, embeddedFonts, numberIn, render, rolesOf, toPng, type Copy } from './banners';

type Idea = { headline: string; number?: string; label?: string; angle?: string };
type Saved = { copy: Copy; fmt: string; topic: string; pat?: Record<string, string> };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'banner';
function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const store = {
  get: (k: string): Saved | null => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k: string, v: Saved) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

/** A kit for projects without one: colours and fonts read from the client's site. */
function kitFromSite(name: string, b: any): Kit {
  const palette: string[] = (b?.palette || []).map((p: any) => p.hex).filter(Boolean);
  const fonts = (b?.fonts || []).slice(0, 2).map((f: any) => ({ family: f.family, google: true, weights: [400, 500] }));
  return {
    brand: name, logos: [], icons: [],
    colors: [{ group: 'Brand', items: (palette.length ? palette : ['#0E0E10', '#F4F4F0', '#3B6EF5', '#8FA9A0', '#C9B26B']).map((hex, i) => ({ name: `Colour ${i + 1}`, hex })) }],
    fonts: fonts.length ? fonts : [{ family: 'Inter', google: true, weights: [400, 500] }],
  };
}

/** Downscale an uploaded photo so banners stay light. */
async function readImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  } finally { URL.revokeObjectURL(url); }
}

export default function Generate({ info }: { info: WsInfo }) {
  const key = `mb-banner-${info.slug}`;
  const saved = useMemo(() => store.get(key), [key]);
  const [kit, setKit] = useState<Kit | null | undefined>(undefined);
  const [fromSite, setFromSite] = useState(false);
  const [fmtId, setFmtId] = useState(saved?.fmt || 'square');
  const [copy, setCopy] = useState<Copy>(saved?.copy || { headline: '' });
  const [topic, setTopic] = useState(saved?.topic || '');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState('');
  const [seed, setSeed] = useState(1);
  const [own, setOwn] = useState<Record<string, number>>({});
  const [pat, setPat] = useState<Record<string, string>>(saved?.pat || {});
  const [busy, setBusy] = useState('');
  const [fontTick, setFontTick] = useState(0);
  const file = useRef<HTMLInputElement>(null);

  // brand kit, or colours and fonts from the client's site when there is no kit yet
  useEffect(() => {
    (async () => {
      const k = (await api<{ data: Kit } | null>(`/w/${info.slug}/research/brand_kit`).catch(() => null))?.data;
      const m = (await api<{ data: any } | null>(`/w/${info.slug}/research/market_map`).catch(() => null))?.data;
      const hero = m?.client?.hero || k?.fonts?.[0]?.styles?.[0]?.sample || '';
      setCopy((c) => (c.headline ? c : { ...c, headline: hero || `${k?.brand || info.name}` }));
      if (k?.colors?.length) { setKit(k); return; }
      setFromSite(true);
      setKit(kitFromSite(m?.client?.name || info.name, m?.client?.branding));
    })();
  }, [info.slug, info.name]);

  useGoogleFonts(kit?.fonts || []);
  useEffect(() => {
    if (!kit) return;
    const loads = (kit.fonts || []).flatMap((f) => (f.weights?.length ? f.weights : [400]).map((w) => document.fonts.load(`${w} 64px "${f.family}"`)));
    Promise.allSettled(loads).then(() => setFontTick((t) => t + 1));
    const done = () => setFontTick((t) => t + 1);
    document.fonts.addEventListener('loadingdone', done);
    return () => document.fonts.removeEventListener('loadingdone', done);
  }, [kit]);

  useEffect(() => { store.set(key, { copy: { ...copy, image: undefined }, fmt: fmtId, topic, pat }); }, [key, copy, fmtId, topic, pat]);

  const fmt = FORMATS.find((f) => f.id === fmtId) || FORMATS[0];
  const R = useMemo(() => (kit ? rolesOf(kit) : null), [kit]);
  const c = useDeferredValue(copy);
  const fig = c.number || numberIn(c.headline);
  const cards = useMemo(() => {
    if (!R) return [];
    void fontTick;
    return VARIANTS.map((v) => {
      const missing = (v.needs === 'number' && !fig) || (v.needs === 'image' && !c.image);
      return { v, missing, svg: missing ? '' : render(v.id, fmt, R, c, seed + (own[v.id] || 0), '', { pattern: pat[v.id] }) };
    });
  }, [R, fmt, c, seed, own, pat, fig, fontTick]);

  const suggest = async () => {
    setThinking(true); setErr('');
    try {
      const r = await api<{ items: Idea[] }>(`/w/${info.slug}/generate/headlines`, { method: 'POST', body: { topic } });
      setIdeas(r.items || []);
    } catch (e: any) { setErr(e.message || 'Could not get headlines'); }
    setThinking(false);
  };

  const fileBase = (id: string) => `${slugify(kit?.brand || info.name)}-${id}-${fmt.w}x${fmt.h}`;
  const fullSvg = async (id: string) => render(id, fmt, R!, copy, seed + (own[id] || 0), await embeddedFonts(kit?.fonts || []).catch(() => ''), { pattern: pat[id] });
  const download = async (id: string, kind: 'png' | 'svg') => {
    setBusy(`${id}:${kind}`);
    try {
      const svg = await fullSvg(id);
      save(kind === 'png' ? await toPng(svg, fmt.w, fmt.h) : new Blob([svg], { type: 'image/svg+xml' }), `${fileBase(id)}.${kind}`);
    } catch (e: any) { setErr(e.message || 'Download failed'); }
    setBusy('');
  };
  const downloadAll = async () => {
    setBusy('all');
    try {
      const out: Record<string, Uint8Array> = {};
      for (const { v, missing } of cards) {
        if (missing) continue;
        out[`${fileBase(v.id)}.png`] = new Uint8Array(await (await toPng(await fullSvg(v.id), fmt.w, fmt.h)).arrayBuffer());
      }
      save(new Blob([zipSync(out, { level: 0 })], { type: 'application/zip' }), `${slugify(kit?.brand || info.name)}-banners-${fmt.id}.zip`);
    } catch (e: any) { setErr(e.message || 'Download failed'); }
    setBusy('');
  };
  const onFile = async (f?: File | null) => {
    if (!f) return;
    const image = await readImage(f).catch(() => '');
    if (image) setCopy((x) => ({ ...x, image }));
    if (file.current) file.current.value = '';
  };

  if (kit === undefined || !R) return <div className="text-muted">Loading…</div>;
  // columns follow the space the grid actually has (the chat panel can take part of it)
  const cols = fmt.w / fmt.h > 1.4 ? '@2xl:grid-cols-2 @7xl:grid-cols-3' : fmt.h / fmt.w > 1.4 ? '@md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4' : '@xl:grid-cols-2 @5xl:grid-cols-3';

  return (
    <div className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="space-y-4 self-start lg:sticky lg:top-16">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Banner generator</h1>
          <p className="mt-1 text-[13px] text-muted">On-brand banners from the {fromSite ? 'colours and fonts on the site (add a brand kit in Assets for logos and exact colours)' : 'brand kit'}. Pick a format, write or generate a headline.</p>
        </div>

        <Card className="space-y-0.5 p-3">
          <Label>Format</Label>
          {FORMATS.map((f) => {
            const k = 22 / Math.max(f.w, f.h);
            return (
              <button key={f.id} onClick={() => setFmtId(f.id)} className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] ${f.id === fmtId ? 'bg-panel-2 font-medium' : 'text-muted hover:bg-panel-2 hover:text-text'}`}>
                <span className="flex h-6 w-6 items-center justify-center"><span className={`block rounded-[2px] border ${f.id === fmtId ? 'border-text' : 'border-muted'}`} style={{ width: f.w * k, height: f.h * k }} /></span>
                <span className="flex-1">{f.label}</span>
                <span className="text-[11px] text-muted">{f.note.split(',')[0]}</span>
              </button>
            );
          })}
        </Card>

        <Card className="space-y-3 p-3">
          <div>
            <Label>Headline</Label>
            <textarea value={copy.headline} onChange={(e) => setCopy({ ...copy, headline: e.target.value })} rows={3} placeholder="One-shot 30% of engineering tasks"
              className="mt-1 w-full resize-y rounded-md border border-line bg-panel px-3 py-2 text-[14px] outline-none focus:border-muted" />
            <p className="mt-1 text-[11px] text-muted">For the type wall, split steps with → or commas: Plan → Build → Check</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Number</Label><Input id="banner-number" value={copy.number || ''} onChange={(e) => setCopy({ ...copy, number: e.target.value })} placeholder={numberIn(copy.headline) || '$2.6M'} /></div>
            <div><Label>Kicker</Label><Input value={copy.label || ''} onChange={(e) => setCopy({ ...copy, label: e.target.value })} placeholder="Release" /></div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Btn onClick={() => file.current?.click()}>{copy.image ? 'Replace photo' : 'Add a photo'}</Btn>
            {copy.image && <><img src={copy.image} alt="" className="h-8 w-8 rounded object-cover" /><button onClick={() => setCopy({ ...copy, image: undefined })} className="text-[12px] text-muted hover:text-text">Remove</button></>}
          </div>
        </Card>

        <Card className="space-y-2.5 p-3">
          <Label>Headline ideas</Label>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What is the post about? (optional)" onKeyDown={(e) => e.key === 'Enter' && !thinking && suggest()} />
          <Btn kind="brand" onClick={suggest} disabled={thinking}>{thinking ? 'Writing…' : '✦ Suggest headlines'}</Btn>
          {err && <p className="text-[12px] text-red-500">{err}</p>}
          {!!ideas.length && (
            <div className="space-y-1">
              {ideas.map((x, i) => (
                <button key={i} onClick={() => setCopy({ ...copy, headline: x.headline, number: x.number || '', label: x.label || '' })}
                  className={`block w-full rounded-md border px-2.5 py-1.5 text-left text-[13px] leading-snug hover:bg-panel-2 ${x.headline === copy.headline ? 'border-muted bg-panel-2' : 'border-line'}`}>
                  {x.headline}
                  <span className="mt-0.5 block text-[11px] text-muted">{[x.angle, x.number, x.label].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </aside>

      <section className="@container min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] text-muted">{cards.filter((x) => !x.missing).length} variants · {fmt.label}, {fmt.note}</div>
          <div className="flex gap-2">
            <Btn onClick={() => { setSeed((s) => s + 1); setOwn({}); }}>↻ Shuffle</Btn>
            <Btn kind="primary" onClick={downloadAll} disabled={!!busy}>{busy === 'all' ? 'Packing…' : 'Download all (ZIP)'}</Btn>
          </div>
        </div>
        <div className={`grid gap-4 ${cols}`}>
          {cards.map(({ v, missing, svg }) => (
            <Card key={v.id} className="overflow-hidden p-0">
              {missing ? (
                <button onClick={() => (v.needs === 'image' ? file.current?.click() : document.getElementById('banner-number')?.focus())}
                  className="flex w-full flex-col items-center justify-center gap-1 border-b border-dashed border-line bg-panel-2/40 p-6 text-center text-[13px] text-muted hover:text-text" style={{ aspectRatio: `${fmt.w} / ${fmt.h}` }}>
                  <span className="text-[20px]">{v.needs === 'image' ? '⬆' : '#'}</span>
                  {v.needs === 'image' ? 'Add a photo for this one' : 'Add a number (or put one in the headline) for a stat banner'}
                </button>
              ) : (
                <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
              )}
              {v.art && (
                <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
                  {[{ id: '', name: 'Auto' }, ...PATTERNS].map((p) => (
                    <button key={p.id} onClick={() => setPat((x) => ({ ...x, [v.id]: p.id }))}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${(pat[v.id] || '') === p.id ? 'bg-panel-2 font-medium text-text' : 'text-muted hover:text-text'}`}>{p.name}</button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0"><div className="truncate text-[13px] font-medium">{v.name}</div><div className="truncate text-[11px] text-muted">{v.hint}</div></div>
                {!missing && (
                  <div className="flex shrink-0 items-center gap-1 text-[12px]">
                    <button title="Another take" onClick={() => setOwn((o) => ({ ...o, [v.id]: (o[v.id] || 0) + 101 }))} className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-text">↻</button>
                    <button onClick={() => download(v.id, 'png')} disabled={!!busy} className="rounded border border-line px-2 py-0.5 hover:bg-panel-2 disabled:opacity-40">{busy === `${v.id}:png` ? '…' : 'PNG'}</button>
                    <button onClick={() => download(v.id, 'svg')} disabled={!!busy} className="rounded border border-line px-2 py-0.5 hover:bg-panel-2 disabled:opacity-40">{busy === `${v.id}:svg` ? '…' : 'SVG'}</button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
