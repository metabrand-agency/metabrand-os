// Merch (Brand OS): the brand on apparel, badges, stickers and documents, as a gallery with a full-screen
// viewer. Images come from the brand kit (the guide's "merch" section), so any project can have one.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { WsInfo } from '../pages/Workspace';
import type { GuideSection, Kit } from './BrandKit';

export const MERCH_ID = 'merch';
export const merchOf = (kit?: Kit | null): GuideSection | undefined => kit?.guide?.sections?.find((s) => s.id === MERCH_ID);

export default function Merch({ info }: { info: WsInfo }) {
  const [kit, setKit] = useState<Kit | null | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { api<{ data: Kit } | null>(`/w/${info.slug}/research/brand_kit`).then((r) => setKit(r?.data || null)).catch(() => setKit(null)); }, [info.slug]);
  const s = useMemo(() => merchOf(kit), [kit]);
  const n = s?.slides.length || 0;

  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => ((i ?? 0) + 1) % n);
      if (e.key === 'ArrowLeft') setOpen((i) => ((i ?? 0) - 1 + n) % n);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, n]);

  if (kit === undefined) return <div className="text-muted">Loading…</div>;
  if (!s || !n) {
    return (
      <div className="max-w-xl">
        <h1 className="text-[22px] font-semibold tracking-tight">Merch</h1>
        <p className="mt-2 text-[13px] text-muted">No merch mockups yet. They come with the brand kit.</p>
      </div>
    );
  }
  const cur = open !== null ? s.slides[open] : null;
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
          <button key={sl.img} onClick={() => setOpen(i)}
            className="group block aspect-[1600/1133] overflow-hidden rounded-md border border-line" style={{ background: sl.bg || '#FFFFFF' }}>
            <img src={sl.img} alt={sl.title || `Merch ${i + 1}`} loading={i < 3 ? 'eager' : 'lazy'}
              className={`h-full w-full transition duration-500 group-hover:scale-[1.02] ${sl.fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
          </button>
        ))}
      </div>

      {cur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setOpen(null)}>
          <img src={cur.img} alt="" className="max-h-[90vh] max-w-[90vw] rounded object-contain" onClick={(e) => e.stopPropagation()} />
          <button title="Close" onClick={() => setOpen(null)} className="absolute right-5 top-4 text-[26px] leading-none text-white/70 hover:text-white">×</button>
          <button title="Previous" onClick={(e) => { e.stopPropagation(); setOpen(((open ?? 0) - 1 + n) % n); }} className="absolute left-4 top-1/2 -translate-y-1/2 px-3 py-6 text-[34px] text-white/60 hover:text-white">‹</button>
          <button title="Next" onClick={(e) => { e.stopPropagation(); setOpen(((open ?? 0) + 1) % n); }} className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-6 text-[34px] text-white/60 hover:text-white">›</button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[12px] text-white/60">{(open ?? 0) + 1} / {n}</div>
        </div>
      )}
    </div>
  );
}
