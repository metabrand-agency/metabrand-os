// One pitch deck slide at 1920 × 1080, drawn from the brand kit after the deck templates in Figma.
// In edit mode every text is editable in place and pictures are swapped by clicking them.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Kit, KitLogo } from './BrandKit';
import { H, W, mix, type Look, type Slide } from './deck';

type Edit = { set: (patch: Partial<Slide>) => void; pick: (apply: (url: string) => void) => void } | null;

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
// unquoted data URL: the style sits inside a double-quoted attribute, so no quotes or brackets may stay raw
const arrowSvg = (c: string) => `url(data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2.15'><path d='M2.5 12H20.5M13 4.5L20.5 12L13 19.5'/></svg>`).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
/** Arrows (→) drawn like the template's: the character stays for editing, the picture shows. */
const rich = (s: string, accent: string) => esc(s).replace(/→/g, `<span style="display:inline-block;width:.74em;color:transparent;background:${arrowSvg(accent)} no-repeat 0 58%/contain;margin-right:.14em">→</span>`);

/** Text that turns editable in edit mode; saved on blur. Empty fields show a hint while editing. */
function T({ v, on, style, ph, accent, className = '' }: { v?: string; on?: (s: string) => void; style?: CSSProperties; ph?: string; accent?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el) el.innerHTML = accent ? rich(v || '', accent) : esc(v || '');
  }, [v, accent]);
  if (!on && !v) return null;
  return (
    <div ref={ref} className={`${on ? 'deck-edit' : ''} ${className}`} data-ph={ph} style={{ whiteSpace: 'pre-line', ...style }}
      contentEditable={!!on} suppressContentEditableWarning spellCheck={false}
      onBlur={(e) => { const t = e.currentTarget.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim(); if (on && t !== (v || '')) on(t); }}
      onKeyDown={(e) => { if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur(); }} />
  );
}

function Logo({ l, color, h, style }: { l?: KitLogo; color: string; h: number; style?: CSSProperties }) {
  if (!l) return null;
  return <svg viewBox={`0 0 ${l.w} ${l.h}`} height={h} width={(h * l.w) / l.h} style={{ color, display: 'block', ...style }} dangerouslySetInnerHTML={{ __html: l.svg }} />;
}

/** The brand's pixel squares on a grey panel, seeded by the slide so they stay put. */
function Pixels({ seed, look, corners }: { seed: string; look: Look; corners: ['tl' | 'tr' | 'bl' | 'br', 'tl' | 'tr' | 'bl' | 'br'] }) {
  let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const G = 61, cols = 15, rows = 16;
  const cells: [number, number, string][] = [];
  for (const c of corners) {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const dx = c.includes('l') ? x : cols - 1 - x, dy = c.includes('t') ? y : rows - 1 - y;
      const d = Math.hypot(dx * 1.1, dy);
      if (r() < Math.max(0, 0.95 - d * 0.22)) cells.push([x, y, look.squares[Math.floor(r() * look.squares.length)]]);
    }
  }
  return <svg viewBox={`0 0 ${cols * G} ${rows * G}`} preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>{cells.map(([x, y, f], i) => <rect key={i} x={x * G} y={y * G} width={G} height={G} fill={f} />)}</svg>;
}

function Picture({ src, edit, onSet, look, seed, style, fit = 'cover', label = 'Add a picture' }: { src?: string; edit: Edit; onSet: (u: string) => void; look: Look; seed: string; style: CSSProperties; fit?: 'cover' | 'contain'; label?: string }) {
  return (
    <div style={{ position: 'absolute', overflow: 'hidden', background: look.panel, ...style }} className={edit ? 'deck-pic' : ''} onClick={edit ? () => edit.pick(onSet) : undefined}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />
        : <><Pixels seed={seed} look={look} corners={['tl', 'br']} />{edit && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `400 26px ${look.mono}`, color: look.ink, opacity: 0.6 }}>{label}</div>}</>}
      {edit && src && <div className="deck-pic-hint">Change picture</div>}
    </div>
  );
}

export function SlideView({ slide: s, n, total, footer, look, kit, edit }: { slide: Slide; n: number; total: number; footer: string; look: Look; kit: Kit | null; edit: Edit }) {
  const dark = s.layout === 'cover' || s.layout === 'contacts' || !!s.dark;
  const bg = s.layout === 'cover' || s.layout === 'contacts' ? look.dark : s.dark ? look.graphite : s.layout === 'steps' ? look.cloud : look.mist;
  const ink = dark ? look.inkLight : look.ink;
  const soft = mix(ink, bg, 0.35);
  const set = (k: keyof Slide) => (edit ? (v: string) => edit.set({ [k]: v } as Partial<Slide>) : undefined);
  const head = (px: number, extra: CSSProperties = {}): CSSProperties => ({ font: `400 ${px}px/1.15 "${look.head}", sans-serif`, letterSpacing: '-0.02em', color: ink, ...extra });
  const body = (px: number, extra: CSSProperties = {}): CSSProperties => ({ font: `400 ${px}px/1.45 "${look.head}", sans-serif`, color: ink, ...extra });
  const kicker: CSSProperties = { position: 'absolute', left: 64, top: 50, font: `400 16px/1 "${look.head}", sans-serif`, letterSpacing: '0.1em', textTransform: 'uppercase', color: ink };
  const icon = (id?: string) => kit?.icons?.find((i) => i.id === id);
  const num = String(n).padStart(2, '0');

  const foot = s.layout !== 'cover' && s.layout !== 'contacts' && (
    <>
      <div style={{ position: 'absolute', left: 66, bottom: 34, width: 36, height: 36, borderRadius: 6, background: dark ? mix(look.panel, bg, 0.25) : look.panel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Logo l={look.sign} color={mix(look.panel, '#ffffff', 0.55)} h={22} />
      </div>
      {footer && <div style={{ position: 'absolute', left: 940, bottom: 46, font: `400 14px/1 "${look.head}", sans-serif`, color: ink }}>{footer}</div>}
      <div style={{ position: 'absolute', right: 60, bottom: 44, font: `400 21px/1 "${look.head}", sans-serif`, color: ink }}>{num}</div>
    </>
  );

  let content: React.ReactNode = null;
  if (s.layout === 'cover') {
    content = (
      <>
        {s.bg && <img src={s.bg} alt="" style={{ position: 'absolute', left: 92, top: -156, width: 3110, height: 'auto', maxWidth: 'none' }} />}
        {edit && <button className="deck-bg-btn" onClick={() => edit.pick((u) => edit.set({ bg: u }))}>Change background</button>}
        <Logo l={look.logo} color={look.inkLight} h={51} style={{ position: 'absolute', left: 94, top: 72 }} />
        <T v={s.title} on={set('title')} accent={look.accent} ph="Headline" style={head(126, { position: 'absolute', left: 86, top: 368, width: 1500, lineHeight: 1.08 })} />
        {footer && <div style={{ position: 'absolute', left: 720, bottom: 44, font: `400 14px/1 "${look.head}", sans-serif`, color: soft }}>{footer}</div>}
      </>
    );
  } else if (s.layout === 'contacts') {
    const p = s.person || { name: '', role: '' };
    const sp = (k: keyof NonNullable<Slide['person']>) => (edit ? (v: string) => edit.set({ person: { ...p, [k]: v } }) : undefined);
    content = (
      <>
        {s.bg && <img src={s.bg} alt="" style={{ position: 'absolute', right: -420, top: -260, height: 1700, width: 'auto', maxWidth: 'none' }} />}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${look.dark} 34%, transparent 64%)` }} />
        {edit && <button className="deck-bg-btn" onClick={() => edit.pick((u) => edit.set({ bg: u }))}>Change background</button>}
        <Logo l={look.logo} color={look.inkLight} h={48} style={{ position: 'absolute', left: 73, top: 64 }} />
        <T v={s.title} on={set('title')} accent={look.accent} ph="Closing line" style={head(62, { position: 'absolute', left: 80, top: 424, width: 1000, lineHeight: 1.16 })} />
        <div style={{ position: 'absolute', left: 94, top: 760, width: 557, height: 218, display: 'flex', background: look.cloud }}>
          <Picture src={s.image} edit={edit} onSet={(u) => edit?.set({ image: u })} look={look} seed={s.id} label="Photo" style={{ position: 'relative', width: 218, height: 218, flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: 1, padding: '22px 22px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: look.ink }}>
            <T v={p.name} on={sp('name')} ph="Name" style={body(20, { color: look.ink, fontWeight: 500, lineHeight: 1.2 })} />
            <div>
              <T v={p.role} on={sp('role')} ph="Role, company" style={body(17, { color: look.ink, lineHeight: 1.3 })} />
              <T v={p.email} on={sp('email')} ph="email" style={body(17, { color: look.ink, lineHeight: 1.3 })} />
              <T v={p.site} on={sp('site')} ph="website" style={body(17, { color: look.ink, lineHeight: 1.3 })} />
            </div>
          </div>
        </div>
      </>
    );
  } else if (s.layout === 'text') {
    content = (
      <>
        <T v={s.kicker} on={set('kicker')} ph="Kicker" style={kicker} />
        <T v={s.title} on={set('title')} accent={look.accent} ph="Headline" style={head(59, { position: 'absolute', left: 64, top: 124, width: 1300 })} />
        <T v={s.text} on={set('text')} ph="Text" style={body(26, { position: 'absolute', left: 64, top: 430, width: 980 })} />
      </>
    );
  } else if (s.layout === 'image') {
    content = (
      <>
        <T v={s.kicker} on={set('kicker')} ph="Kicker" style={kicker} />
        <T v={s.title} on={set('title')} accent={look.accent} ph="Headline" style={head(59, { position: 'absolute', left: 64, top: 124, width: 760 })} />
        <T v={s.text} on={set('text')} ph="Text" style={body(21.5, { position: 'absolute', left: 64, top: 396, width: 480 })} />
        <Picture src={s.image} edit={edit} onSet={(u) => edit?.set({ image: u })} look={look} seed={s.id} style={{ left: 970, top: 47, width: 890, height: 929 }} />
      </>
    );
  } else if (s.layout === 'cards') {
    const cards = s.cards || [];
    const x0 = s.dark ? 80 : 76, cw = (W - x0 * 2 - 24 * (cards.length - 1)) / Math.max(1, cards.length);
    const setCard = (i: number, patch: any) => edit?.set({ cards: cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
    content = (
      <>
        <T v={s.kicker} on={set('kicker')} ph="Kicker" style={kicker} />
        <T v={s.title} on={set('title')} accent={look.accent} ph="Headline" style={head(s.dark ? 62 : 59, { position: 'absolute', left: 64, top: s.dark ? 132 : 124, width: s.dark ? 1180 : 760, lineHeight: s.dark ? 1.13 : 1.15 })} />
        {cards.map((c, i) => {
          const ic = icon(c.icon);
          const cardBg = s.dark ? look.card : look.cloud;
          const cink = s.dark ? look.inkLight : look.ink;
          return (
            <div key={i} style={{ position: 'absolute', left: x0 + i * (cw + 24), top: s.dark ? 394 : 423, width: cw, height: s.dark ? 535 : 441, background: cardBg }}>
              <T v={c.title} on={edit ? (v) => setCard(i, { title: v }) : undefined} ph="Card title" style={head(34, { position: 'absolute', left: 30, top: 34, width: cw - (ic ? 140 : 60), color: cink, letterSpacing: '-0.01em', lineHeight: 1.15 })} />
              {ic && !c.image && (
                <div style={{ position: 'absolute', right: 26, top: 27, width: 65, height: 65, background: look.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox={`0 0 ${ic.w} ${ic.h}`} width={40} height={40} style={{ color: look.ink }} dangerouslySetInnerHTML={{ __html: ic.svg }} />
                </div>
              )}
              {(c.image || (edit && s.dark)) && (
                <div style={{ position: 'absolute', left: (cw - 350) / 2, top: 128, width: 350, height: 300, cursor: edit ? 'pointer' : undefined }} className={edit ? 'deck-pic' : ''} onClick={edit ? () => edit.pick((u) => setCard(i, { image: u })) : undefined}>
                  {c.image ? <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div style={{ width: '100%', height: '100%', border: `2px dashed ${mix(cink, cardBg, 0.7)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `400 20px "${look.mono}", monospace`, color: mix(cink, cardBg, 0.5) }}>Picture</div>}
                </div>
              )}
              <T v={c.text} on={edit ? (v) => setCard(i, { text: v }) : undefined} ph="Text" style={body(18.5, { position: 'absolute', left: 30, right: 30, bottom: s.dark ? 44 : 40, color: cink, lineHeight: s.dark ? 1.45 : 1.75 })} />
            </div>
          );
        })}
      </>
    );
  } else if (s.layout === 'steps') {
    const steps = s.steps || [];
    const st = s.stat;
    const setStep = (i: number, patch: any) => edit?.set({ steps: steps.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
    const setStat = (k: string) => (edit ? (v: string) => edit.set({ stat: { ...(st || { value: '', label: '' }), [k]: v } }) : undefined);
    content = (
      <>
        <T v={s.kicker} on={set('kicker')} ph="Kicker" style={kicker} />
        <T v={s.title} on={set('title')} accent={look.accent} ph="Headline" style={head(59, { position: 'absolute', left: 64, top: 124, width: 820 })} />
        <T v={s.text} on={set('text')} ph="Text" style={body(21.5, { position: 'absolute', left: 64, top: 384, width: 480 })} />
        {st?.on !== false && st && (
          <>
            <div style={{ position: 'absolute', left: 63, top: 722, width: 557, height: 218, display: 'flex', background: '#FFFFFF' }}>
              <div style={{ width: 218, height: 218, background: look.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Logo l={look.sign} color={look.ink} h={112} /></div>
              <div style={{ position: 'relative', flex: 1, padding: '26px 22px' }}>
                <T v={st.label} on={setStat('label')} ph="What the figure is" style={body(17, { color: look.ink, lineHeight: 1.3 })} />
                <T v={st.value} on={setStat('value')} ph="Figure" style={body(34, { position: 'absolute', left: 22, top: 104, color: look.ink, fontWeight: 500, lineHeight: 1.1 })} />
              </div>
            </div>
            <T v={st.note} on={setStat('note')} ph="Source of the figure" style={body(15, { position: 'absolute', left: 63, top: 958, width: 700, color: ink })} />
          </>
        )}
        <div style={{ position: 'absolute', left: 970, top: 47, width: 890, height: 929, background: look.panel, overflow: 'hidden' }}>
          <Pixels seed={s.id} look={look} corners={['tr', 'bl']} />
          {steps.map((c, i) => (
            <div key={i} style={{ position: 'absolute', left: 127, top: 132 + i * 226, width: 636, height: 213, background: look.cloud }}>
              <T v={c.title} on={edit ? (v) => setStep(i, { title: v }) : undefined} ph="Step" style={head(31, { position: 'absolute', left: 26, top: 30, color: look.ink, letterSpacing: '-0.01em' })} />
              <div style={{ position: 'absolute', right: 26, top: 26, minWidth: 28, height: 20, padding: '0 5px', background: look.accent, color: look.ink, font: `400 11px/20px "${look.mono}", monospace`, textAlign: 'center' }}>{String(i + 1).padStart(2, '0')}</div>
              <T v={c.text} on={edit ? (v) => setStep(i, { text: v }) : undefined} ph="Lines" style={body(17, { position: 'absolute', left: 26, top: 92, right: 26, color: look.ink, lineHeight: 1.52 })} />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div style={{ position: 'relative', width: W, height: H, overflow: 'hidden', background: bg, color: ink }} data-total={total}>
      {content}
      {foot}
    </div>
  );
}

/** A slide scaled to the width of its box. */
export function Frame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: `${W} / ${H}` }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  );
}
