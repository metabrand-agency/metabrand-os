// Online guide: the brand book as a site. A film at the top, then the sections with previews; each section
// lays out the guideline pages with their notes, plus live blocks from the brand kit (logos, colours, fonts,
// icons) that can be copied or downloaded. Without a prepared guide it is built from the brand kit alone.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { WsInfo } from '../pages/Workspace';
import { Guide as GuideT, GuideSection, Kit, dataUri, iconSvg, isLight, logoSvg, useGoogleFonts } from './BrandKit';

// the film's own near-black background disappears into a slightly lighter page background
const FADE: React.CSSProperties = { mixBlendMode: 'lighten' };
const sat = (hex: string) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v); };
const display = (kit: Kit) => `"${kit.fonts?.[0]?.family || 'Inter'}", var(--font-sans, system-ui)`;

/** A guide from the brand kit alone, for projects without a prepared one. */
function fromKit(kit: Kit): GuideT {
  const sections: GuideSection[] = [];
  if (kit.logos?.length) sections.push({ id: 'logo', num: '', title: 'Logo', summary: 'Logotype versions and colour-ways.', kit: 'logos', slides: [] });
  if (kit.colors?.some((g) => g.items.length)) sections.push({ id: 'colour', num: '', title: 'Colour', summary: 'The palette with values for screen and print.', kit: 'colours', slides: [] });
  if (kit.fonts?.length) sections.push({ id: 'typography', num: '', title: 'Typography', summary: kit.fonts.map((f) => f.family).join(' and '), kit: 'fonts', slides: [] });
  if (kit.icons?.length) sections.push({ id: 'icons', num: '', title: 'Icons', summary: 'The icon set.', kit: 'icons', slides: [] });
  sections.forEach((s, i) => (s.num = String(i + 1).padStart(2, '0')));
  return { title: `${kit.brand} Brand Guidelines`, sections };
}

export default function Guide({ info, section }: { info: WsInfo; section?: string }) {
  const [kit, setKit] = useState<Kit | null | undefined>(undefined);
  useEffect(() => { api<{ data: Kit } | null>(`/w/${info.slug}/research/brand_kit`).then((r) => setKit(r?.data || null)).catch(() => setKit(null)); }, [info.slug]);
  useGoogleFonts(kit?.fonts || []);
  const guide = useMemo(() => (kit ? kit.guide || fromKit(kit) : null), [kit]);
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }); }, [section]);

  if (kit === undefined) return <div className="px-8 py-8 text-muted">Loading…</div>;
  if (!kit || !guide?.sections.length) {
    return (
      <div className="px-8 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Online guide</h1>
        <p className="mt-2 max-w-xl text-[13px] text-muted">The guide is built from the brand kit. Add logos, colours and fonts in Assets and the guide appears here.</p>
        <Link to={`/${info.slug}/assets`} className="mt-4 inline-block rounded-md border border-line px-3 py-2 text-[13px] hover:bg-panel-2">Open Assets</Link>
      </div>
    );
  }
  const current = guide.sections.find((s) => s.id === section);
  return current ? <SectionPage info={info} kit={kit} guide={guide} s={current} /> : <Home info={info} kit={kit} guide={guide} />;
}

function Home({ info, kit, guide }: { info: WsInfo; kit: Kit; guide: GuideT }) {
  const bg = guide.hero?.bg || '#08090A';
  const mark = kit.logos?.find((l) => l.id === 'logo') || kit.logos?.[0];
  return (
    <div>
      {/* film */}
      <section className="relative flex min-h-[560px] flex-col overflow-hidden text-white" style={{ background: bg, height: 'calc(100vh - 48px)', maxHeight: 820 }}>
        <div className="flex items-center justify-between px-10 pt-8 text-[13px] text-white/70">
          {mark ? <img src={dataUri(logoSvg(mark, { color: '#FFFFFF', file: '' }, 400).svg)} alt={kit.brand} className="h-6" /> : <span>{kit.brand}</span>}
          <span>{guide.version}</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          {guide.hero?.video
            ? <video src={guide.hero.video} poster={guide.hero.poster} autoPlay muted loop playsInline className="w-[min(46vh,440px)]" style={FADE} />
            : mark && <img src={dataUri(logoSvg(mark, { color: '#FFFFFF', file: '' }, 1200).svg)} alt="" className="w-[min(60%,560px)]" />}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6 px-10 pb-10">
          <h1 className="text-[clamp(40px,6vw,88px)] font-normal leading-[0.95] tracking-[-0.02em]" style={{ fontFamily: display(kit) }}>
            {kit.brand}<br /><span className="text-white/45">Brand Guidelines</span>
          </h1>
          {guide.hero?.caption && <p className="max-w-[360px] text-[13px] leading-relaxed text-white/60">{guide.hero.caption}</p>}
        </div>
      </section>

      {guide.intro && (
        <section className="grid gap-6 border-b border-line px-10 py-16 @container md:grid-cols-[200px_1fr]">
          <div className="text-[12px] uppercase tracking-[.1em] text-muted">Introduction</div>
          <p className="max-w-[880px] text-[clamp(22px,2.4vw,32px)] leading-[1.25] tracking-[-0.01em]" style={{ fontFamily: display(kit) }}>{guide.intro}</p>
        </section>
      )}

      {/* sections */}
      <section className="px-10 py-14">
        <div className="mb-6 text-[12px] uppercase tracking-[.1em] text-muted">Sections</div>
        <div className="grid gap-x-6 gap-y-10 md:grid-cols-2 2xl:grid-cols-3">
          {guide.sections.map((s) => (
            <Link key={s.id} to={`/${info.slug}/guide/${s.id}`} className="group block">
              <div className="aspect-[16/9] overflow-hidden rounded-md border border-line bg-panel-2">
                {s.cover ? <img src={s.cover} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <KitPreview kit={kit} s={s} />}
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="num text-[12px] text-muted">{s.num}</span>
                <span className="text-[20px] tracking-[-0.01em] group-hover:underline" style={{ fontFamily: display(kit) }}>{s.title}</span>
              </div>
              {s.summary && <div className="mt-0.5 pl-[30px] text-[13px] text-muted">{s.summary}</div>}
            </Link>
          ))}
        </div>
      </section>
      <Footer info={info} kit={kit} />
    </div>
  );
}

/** Preview for sections without a guideline page: drawn from the kit. */
function KitPreview({ kit, s }: { kit: Kit; s: GuideSection }) {
  if (s.kit === 'colours') {
    const items = kit.colors.flatMap((g) => g.items).slice(0, 6);
    return <div className="flex h-full">{items.map((c) => <div key={c.hex} className="flex-1" style={{ background: c.hex }} />)}</div>;
  }
  if (s.kit === 'fonts') return <div className="flex h-full items-center justify-center text-[64px]" style={{ fontFamily: display(kit) }}>Aa</div>;
  if (s.kit === 'icons') return <div className="flex h-full items-center justify-center gap-6 bg-[#f4f4f1]">{kit.icons.slice(0, 4).map((i) => <img key={i.id} src={dataUri(iconSvg(i, '#08090A', 48))} alt="" className="h-12 w-12" />)}</div>;
  const l = kit.logos[0];
  const v = l?.variants.find((x) => x.bg) || l?.variants[0];
  return l && v ? <img src={dataUri(logoSvg(l, v, 1200).svg)} alt="" className="h-full w-full object-cover" /> : null;
}

function SectionPage({ info, kit, guide, s }: { info: WsInfo; kit: Kit; guide: GuideT; s: GuideSection }) {
  const nav = useNavigate();
  const i = guide.sections.indexOf(s);
  const prev = guide.sections[i - 1], next = guide.sections[i + 1];
  return (
    <div>
      <div className="sticky top-12 z-[5] flex items-center gap-1 overflow-x-auto border-b border-line bg-ink/90 px-10 py-2 backdrop-blur">
        <Link to={`/${info.slug}/guide`} className="mr-2 shrink-0 rounded-md px-2 py-1 text-[12px] text-muted hover:text-text">← Guide</Link>
        {guide.sections.map((x) => (
          <button key={x.id} onClick={() => nav(`/${info.slug}/guide/${x.id}`)} className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] ${x.id === s.id ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}>
            <span className="num mr-1.5 opacity-60">{x.num}</span>{x.title}
          </button>
        ))}
      </div>

      <header className="px-10 pb-10 pt-14">
        <div className="num text-[13px] text-muted">{s.num}</div>
        <h1 className="mt-2 text-[clamp(40px,5.5vw,76px)] leading-[0.95] tracking-[-0.02em]" style={{ fontFamily: display(kit) }}>{s.title}</h1>
        {s.summary && <p className="mt-4 max-w-[640px] text-[16px] text-muted">{s.summary}</p>}
      </header>

      <div className="space-y-16 px-10 pb-16">
        {s.kit && <KitBlock info={info} kit={kit} kind={s.kit} />}
        {s.video && (
          <figure>
            <div className="flex items-center justify-center rounded-md py-14" style={{ background: guide.hero?.bg || '#08090A' }}>
              <video src={s.video.src} autoPlay muted loop playsInline className="w-[min(40vh,380px)]" style={FADE} />
            </div>
            <Caption title={s.video.title} text={s.video.text} kit={kit} />
          </figure>
        )}
        {!!s.motion?.length && (
          <figure>
            <div className="grid gap-3 md:grid-cols-3">
              {s.motion.map((m) => <video key={m} src={m} autoPlay muted loop playsInline className="aspect-square w-full rounded-md bg-[#08090A] object-cover" />)}
            </div>
            <Caption title="Motion" text="3D illustrations in motion." kit={kit} />
          </figure>
        )}
        {s.grid ? (
          <div className="grid gap-4 md:grid-cols-2">
            {s.slides.map((sl) => (
              <a key={sl.img} href={sl.img} target="_blank" rel="noreferrer" className="block aspect-[1600/1133] overflow-hidden rounded-md border border-line" style={{ background: sl.bg }}>
                <img src={sl.img} alt={sl.title || s.title} loading="lazy" className={`h-full w-full ${sl.fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
              </a>
            ))}
          </div>
        ) : s.slides.map((sl) => (
          <figure key={sl.img}>
            <a href={sl.img} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line">
              <img src={sl.img} alt={sl.title || s.title} loading="lazy" className="w-full" />
            </a>
            <Caption title={sl.title} text={sl.text} kit={kit} />
          </figure>
        ))}
      </div>

      <div className="grid grid-cols-2 border-t border-line">
        {prev ? <Link to={`/${info.slug}/guide/${prev.id}`} className="px-10 py-8 hover:bg-panel-2"><div className="text-[12px] text-muted">← Previous</div><div className="mt-1 text-[20px]" style={{ fontFamily: display(kit) }}>{prev.title}</div></Link> : <div />}
        {next ? <Link to={`/${info.slug}/guide/${next.id}`} className="border-l border-line px-10 py-8 text-right hover:bg-panel-2"><div className="text-[12px] text-muted">Next →</div><div className="mt-1 text-[20px]" style={{ fontFamily: display(kit) }}>{next.title}</div></Link> : <div />}
      </div>
      <Footer info={info} kit={kit} />
    </div>
  );
}

function Caption({ title, text, kit }: { title?: string; text?: string; kit: Kit }) {
  if (!title && !text) return null;
  return (
    <figcaption className="mt-4 grid gap-2 md:grid-cols-[260px_1fr]">
      <div className="text-[17px] tracking-[-0.01em]" style={{ fontFamily: display(kit) }}>{title}</div>
      {text && <p className="max-w-[720px] text-[14px] leading-relaxed text-muted">{text}</p>}
    </figcaption>
  );
}

/** Live blocks from the brand kit: copy a colour, see a typeface, grab the logos and icons. */
function KitBlock({ info, kit, kind }: { info: WsInfo; kit: Kit; kind: 'logos' | 'colours' | 'fonts' | 'icons' }) {
  const [copied, setCopied] = useState('');
  const copy = (t: string) => { navigator.clipboard.writeText(t).catch(() => {}); setCopied(t); setTimeout(() => setCopied(''), 1200); };
  const toAssets = (
    <Link to={`/${info.slug}/assets`} className="text-[13px] text-muted underline-offset-4 hover:text-text hover:underline">
      {kind === 'logos' ? 'Download every logo in SVG and PNG' : kind === 'colours' ? 'CSS variables and tokens' : kind === 'fonts' ? 'Embed code and CSS' : 'Download the icon set'} in Assets →
    </Link>
  );
  if (kind === 'colours') {
    return (
      <div className="space-y-6">
        {kit.colors.map((g) => (
          <div key={g.group}>
            <div className="mb-2 text-[12px] uppercase tracking-[.1em] text-muted">{g.group}</div>
            <div className={`grid gap-2 ${g.items.length > 4 ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
              {g.items.map((c) => (
                <button key={c.hex} onClick={() => copy(c.hex)} className="flex flex-col justify-start overflow-hidden rounded-md border border-line text-left">
                  <div className={`flex items-end p-4 text-[12px] ${g.items.length > 4 ? 'h-24' : 'h-40'}`} style={{ background: c.hex, color: isLight(c.hex) ? '#08090A' : '#FFFFFF' }}>
                    {copied === c.hex ? 'Copied' : ''}
                  </div>
                  <div className="space-y-0.5 p-3 text-[12px]">
                    <div className="text-[14px]" style={{ fontFamily: display(kit) }}>{c.name}</div>
                    <div className="num text-muted">{c.hex.toUpperCase()}{c.rgb ? `  RGB ${c.rgb}` : ''}</div>
                    {c.cmyk && <div className="num text-muted">CMYK {c.cmyk}{c.pantone ? `  PANTONE ${c.pantone}` : ''}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {toAssets}
      </div>
    );
  }
  if (kind === 'fonts') {
    return (
      <div className="space-y-6">
        {kit.fonts.map((f) => (
          <div key={f.family} className="rounded-md border border-line p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="text-[13px] text-muted">{f.family}{f.use ? `, ${f.use.toLowerCase()}` : ''}</div>
              {f.google !== false && <a href={`https://fonts.google.com/specimen/${f.family.replace(/ /g, '+')}`} target="_blank" rel="noreferrer" className="text-[12px] text-muted hover:text-text">Google Fonts ↗</a>}
            </div>
            <div className="mt-4 text-[clamp(48px,7vw,96px)] leading-none" style={{ fontFamily: `"${f.family}"` }}>Aa Bb Cc 0123</div>
            {(f.styles || []).map((st) => (
              <div key={st.name} className="mt-6 border-t border-line pt-4">
                <div className="mb-2 text-[11px] text-muted">{st.name}{st.tag ? ` (${st.tag})` : ''}, {st.weight}, line {Math.round(st.lh * 100)}%{st.ls ? `, tracking ${Math.round(st.ls * 100)}%` : ''}{st.upper ? ', uppercase' : ''}</div>
                <div style={{ fontFamily: `"${f.family}"`, fontWeight: st.weight, fontSize: Math.min(st.size, 56), lineHeight: st.lh, letterSpacing: `${st.ls}em`, textTransform: st.upper ? 'uppercase' : undefined }}>{st.sample}</div>
              </div>
            ))}
          </div>
        ))}
        {toAssets}
      </div>
    );
  }
  if (kind === 'icons') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2 md:grid-cols-6 xl:grid-cols-12">
          {kit.icons.map((i) => (
            <div key={i.id} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border border-line bg-[#f4f4f1]" title={i.name}>
              <img src={dataUri(iconSvg(i, '#08090A', 40))} alt={i.name} className="h-8 w-8" />
            </div>
          ))}
        </div>
        {toAssets}
      </div>
    );
  }
  // logos: each version transparent on light, transparent on dark, and on the brand colour
  return (
    <div className="space-y-4">
      {kit.logos.map((l) => (
        <div key={l.id} className="grid gap-2 md:grid-cols-3">
          {[l.variants.find((v) => !v.bg && !isLight(v.color)), l.variants.find((v) => !v.bg && isLight(v.color)), l.variants.find((v) => v.bg && sat(v.bg) > 80) || l.variants.find((v) => v.bg)].filter(Boolean).map((v) => (
            <div key={v!.file} className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-md border border-line" style={{ background: v!.bg || (isLight(v!.color) ? '#08090A' : '#F3F3EA') }}>
              <img src={dataUri(logoSvg(l, v!, 800).svg)} alt={v!.file} className={v!.bg ? 'h-full w-full object-contain' : l.w / l.h > 2 ? 'max-h-[34%] max-w-[72%]' : 'h-[58%]'} />
            </div>
          ))}
        </div>
      ))}
      {toAssets}
    </div>
  );
}

function Footer({ info, kit }: { info: WsInfo; kit: Kit }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-10 py-8 text-[12px] text-muted">
      <span>{kit.brand} brand guidelines</span>
      <Link to={`/${info.slug}/assets`} className="hover:text-text">Download the brand kit →</Link>
    </footer>
  );
}
