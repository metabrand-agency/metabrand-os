// Full-screen viewer: one picture at a time with its notes on the right (dark, small type), round arrows and
// the keyboard page through the set; the next page slides in over the previous one.
import { ReactNode, useEffect, useState } from 'react';

export type LightItem = { src: string; title?: string; label?: string; bg?: string; aside?: ReactNode };

const Arrow = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" aria-hidden="true">
    <path d={dir === 'left' ? 'M10 3L5 8L10 13' : 'M6 3L11 8L6 13'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CSS = `
@keyframes lb-in-r { from { transform: translateX(14%) scale(.97); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes lb-in-l { from { transform: translateX(-14%) scale(.97); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes lb-out { from { transform: none; opacity: 1 } to { transform: scale(.94); opacity: 0 } }
@keyframes lb-text { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }`;

export default function Lightbox({ items, index, onIndex, onClose }: { items: LightItem[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const n = items.length;
  // the page we are leaving stays underneath while the new one slides over it
  const [prev, setPrev] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const go = (to: number, dir: 1 | -1) => { if (index !== null) setPrev({ i: index, dir }); onIndex(to); };
  useEffect(() => {
    if (index === null) { setPrev(null); return; }
    const t = setTimeout(() => setPrev(null), 520);
    return () => clearTimeout(t);
  }, [index]);
  useEffect(() => {
    if (index === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go((index + 1) % n, 1);
      if (e.key === 'ArrowLeft') go((index - 1 + n) % n, -1);
    };
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; };
  }, [index, n]);
  if (index === null || !items[index]) return null;
  const it = items[index];
  const before = prev && prev.i !== index ? items[prev.i] : null;
  const dir = prev?.dir ?? 1;
  const round = 'absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white backdrop-blur transition hover:bg-black/70';
  const aside = it.aside || it.title;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B0B0E] text-white" onClick={onClose}>
      <style>{CSS}</style>
      <div className="flex h-14 shrink-0 items-center justify-between px-6 text-[12px] text-white/60" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 truncate">{it.label}</div>
        <div className="flex items-center gap-4">
          <span className="num">{index + 1} / {n}</span>
          <button title="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-[20px] leading-none text-white/80 hover:bg-white/15">×</button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 px-6 pb-8 lg:flex-row lg:gap-8 lg:pl-20 lg:pr-8">
        <div className="relative min-h-[40vh] min-w-0 flex-1">
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {before && (
            <img key={`b${prev!.i}`} src={before.src} alt="" className="absolute max-h-full max-w-full rounded object-contain" style={{ background: before.bg, animation: 'lb-out .5s ease forwards' }} />
          )}
          <img key={it.src} src={it.src} alt={it.title || ''} onClick={(e) => e.stopPropagation()}
            className="relative max-h-full max-w-full rounded object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)]"
            style={{ background: it.bg, animation: prev ? `${dir > 0 ? 'lb-in-r' : 'lb-in-l'} .5s cubic-bezier(.2,.8,.2,1)` : undefined }} />
          </div>
          {n > 1 && (
            <>
              <button title="Previous" onClick={(e) => { e.stopPropagation(); go((index - 1 + n) % n, -1); }} className={`${round} left-2 lg:-left-16`}><Arrow dir="left" /></button>
              <button title="Next" onClick={(e) => { e.stopPropagation(); go((index + 1) % n, 1); }} className={`${round} right-2`}><Arrow dir="right" /></button>
            </>
          )}
        </div>
        {aside && (
          <aside key={`t${index}`} onClick={(e) => e.stopPropagation()} className="max-h-[32vh] shrink-0 overflow-y-auto lg:max-h-none lg:w-[300px] lg:self-center" style={{ animation: 'lb-text .45s ease' }}>
            {it.aside || <div className="text-[15px] text-white">{it.title}</div>}
          </aside>
        )}
      </div>
    </div>
  );
}
