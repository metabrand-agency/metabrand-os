// Research one company for the competitor table: reads the homepage (if we have a URL) and uses
// Claude with web search for facts (founded, team size, last round, location, LinkedIn, founder).
import type { Env } from './auth';
import { askForTool } from './ai';

const FIELDS = {
  name: { type: 'string' },
  url: { type: 'string', description: 'Official website, https://…' },
  segment: { type: 'string', description: '2-5 words, what kind of product' },
  category_label: { type: 'string', description: 'How they name their own category on the site' },
  hero: { type: 'string', description: 'Homepage headline, verbatim' },
  sub: { type: 'string', description: 'Homepage sub-headline, verbatim' },
  claims: { type: 'array', items: { type: 'string' }, description: 'Up to 6 short positioning claims from the site' },
  proof: { type: 'array', items: { type: 'string' }, description: 'Up to 4 proof points: metrics, customer logos, awards' },
  founded: { type: 'number' },
  employees: { type: 'string', description: 'e.g. "51-200" or "~120"' },
  last_round: { type: 'string', description: 'e.g. "$40M Series B (Accel), Mar 2026"' },
  hq: { type: 'string', description: 'City, country' },
  linkedin: { type: 'string', description: 'Company LinkedIn URL' },
  founder: { type: 'string', description: 'Founder / CEO name' },
  founder_linkedin: { type: 'string', description: 'Founder LinkedIn URL' },
  open_source: { type: 'boolean' },
  x_url: { type: 'string', description: 'Official X / Twitter profile URL' },
  github_url: { type: 'string', description: 'Official GitHub organization URL' },
  youtube_url: { type: 'string', description: 'Official YouTube channel URL' },
  sources: { type: 'array', items: { type: 'string' }, description: 'URLs used' },
};
const SAVE = { name: 'save_company', description: 'Save what you found. Leave unknown fields out.', input_schema: { type: 'object', properties: FIELDS, required: ['name'] } };

const strip = (html: string) =>
  html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const meta = (html: string, key: string) =>
  html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ||
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, 'i'))?.[1];

export function normalizeUrl(q: string): string | null {
  const s = q.trim();
  if (!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) return null;
  return s.startsWith('http') ? s : `https://${s}`;
}

async function readHomepage(url: string) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MetabrandOS/1.0)', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 400_000);
    return {
      final_url: r.url,
      title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
      description: meta(html, 'description') || meta(html, 'og:description'),
      site_name: meta(html, 'og:site_name'),
      h1: strip(html.match(/<h1[\s\S]*?<\/h1>/i)?.[0] || ''),
      text: strip(html.match(/<body[\s\S]*<\/body>/i)?.[0] || html).slice(0, 8000),
    };
  } catch {
    return null;
  }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Apollo organization enrichment (1 Apollo credit per matched company). */
async function apollo(env: Env, url: string) {
  if (!env.APOLLO_API_KEY) return null;
  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
  try {
    const r = await fetch(`https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
      headers: { 'x-api-key': env.APOLLO_API_KEY, accept: 'application/json', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const o: any = ((await r.json()) as any)?.organization;
    if (!o?.name) return null;
    const ev = [...(o.funding_events || [])].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))[0];
    let last: string | undefined;
    if (ev) {
      const d = String(ev.date || '').slice(0, 7).split('-');
      const when = d.length === 2 ? `, ${MON[Number(d[1]) - 1]} ${d[0]}` : '';
      const inv = String(ev.investors || '').split(',').map((x: string) => x.trim()).filter(Boolean).slice(0, 2).join(', ');
      const type = /^Venture/.test(ev.type) ? 'Venture round' : ev.type;
      last = type === 'Merger / Acquisition' ? `Acquired${inv ? ` by ${inv}` : ''}${when}` : `${ev.amount ? `$${ev.amount} ` : ''}${type}${inv ? ` (${inv})` : ''}${when}`;
    }
    return {
      name: o.name,
      founded: o.founded_year || undefined,
      employees: o.estimated_num_employees ? String(o.estimated_num_employees) : undefined,
      hq: [o.city, o.country].filter(Boolean).join(', ') || undefined,
      linkedin: o.linkedin_url ? String(o.linkedin_url).replace(/^http:/, 'https:') : undefined,
      socials: {
        ...(o.twitter_url ? { x: String(o.twitter_url).replace(/^http:/, 'https:') } : {}),
        ...(o.facebook_url ? { facebook: String(o.facebook_url) } : {}),
      },
      last_round: last,
      data_sources: ['Apollo'],
    };
  } catch {
    return null;
  }
}

/** Ahrefs API v3 (uses the account's API units): DR, organic traffic, linking sites, brand searches. */
export async function ahrefs(env: Env, url: string | undefined, name: string) {
  if (!env.AHREFS_API_KEY || !url) return null;
  const h = { authorization: `Bearer ${env.AHREFS_API_KEY}`, accept: 'application/json', 'content-type': 'application/json' };
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const [site, kw] = await Promise.all([
      fetch('https://api.ahrefs.com/v3/batch-analysis/batch-analysis', {
        method: 'POST', headers: h, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ select: ['url', 'domain_rating', 'org_traffic', 'refdomains'], targets: [{ url: `https://${host}`, mode: 'subdomains', protocol: 'both' }] }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://api.ahrefs.com/v3/keywords-explorer/overview?select=keyword,volume,global_volume&country=us&keywords=${encodeURIComponent(name.toLowerCase())}`, { headers: h, signal: AbortSignal.timeout(15000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const t: any = (site as any)?.targets?.[0];
    const k: any = (kw as any)?.keywords?.[0];
    if (!t && !k) return null;
    return {
      dr: t?.domain_rating, traffic: t?.org_traffic, refdomains: t?.refdomains,
      ...(k ? { brand_query: k.keyword, brand_us: k.volume, brand_global: k.global_volume } : {}),
      as_of: new Date().toISOString().slice(0, 7),
    };
  } catch {
    return null;
  }
}

export async function researchCompany(env: Env, wsId: string, input: { query?: string; name?: string; url?: string }, clientName: string) {
  const url = input.url || (input.query ? normalizeUrl(input.query) : null);
  const page = url ? await readHomepage(url) : null;
  const ap = url ? await apollo(env, page?.final_url || url) : null;
  const ah = await ahrefs(env, page?.final_url || url || undefined, input.name || ap?.name || input.query || '');
  const fallback: any = {
    name: input.name || ap?.name || page?.site_name || page?.title?.split(/[|–—-]/)[0]?.trim() || input.query || 'Unknown',
    url: page?.final_url || url || undefined,
    hero: page?.h1 || undefined,
    sub: page?.description || undefined,
    sources: url ? [url] : [],
    ...Object.fromEntries(Object.entries(ap || {}).filter(([k, v]) => v != null && k !== 'name')),
    ...(ah ? { ahrefs: ah } : {}),
  };
  if (!env.ANTHROPIC_API_KEY) return fallback;

  const prompt = `Research this company as a competitor of ${clientName} for a branding agency's competitor table.
Company: ${input.name || input.query || url}${url ? ` (${url})` : ''}
${page ? `Homepage text (verbatim, truncated):\nTITLE: ${page.title}\nDESCRIPTION: ${page.description}\nH1: ${page.h1}\nTEXT: ${page.text}` : 'No homepage text: find the official website first.'}

Take hero, sub, claims and proof only from the homepage text when given.${ap ? ' Company facts (founded, team, round, HQ, company LinkedIn) are already known from Apollo; focus web search on the founder or CEO and their LinkedIn URL.' : ''} Use web search for facts: year founded, employee count, most recent funding round (amount, stage, lead investor, month and year), HQ city and country, company LinkedIn URL, founder or CEO full name and their LinkedIn URL, official X, GitHub and YouTube profiles.
Never guess. Leave a field out if you cannot confirm it. Then call save_company.`;

  const system = 'You are a precise research assistant. Facts must come from sources you saw. Write in English.';
  let c: any = {};
  try {
    c = await askForTool(env, wsId, { system, prompt, tool: SAVE, max_tokens: 3000, extraTools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] });
  } catch {
    return fallback;
  }
  const { x_url, github_url, youtube_url, ...rest } = c;
  const ai: any = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== '' && v != null));
  ai.socials = { ...(x_url ? { x: x_url } : {}), ...(github_url ? { github: github_url } : {}), ...(youtube_url ? { youtube: youtube_url } : {}), ...(ap?.socials || {}) };
  const apFacts = Object.fromEntries(Object.entries(ap || {}).filter(([k, v]) => v != null && k !== 'name' && k !== 'socials'));
  return {
    ...fallback, ...ai, ...apFacts, // company facts: Apollo first, then AI web research
    sources: [...new Set([...(fallback.sources || []), ...(c.sources || [])])],
    ...(ah ? { ahrefs: ah } : {}),
    data_sources: [...new Set([...(ap ? ['Apollo'] : []), 'AI web research', ...(ah ? ['Ahrefs'] : [])])],
  };
}
