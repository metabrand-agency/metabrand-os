// Full-screen viewer: an image at a time, round arrows (and the keyboard) page through the set.
import { useEffect } from 'react';

export type LightItem = { src: string; title?: string; label?: string; bg?: string };

const Arrow = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" aria-hidden="true">
    <path d={dir === 'left' ? 'M10 3L5 8L10 13' : 'M6 3L11 8L6 13'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Lightbox({ items, index, onIndex, onClose }: { items: LightItem[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const n = items.length;
  useEffect(() => {
    if (index === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % n);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n);
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [index, n, onIndex, onClose]);
  if (index === null || !items[index]) return null;
  const it = items[index];
  const round = 'absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition hover:bg-white/25';
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/92" onClick={onClose}>
      <div className="flex h-14 shrink-0 items-center justify-between px-6 text-[13px] text-white/70">
        <div className="min-w-0 truncate">{it.label && <span className="mr-3 text-white/40">{it.label}</span>}{it.title}</div>
        <div className="flex items-center gap-4">
          <span className="num">{index + 1} / {n}</span>
          <button title="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-[20px] leading-none text-white/80 hover:bg-white/15">×</button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-20 pb-10">
        <img key={it.src} src={it.src} alt={it.title || ''} onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded object-contain" style={{ background: it.bg }} />
        {n > 1 && (
          <>
            <button title="Previous" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + n) % n); }} className={`${round} left-5`}><Arrow dir="left" /></button>
            <button title="Next" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % n); }} className={`${round} right-5`}><Arrow dir="right" /></button>
          </>
        )}
      </div>
    </div>
  );
}
