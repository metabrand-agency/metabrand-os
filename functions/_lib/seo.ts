// SEO lens: top organic keywords per company and the content gap, from Ahrefs API v3 (uses the account's units).
import type { Env } from './auth';

const BASE = 'https://api.ahrefs.com/v3/site-explorer/organic-keywords';
type Kw = { keyword: string; position: number; traffic: number; volume: number; url?: string };

function focusIds(data: any): string[] {
  const cs = data.companies || [];
  if (cs.some((c: any) => typeof c.selected === 'boolean')) return cs.filter((c: any) => c.selected).map((c: any) => c.id);
  return [...cs].sort((a: any, b: any) => Number(!!b.client_pick) - Number(!!a.client_pick) || (a.tier || 9) - (b.tier || 9)).slice(0, 5).map((c: any) => c.id);
}
const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, '');
const ownWord = (name: string) => name.toLowerCase().replace(/\(.*\)/, '').trim().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');

async function query(env: Env, host: string, country: string, where: any | null, limit: number): Promise<Kw[]> {
  const q = new URLSearchParams({
    target: host, mode: 'subdomains', country: country.toLowerCase(), date: new Date().toISOString().slice(0, 10),
    select: 'keyword,best_position,sum_traffic,volume,best_position_url', order_by: 'sum_traffic:desc', limit: String(limit),
  });
  // organic positions only: AI Overview citations, sitelinks etc. would show as #1
  const main = { field: 'is_main_position', is: ['eq', true] };
  q.set('where', JSON.stringify(where ? { and: [main, where] } : main));
  const r = await fetch(`${BASE}?${q}`, { headers: { authorization: `Bearer ${env.AHREFS_API_KEY}`, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Ahrefs ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j: any = await r.json();
  return (j.keywords || []).map((k: any) => ({ keyword: k.keyword, position: k.best_position, traffic: k.sum_traffic || 0, volume: k.volume || 0, url: k.best_position_url || undefined }));
}

export async function loadSeo(env: Env, data: any, country: string) {
  if (!env.AHREFS_API_KEY) throw new Error('Ahrefs is not connected: add AHREFS_API_KEY');
  const ids = ['__client', ...focusIds(data)];
  const byId = (id: string) => (id === '__client' ? data.client : data.companies.find((c: any) => c.id === id));
  const targets = ids.map((id) => ({ id, c: byId(id) })).filter((t) => t.c?.url);

  const top: Record<string, { all: Kw[]; content: Kw[] }> = {};
  await Promise.all(targets.map(async ({ id, c }) => {
    const host = hostOf(c.url);
    const notHome = [`https://${host}/`, `https://www.${host}/`, `http://${host}/`, `http://www.${host}/`].map((u) => ({ not: { field: 'best_position_url', is: ['eq', u] } }));
    const own = ownWord(c.short || c.name);
    const content = { and: [...notHome, ...(own.length > 2 ? [{ not: { field: 'keyword', is: ['isubstring', own] } }] : [])] };
    const [all, cont] = await Promise.all([query(env, host, country, null, 5), query(env, host, country, content, 5)]);
    top[id] = { all, content: cont };
  }));

  // content gap: every competitor's content keywords, checked against every company in the set
  const vol: Record<string, number> = {};
  for (const t of Object.values(top)) for (const k of t.content) vol[k.keyword] = Math.max(vol[k.keyword] || 0, k.volume);
  const union = Object.keys(vol);
  const positions: Record<string, Record<string, { position: number; traffic: number }>> = {};
  if (union.length) {
    const where = { or: union.map((kw) => ({ field: 'keyword', is: ['eq', kw] })) };
    await Promise.all(targets.map(async ({ id, c }) => {
      for (const k of await query(env, hostOf(c.url), country, where, 100)) {
        (positions[k.keyword] ||= {})[id] = { position: k.position, traffic: k.traffic };
        vol[k.keyword] = Math.max(vol[k.keyword] || 0, k.volume);
      }
    }));
  }
  // volume and keyword difficulty from Keywords Explorer
  const kd: Record<string, number> = {};
  if (union.length) {
    const r = await fetch(`https://api.ahrefs.com/v3/keywords-explorer/overview?${new URLSearchParams({ select: 'keyword,volume,difficulty', country: country.toLowerCase(), keywords: union.join(',') })}`, {
      headers: { authorization: `Bearer ${env.AHREFS_API_KEY}`, accept: 'application/json' }, signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    const j: any = r && r.ok ? await r.json() : null;
    for (const k of j?.keywords || []) { if (k.difficulty != null) kd[k.keyword] = k.difficulty; if (k.volume != null) vol[k.keyword] = k.volume; }
  }
  return {
    as_of: new Date().toISOString().slice(0, 7),
    positions: 'organic',
    ids: targets.map((t) => t.id),
    top,
    gap: { keywords: union.map((keyword) => ({ keyword, volume: vol[keyword], ...(kd[keyword] != null ? { kd: kd[keyword] } : {}) })).sort((a, b) => b.volume - a.volume), positions, checked: targets.map((t) => t.id) },
    source: 'Ahrefs',
  };
}
