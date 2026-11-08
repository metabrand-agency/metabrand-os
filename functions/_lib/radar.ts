// Brand Visibility and PR Monitor data: recent publishing activity (RSS/Atom feeds, or the sitemap plus the
// articles' own publish dates), Google News mentions, HQ coordinates, fresh Ahrefs metrics. Any project.
import type { Env } from './auth';
import { ahrefs } from './companies';

type Post = { title: string; url: string; date?: string };
// Many sites refuse bot-looking requests; a regular browser UA gets the public HTML/RSS.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GEO_UA = 'MetabrandOS/1.0 (+https://app.metabrand.digital)';

export async function getText(url: string, ms = 7000): Promise<{ text: string; url: string; type: string } | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return { text: (await r.text()).slice(0, 1_500_000), url: r.url, type: r.headers.get('content-type') || '' };
  } catch {
    return null;
  }
}
/** Reads a page only up to </head> (or 200 KB): enough for title and publish-date meta tags. */
async function getHead(url: string, ms = 6000): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!r.ok || !r.body) return null;
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let html = '';
    while (html.length < 200_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html.slice(-70_000))) break;
    }
    reader.cancel().catch(() => {});
    return html;
  } catch {
    return null;
  }
}
export const metaOf = (html: string, key: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1] ||
  html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${key}["']`, 'i'))?.[1];
/** The page's preview image (og:image or twitter:image), absolute, or null. */
export async function ogImage(url: string): Promise<string | null> {
  const h = await getHead(url, 5000);
  if (!h) return null;
  const raw = metaOf(h, 'og:image:secure_url') || metaOf(h, 'og:image') || metaOf(h, 'twitter:image') || metaOf(h, 'twitter:image:src');
  if (!raw) return null;
  try { const u = new URL(decode(raw), url); return /^https?:$/.test(u.protocol) ? u.toString() : null; } catch { return null; }
}

async function articleInfo(url: string): Promise<{ title?: string; date?: string } | null> {
  const h = await getHead(url);
  if (!h) return null;
  const date = metaOf(h, 'article:published_time') || h.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] || metaOf(h, 'date') || metaOf(h, 'datePublished') || h.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1];
  const title = metaOf(h, 'og:title') || h.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return { title: title ? decode(title).replace(/\s+[|–—-]\s+[^|–—-]+$/, '') : undefined, date: isoDate(date) };
}

export const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/\s+/g, ' ').trim();
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
const NOT_POST = /\/(category|categories|tag|tags|topic|topics|author|authors|page)(\/|$)/i;
const titleFromSlug = (u: string) => decodeURIComponent(u.replace(/\/$/, '').split('/').pop() || '').replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').replace(/^\w/, (c) => c.toUpperCase());

export const ACTIVITY_V = 3; // bump when collection changes, so pages re-collect on their next visit
const CHECK = 8; // article pages opened per company (each is one outbound request)

async function fromSitemap(origin: string): Promise<Post[]> {
  const robots = await getText(`${origin}/robots.txt`, 4000);
  const listed = [...(robots?.text || '').matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  let root = null;
  for (const u of [...listed, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`].slice(0, 3)) { root = await getText(u); if (root && /<(urlset|sitemapindex)/i.test(root.text)) break; root = null; }
  if (!root) return [];
  let xml = root.text;
  // sitemap index: open the child sitemaps that look like blog/posts (or the first two)
  if (/<sitemapindex/i.test(xml)) {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => decode(m[1]));
    const pick = [...new Set([...locs.filter((l) => /blog|post|news|article|changelog/i.test(l)), ...locs])].slice(0, 2);
    xml = (await Promise.all(pick.map((l) => getText(l)))).map((r) => r?.text || '').join('\n');
  }
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => ({ loc: decode(tag(m[1], 'loc') || ''), lastmod: isoDate(tag(m[1], 'lastmod')) }));
  return urls.filter((u) => POSTY.test(u.loc) && !NOT_POST.test(new URL(u.loc, origin).pathname)).map((u) => ({ title: titleFromSlug(u.loc), url: u.loc, date: u.lastmod }));
}

/** Post links in page order from /blog or /news (newest first on most sites). */
async function fromIndexPages(origin: string): Promise<Post[]> {
  for (const path of ['/blog', '/news']) {
    const page = await getText(origin + path);
    if (!page) continue;
    const base = new URL(page.url).origin;
    const urls = [...new Set([...page.text.matchAll(/href=["']([^"'#?]+)["']/gi)].map((m) => { try { return new URL(m[1], base).toString(); } catch { return ''; } }))]
      .filter((u) => u && POSTY.test(u) && !NOT_POST.test(new URL(u).pathname));
    if (urls.length) return urls.map((u) => ({ url: u, title: titleFromSlug(u) }));
  }
  return [];
}

/** Sitemap lastmod is often the deploy time for every page. True when one day covers most entries. */
function bulkStamped(posts: Post[]) {
  const days = posts.map((p) => p.date?.slice(0, 10)).filter(Boolean) as string[];
  if (days.length < 6) return !days.length;
  const n: Record<string, number> = {};
  for (const d of days) n[d] = (n[d] || 0) + 1;
  return Math.max(...Object.values(n)) / days.length >= 0.35;
}

/** Newest-first order for sitemap posts: by lastmod when it is trustworthy, else the order on the blog's index page. */
async function orderPosts(origin: string, posts: Post[]): Promise<Post[]> {
  if (!bulkStamped(posts)) return [...posts].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const seg: Record<string, number> = {};
  for (const p of posts) { const s = new URL(p.url).pathname.split('/')[1]; seg[s] = (seg[s] || 0) + 1; }
  const section = Object.entries(seg).sort((a, b) => b[1] - a[1])[0]?.[0];
  const page = section ? await getText(`${origin}/${section}`) : null;
  const byPath = new Map(posts.map((p) => [new URL(p.url).pathname.replace(/\/$/, ''), p]));
  const seen = new Set<Post>();
  for (const m of (page?.text || '').matchAll(/href=["']([^"'#?]+)["']/gi)) {
    try { const p = byPath.get(new URL(m[1], origin).pathname.replace(/\/$/, '')); if (p) seen.add(p); } catch { /* skip */ }
  }
  return [...seen, ...posts.filter((p) => !seen.has(p))];
}

export async function activityFor(url: string) {
  const home = await getText(url);
  const origin = new URL(home?.url || url).origin;
  const found = [...(home?.text || '').matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
    .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean).map((h) => new URL(h!, origin).toString());
  const candidates = [...new Set([...found, ...['/rss.xml', '/feed', '/blog/rss.xml', '/feed.xml', '/blog/feed', '/atom.xml'].map((p) => origin + p)])].slice(0, 6);
  let posts: Post[] = [];
  let source = '';
  for (const c of candidates) {
    const r = await getText(c, 5000);
    if (r && /<(rss|feed|rdf:RDF)[\s>]/i.test(r.text)) { posts = parseFeed(r.text); source = c; if (posts.length) break; }
  }
  let capped = posts.length >= 10; // a feed only carries its newest items
  if (!posts.length) {
    const host = new URL(origin).hostname.replace(/^www\./, '');
    const sameHost = (p: Post) => { try { return new URL(p.url).hostname.endsWith(host); } catch { return false; } };
    let all = (await fromSitemap(origin)).filter(sameHost);
    let from = `${origin}/sitemap.xml`;
    if (!all.length) { all = (await fromIndexPages(origin)).filter(sameHost); from = `${origin}/blog`; } // no sitemap: read the blog page itself
    // check the newest candidates' own pages for the real publish date and title
    const top = (await orderPosts(origin, all)).slice(0, CHECK);
    const infos = await Promise.all(top.map((p) => articleInfo(p.url).catch(() => null)));
    posts = top.map((p, i) => ({ url: p.url, title: infos[i]?.title || p.title, date: infos[i]?.date })).filter((p) => p.date);
    source = posts.length ? from : '';
    capped = all.length > CHECK;
  }
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const month = Date.now() - 30 * 864e5;
  const recent = posts.filter((p) => p.date && +new Date(p.date) >= month).length;
  return {
    v: ACTIVITY_V,
    source,
    posts_30d: recent,
    // every checked article is recent and there are more: the real number is higher
    posts_30d_more: capped && recent >= posts.length && recent > 0,
    latest: posts.slice(0, 8),
    checked_at: Date.now(),
  };
}

export async function newsFor(query: string) {
  const r = await getText(`https://news.google.com/rss/search?${new URLSearchParams({ q: `${query} when:30d`, hl: 'en-US', gl: 'US', ceid: 'US:en' })}`, 7000);
  if (!r || !/<rss/i.test(r.text)) return null;
  const items = (r.text.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map((it) => {
    const source = decode(tag(it, 'source') || '');
    const title = decode(tag(it, 'title') || '');
    const site = it.match(/<source[^>]+url=["']([^"']+)["']/i)?.[1];
    return {
      title: source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title, // Google adds " - Source"
      url: decode(tag(it, 'link') || ''),
      date: isoDate(tag(it, 'pubDate')),
      source: source.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      site: site ? site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') : undefined,
    };
  }).filter((x) => x.title && x.url);
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { query, count_30d: items.length, latest: items.slice(0, 10), checked_at: Date.now() };
}

/** City → coordinates. Open-Meteo geocoding first (free, no key), OpenStreetMap Nominatim as fallback. */
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  const [city, ...rest] = q.split(',').map((x) => x.trim());
  const country = rest.pop()?.toLowerCase();
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: '5', language: 'en', format: 'json' })}`, { signal: AbortSignal.timeout(6000) });
    const j: any = r.ok ? await r.json() : null;
    const hit = (j?.results || []).find((x: any) => !country || String(x.country || '').toLowerCase() === country || (country === 'united states' && x.country_code === 'US')) || j?.results?.[0];
    if (hit) return { lat: hit.latitude, lng: hit.longitude };
  } catch { /* try the fallback */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'json', limit: '1' })}`, { headers: { 'user-agent': GEO_UA, 'accept-language': 'en' }, signal: AbortSignal.timeout(6000) });
    const j: any = r.ok ? await r.json() : [];
    return j?.[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  } catch {
    return null;
  }
}

export function focusIds(data: any): string[] {
  const cs = data.companies || [];
  if (cs.some((c: any) => typeof c.selected === 'boolean')) return cs.filter((c: any) => c.selected).map((c: any) => c.id);
  return [...cs].sort((a: any, b: any) => Number(!!b.client_pick) - Number(!!a.client_pick) || (a.tier || 9) - (b.tier || 9)).slice(0, 5).map((c: any) => c.id);
}

/**
 * Google News query. Distinctive names ("SuperPlane", "HumanLayer") as they are. Common words ("Factory", "Warp")
 * are paired with the founder's surname, which is precise; otherwise the Ahrefs brand query or a context filter.
 * A query set by hand on the company (news_query) always wins.
 */
export function newsQuery(c: any) {
  if (c.news_query?.trim()) return String(c.news_query).trim();
  const name = String(c.name || c.short || '').replace(/\s*\(.*\)/, '').replace(/"/g, '').trim();
  const CONTEXT = '(AI OR software OR developer OR startup OR agent OR agents OR "open source")';
  if (name.split(/\s+/).length > 1) return `"${name}"`;
  // one-word names, even coined ones, collide with other things ("SuperPlane" aircraft): add a tech context
  if (/[a-z][A-Z]|\d|\./.test(name)) return `"${name}" AND ${CONTEXT}`;
  const surname = String(c.founder || '').split(/[,;&]| and /)[0].trim().split(/\s+/).pop()?.replace(/"/g, '');
  if (surname && surname.length > 2) return `"${name}" "${surname}"`;
  const bq = String(c.ahrefs?.brand_query || '').replace(/"/g, '').trim();
  if (bq.split(/\s+/).length > 1) return `"${bq}"`;
  return `"${name}" AND ${CONTEXT}`;
}

/**
 * New links from articles in the last 30 days (Ahrefs): listicles, news, stories, opinion pieces.
 * Docs, tutorials, repos and link farms are dropped. About 8 Ahrefs units per row, so at most 20 rows.
 */
export async function newLinksFor(env: Env, url: string) {
  if (!env.AHREFS_API_KEY) return null;
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const where = { and: [
    { field: 'first_seen_link', is: ['gte', since] },
    { field: 'is_content', is: ['eq', true] },
    { field: 'is_spam', is: ['eq', false] },
    { field: 'page_type_source', is: ['substring', 'Article'] },
    { not: { field: 'page_type_source', is: ['substring', 'Tutorial'] } },
    { not: { field: 'page_type_source', is: ['substring', 'How_to'] } },
  ] };
  const q = new URLSearchParams({
    target: host, mode: 'subdomains', history: 'live', aggregation: '1_per_domain', limit: '20', order_by: 'domain_rating_source:desc',
    select: 'url_from,title,name_source,domain_rating_source,first_seen_link,source_page_publish_date,page_type_source',
    where: JSON.stringify(where),
  });
  const r = await fetch(`https://api.ahrefs.com/v3/site-explorer/all-backlinks?${q}`, { headers: { authorization: `Bearer ${env.AHREFS_API_KEY}`, accept: 'application/json' }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r?.ok) return null;
  const j: any = await r.json().catch(() => null);
  const root = host.split('.').slice(-2).join('.');
  const rows = (j?.backlinks || []).filter((b: any) => {
    const src = String(b.name_source || '').replace(/^www\./, '');
    return b.title && b.url_from && !src.endsWith(root)
      && !/^\d+\.|\.xyz$|^github\.com$|pbn/i.test(src) // link farms and code repos
      && String(b.title).length < 220;
  });
  const type = (t?: string) => (t || '').split(',')[0].split('/').pop()?.replace(/_/g, ' ') || 'Article';
  const latest = rows.map((b: any) => ({
    title: decode(String(b.title)).replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, ''),
    url: b.url_from,
    date: b.first_seen_link,
    published: b.source_page_publish_date || undefined,
    source: String(b.name_source).replace(/^www\./, ''),
    dr: b.domain_rating_source != null ? Math.round(b.domain_rating_source) : undefined,
    type: type(b.page_type_source),
  }));
  return { count_30d: latest.length, capped: (j?.backlinks || []).length >= 20, latest, checked_at: Date.now() };
}

/** Refreshes one company (one request per company keeps us within the platform's outbound request limit). */
export async function refreshOne(env: Env, c: any, prev?: any, forceLinks = false) {
  const hq = c?.hq?.split('/')[0]?.trim();
  // Ahrefs links cost units: reuse them for a week unless someone asks for an update
  const linksFresh = !forceLinks && prev?.links && Date.now() - prev.links.checked_at < 7 * 864e5;
  const [act, news, ah, geo, links] = await Promise.all([
    c.url ? activityFor(c.url).catch(() => null) : null,
    newsFor(newsQuery(c)).catch(() => null),
    c.url ? ahrefs(env, c.url, c.short || c.name) : null,
    hq && c.geo?.q !== hq ? geocode(hq) : null,
    linksFresh ? prev.links : c.url ? newLinksFor(env, c.url).catch(() => null) : null,
  ]);
  const extra = { news, links: links || prev?.links || null };
  return {
    activity: act ? { ...act, ...extra } : news || links ? { v: ACTIVITY_V, source: '', posts_30d: 0, latest: [], checked_at: Date.now(), ...extra } : null,
    ahrefs: ah ? { ...(c.ahrefs || {}), ...ah } : undefined,
    geo: geo ? { ...geo, q: hq } : undefined,
  };
}
