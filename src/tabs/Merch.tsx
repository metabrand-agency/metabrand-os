// Merch (Brand OS): the brand on apparel, badges, stickers and documents, as a gallery with a full-screen
// viewer. Images come from the brand kit (the guide's "merch" section), so any project can have one.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { WsInfo } from '../pages/Workspace';
import type { GuideSection, Kit } from './BrandKit';
import Lightbox from '../components/Lightbox';

export const MERCH_ID = 'merch';
export const merchOf = (kit?: Kit | null): GuideSection | undefined => kit?.guide?.sections?.find((s) => s.id === MERCH_ID);

export default function Merch({ info }: { info: WsInfo }) {
  const [kit, setKit] = useState<Kit | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { api<{ data: Kit } | null>(`/w/${info.slug}/research/brand_kit`).then((r) => setKit(r?.data || null)).catch(() => setKit(null)); }, [info.slug]);
  const s = useMemo(() => merchOf(kit), [kit]);
  const n = s?.slides.length || 0;

  if (kit === undefined) return <div className="text-muted">Loading…</div>;
  if (!s || !n) {
    return (
      <div className="max-w-xl">
        <h1 className="text-[22px] font-semibold tracking-tight">Merch</h1>
        <p className="mt-2 text-[13px] text-muted">No merch mockups yet. They come with the brand kit.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{kit?.brand} merch</h1>
          <p className="mt-1 text-[13px] text-muted">{s.summary || 'The brand on apparel and objects.'}</p>
        </div>
        <span className="text-[12px] text-muted">{n} mockups</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {s.slides.map((sl, i) => (
          <div key={sl.img} className="group relative aspect-[1600/1133] overflow-hidden rounded-md border border-line" style={{ background: sl.bg || '#FFFFFF' }}>
            <button onClick={() => setOpen(i)} className="block h-full w-full" title="Open full screen">
              <img src={sl.img} alt={sl.title || `Merch ${i + 1}`} loading={i < 3 ? 'eager' : 'lazy'}
                className={`h-full w-full transition duration-500 group-hover:scale-[1.02] ${sl.fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
            </button>
            {sl.file && (
              <a href={sl.file} download className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-black/75 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur transition hover:bg-black"
                title="Vector artwork for each placement at print size, with a spec sheet (PDF)">
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
                Download print files
              </a>
            )}
          </div>
        ))}
      </div>

      <Lightbox items={s.slides.map((sl, k) => ({ src: sl.img!, label: `${kit?.brand} merch`, bg: sl.bg }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </div>
  );
}
