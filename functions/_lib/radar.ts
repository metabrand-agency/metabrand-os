// Brand Radar data: recent publishing activity (RSS/Atom feeds or the sitemap), HQ coordinates,
// and fresh Ahrefs metrics when a key is set. Works for any project: client + competitors in focus.
import type { Env } from './auth';
import { ahrefs } from './companies';

type Post = { title: string; url: string; date?: string };
const UA = 'Mozilla/5.0 (compatible; MetabrandOS/1.0; +https://app.metabrand.digital)';

async function getText(url: string, ms = 7000): Promise<{ text: string; url: string; type: string } | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return { text: (await r.text()).slice(0, 1_500_000), url: r.url, type: r.headers.get('content-type') || '' };
  } catch {
    return null;
  }
}
const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1];
const isoDate = (s?: string) => { if (!s) return undefined; const d = new Date(decode(s)); return isNaN(+d) ? undefined : d.toISOString(); };

function parseFeed(xml: string): Post[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return items.map((it) => {
    const link = tag(it, 'link');
    const href = it.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1];
    return {
      title: decode(tag(it, 'title') || ''),
      url: decode(link && !/^\s*$/.test(link) ? link : href || ''),
      date: isoDate(tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated') || tag(it, 'dc:date')),
    };
  }).filter((p) => p.title && p.url);
}

const POSTY = /\/(blog|news|articles?|posts?|insights|resources\/blog|changelog|updates|stories)\/[^/?#]+/i;
const titleFromSlug = (u: string) => decodeURIComponent(u.replace(/\/$/, '').split('/').pop() || '').replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').replace(/^\w/, (c) => c.toUpperCase());

async function fromSitemap(origin: string): Promise<Post[]> {
  const root = await getText(`${origin}/sitemap.xml`);
  if (!root) return [];
  let xml = root.text;
  // sitemap index: open the child sitemaps that look like blog/posts (or the first two)
  if (/<sitemapindex/i.test(xml)) {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => decode(m[1]));
    const pick = [...locs.filter((l) => /blog|post|news|article/i.test(l)), ...locs].slice(0, 3);
    xml = (await Promise.all(pick.map((l) => getText(l)))).map((r) => r?.text || '').join('\n');
  }
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => ({ loc: decode(tag(m[1], 'loc') || ''), lastmod: isoDate(tag(m[1], 'lastmod')) }));
  return urls.filter((u) => POSTY.test(u.loc)).map((u) => ({ title: titleFromSlug(u.loc), url: u.loc, date: u.lastmod }));
}

export async function activityFor(url: string) {
  const home = await getText(url);
  const origin = new URL(home?.url || url).origin;
  const found = [...(home?.text || '').matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
    .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean).map((h) => new URL(h!, origin).toString());
  const candidates = [...new Set([...found, ...['/feed', '/rss.xml', '/feed.xml', '/blog/rss.xml', '/blog/feed', '/atom.xml', '/blog/rss', '/rss', '/index.xml', '/blog/index.xml'].map((p) => origin + p)])].slice(0, 8);
  let posts: Post[] = [];
  let source = '';
  for (const c of candidates) {
    const r = await getText(c, 5000);
    if (r && /<(rss|feed|rdf:RDF)[\s>]/i.test(r.text)) { posts = parseFeed(r.text); source = c; if (posts.length) break; }
  }
  if (!posts.length) {
    const host = new URL(origin).hostname.replace(/^www\./, '');
    posts = (await fromSitemap(origin)).filter((p) => { try { return new URL(p.url).hostname.endsWith(host); } catch { return false; } });
    source = posts.length ? `${origin}/sitemap.xml` : '';
  }
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const month = Date.now() - 30 * 864e5;
  return {
    source,
    posts_30d: posts.filter((p) => p.date && +new Date(p.date) >= month).length,
    latest: posts.slice(0, 5),
    checked_at: Date.now(),
  };
}

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'json', limit: '1' })}`, { headers: { 'user-agent': UA, 'accept-language': 'en' }, signal: AbortSignal.timeout(6000) });
    const j: any = r.ok ? await r.json() : [];
    return j?.[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  } catch {
    return null;
  }
}

function focusIds(data: any): string[] {
  const cs = data.companies || [];
  if (cs.some((c: any) => typeof c.selected === 'boolean')) return cs.filter((c: any) => c.selected).map((c: any) => c.id);
  return [...cs].sort((a: any, b: any) => Number(!!b.client_pick) - Number(!!a.client_pick) || (a.tier || 9) - (b.tier || 9)).slice(0, 5).map((c: any) => c.id);
}

/** Updates activity, geo and Ahrefs metrics for the client and competitors in focus. Returns new data. */
export async function refreshRadar(env: Env, data: any) {
  const ids = ['__client', ...focusIds(data)];
  const get = (id: string) => (id === '__client' ? data.client : data.companies.find((c: any) => c.id === id));
  const activity = { ...(data.activity || {}) };
  const patch: Record<string, any> = {};
  await Promise.all(ids.map(async (id) => {
    const c = get(id);
    if (!c?.url) return;
    const [act, ah] = await Promise.all([activityFor(c.url).catch(() => null), ahrefs(env, c.url, c.short || c.name)]);
    if (act) activity[id] = act;
    if (ah) patch[id] = { ...(patch[id] || {}), ahrefs: { ...(c.ahrefs || {}), ...ah } };
  }));
  // geocode HQs once (Nominatim asks for at most one request per second)
  for (const id of ids) {
    const c = get(id);
    const hq = c?.hq?.split('/')[0]?.trim();
    if (!hq || c.geo?.q === hq) continue;
    const g = await geocode(hq);
    if (g) patch[id] = { ...(patch[id] || {}), geo: { ...g, q: hq } };
    await new Promise((r) => setTimeout(r, 1100));
  }
  return {
    ...data,
    activity,
    client: patch.__client ? { ...data.client, ...patch.__client } : data.client,
    companies: data.companies.map((c: any) => (patch[c.id] ? { ...c, ...patch[c.id] } : c)),
  };
}
