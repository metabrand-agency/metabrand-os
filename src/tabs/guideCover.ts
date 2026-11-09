// Section covers of the online guide, drawn like the section dividers in the Figma guidelines:
// "Brand Guidelines", "Section 02", the section name large, the sign in a small badge.
// An SVG with the brand fonts embedded, so it works as a picture in the page and in the full-screen viewer.
import { useEffect, useMemo, useState } from 'react';
import type { GuideSection, Kit } from './BrandKit';
import { embeddedFonts } from './banners';
import { lookOf } from './deck';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function coverSvg(kit: Kit, guideTitle: string, s: GuideSection, fontCss = '') {
  const L = lookOf(kit);
  const sign = L.sign;
  const font = `'${L.head}', 'Helvetica Neue', Arial, sans-serif`;
  const label = guideTitle.replace(new RegExp(`^${kit.brand}\\s+`, 'i'), '') || 'Brand Guidelines';
  const title = s.title.length > 18 ? 92 : 106;
  const badge = sign
    ? `<rect x="60" y="976" width="31" height="31" rx="5" fill="${L.ink}"/><svg x="66" y="${976 + 31 / 2 - 9.5}" width="19" height="19" viewBox="0 0 ${sign.w} ${sign.h}" style="color:${L.mist}">${sign.svg.replaceAll('currentColor', L.mist)}</svg>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${fontCss ? `<style>${fontCss}</style>` : ''}
<rect width="1920" height="1080" fill="${L.mist}"/>
<g font-family="${font}" fill="${L.ink}">
<text x="60" y="73" font-size="17">${esc(label)}</text>
<text x="361" y="73" font-size="17">Section ${esc(s.num || '')}</text>
<text x="356" y="232" font-size="${title}" letter-spacing="${-0.02 * title}">${esc(s.title)}</text>
</g>${badge}</svg>`;
}

const url = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Cover pictures per section id; the first pass uses system type, then the brand fonts once they are embedded. */
export function useCovers(kit: Kit | null, guideTitle: string, sections: GuideSection[]) {
  const [css, setCss] = useState('');
  useEffect(() => {
    if (!kit?.fonts?.length) return;
    let live = true;
    const head = kit.fonts.find((f) => !/mono/i.test(f.family)) || kit.fonts[0];
    embeddedFonts([{ ...head, weights: [400] }]).then((c) => live && setCss(c)).catch(() => {});
    return () => { live = false; };
  }, [kit]);
  return useMemo(() => {
    const out: Record<string, string> = {};
    if (kit) for (const s of sections) out[s.id] = url(coverSvg(kit, guideTitle, s, css));
    return out;
  }, [kit, guideTitle, sections, css]);
}
