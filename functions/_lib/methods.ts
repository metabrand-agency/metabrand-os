// Methodology lenses: the same market seen through the frameworks big brand agencies use (BAV, Dunford,
// Blue Ocean, JTBD, Ehrenberg-Bass entry points, archetypes, Kapferer, Aaker...). One AI call per method
// scores the client and the competitors in focus from their public messaging and facts. Any project.
import type { Env } from './auth';
import { askForTool } from './ai';

type Kind = 'scatter' | 'grid' | 'profile' | 'labels' | 'archetype';
type Method = { title: string; source: string; kind: Kind; task: string; scale?: [number, number]; fixedItems?: string[]; fields?: { key: string; label: string }[]; axes?: { x: [string, string]; y: [string, string] } };

export const ARCHETYPES = ['Innocent', 'Everyman', 'Hero', 'Outlaw', 'Explorer', 'Creator', 'Ruler', 'Magician', 'Lover', 'Caregiver', 'Jester', 'Sage'];

export const METHODS: Record<string, Method> = {
  bav: {
    title: 'Differentiation × Relevance', source: 'BrandAsset Valuator (Landor, WPP)', kind: 'scatter',
    axes: { x: ['Less relevant to buyers', 'Highly relevant'], y: ['Undifferentiated', 'Highly differentiated'] },
    task: 'Score each company on RELEVANCE (x: how closely its promise matches what buyers in this category need right now) and DIFFERENTIATION (y: how clearly its brand stands apart from the others in this set). 0 to 100, use the full range.',
  },
  vision_execution: {
    title: 'Vision × Execution', source: 'Analyst-style market quadrant', kind: 'scatter',
    axes: { x: ['Narrow vision', 'Category-defining vision'], y: ['Early execution', 'Proven execution'] },
    task: 'Score VISION (x: ambition and clarity of where they take the category, from their messaging) and EXECUTION (y: proof they deliver: customers named, funding, team size, traffic, product maturity, from the facts given). 0 to 100, use the full range.',
  },
  dunford: {
    title: 'Positioning canvas', source: 'April Dunford, Obviously Awesome', kind: 'profile',
    fields: [
      { key: 'alternatives', label: 'Competitive alternatives' }, { key: 'unique', label: 'Unique attributes' },
      { key: 'value', label: 'Value they enable' }, { key: 'customers', label: 'Best-fit customers' },
      { key: 'category', label: 'Market category' }, { key: 'trend', label: 'Trend they ride' },
    ],
    task: 'Fill the five components of positioning (plus the relevant trend) for each company as its public messaging presents it. Each cell 4 to 14 words, concrete, no marketing adjectives.',
  },
  blue_ocean: {
    title: 'Strategy canvas', source: 'Blue Ocean Strategy (Kim & Mauborgne)', kind: 'grid', scale: [1, 5],
    task: 'Choose 7 factors this category competes on (what buyers compare: e.g. price, autonomy, integrations, security, ease of setup, enterprise readiness, openness). Score how much each company offers or emphasises each factor, 1 (low) to 5 (high).',
  },
  category: {
    title: 'Category claims', source: 'Category Design (Play Bigger)', kind: 'labels',
    task: 'For each company give the market category it claims for itself, as a short noun phrase close to its own words (e.g. "AI software factory", "coding agent"), and its type: "existing" (an established category), "reframed" (an existing category with a new twist) or "new" (a category it coins).',
  },
  jtbd: {
    title: 'Jobs to be done', source: 'Jobs to be Done (Christensen, Ulwick)', kind: 'grid', scale: [0, 2],
    task: 'List 7 jobs buyers hire products in this category for (verb-led, e.g. "Ship routine fixes without engineers"). Mark each company: 0 = not addressed, 1 = mentioned, 2 = a core part of its message.',
  },
  cep: {
    title: 'Category entry points', source: 'Ehrenberg-Bass Institute', kind: 'grid', scale: [0, 2],
    task: 'List 7 category entry points: buying situations or triggers that make someone start looking for a product like this (e.g. "Backlog keeps growing after a hiring freeze"). Mark each company: 0 = not linked, 1 = touched on, 2 = clearly owns this situation in its messaging.',
  },
  archetypes: {
    title: 'Brand archetypes', source: 'Mark & Pearson, The Hero and the Outlaw', kind: 'archetype',
    task: `Assign each company a primary and a secondary archetype from exactly this list: ${ARCHETYPES.join(', ')}. Base it on tone, promise and imagery described in its messaging.`,
  },
  kapferer: {
    title: 'Identity prism', source: 'Jean-Noël Kapferer', kind: 'profile',
    fields: [
      { key: 'physique', label: 'Physique' }, { key: 'personality', label: 'Personality' }, { key: 'culture', label: 'Culture' },
      { key: 'relationship', label: 'Relationship' }, { key: 'reflection', label: 'Reflection (who it seems to be for)' }, { key: 'self_image', label: 'Self-image (how the buyer feels)' },
    ],
    task: 'Fill the six facets of the brand identity prism for each company, as its public brand presents them. Each cell 3 to 12 words.',
  },
  aaker: {
    title: 'Brand personality', source: 'Jennifer Aaker', kind: 'grid', scale: [1, 5],
    fixedItems: ['Sincerity', 'Excitement', 'Competence', 'Sophistication', 'Ruggedness'],
    task: 'Score each company on the five dimensions of brand personality, 1 (low) to 5 (high), from its tone and messaging.',
  },
};

/** What we know about each company: positioning from its site plus market facts. */
function dossier(data: any, ids: string[]) {
  const byId = (id: string) => (id === '__client' ? data.client : data.companies.find((c: any) => c.id === id));
  return JSON.stringify(ids.map((id) => {
    const c = byId(id) || {};
    return {
      id, name: c.name, site: c.url, calls_itself: c.category_label, segment: c.segment, hero: c.hero, sub: c.sub,
      claims: (c.claims || []).slice(0, 6), proof: (c.proof || []).slice(0, 4),
      founded: c.founded, team: c.employees, funding: c.last_round || c.funding, hq: c.hq,
      search_traffic: c.ahrefs?.traffic, brand_searches: c.ahrefs?.brand_global, domain_rating: c.ahrefs?.dr,
    };
  }));
}

const NOTE = { type: 'string', description: '5 to 12 words of evidence from their messaging or facts' };
function toolFor(m: Method) {
  const company = (props: any, req: string[]) => ({ type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, ...props }, required: ['id', ...req] } });
  let schema: any;
  if (m.kind === 'scatter') schema = { companies: company({ x: { type: 'number' }, y: { type: 'number' }, note: NOTE }, ['x', 'y']) };
  if (m.kind === 'profile') schema = { companies: company(Object.fromEntries(m.fields!.map((f) => [f.key, { type: 'string' }])), m.fields!.map((f) => f.key)) };
  if (m.kind === 'labels') schema = { companies: company({ label: { type: 'string' }, type: { type: 'string', enum: ['existing', 'reframed', 'new'] }, note: NOTE }, ['label', 'type']) };
  if (m.kind === 'archetype') schema = { companies: company({ primary: { type: 'string', enum: ARCHETYPES }, secondary: { type: 'string', enum: ARCHETYPES }, note: NOTE }, ['primary']) };
  if (m.kind === 'grid') schema = {
    items: { type: 'array', items: { type: 'string' }, description: m.fixedItems ? `Exactly: ${m.fixedItems.join(', ')}` : 'The rows, 5 to 12 words each' },
    companies: company({ scores: { type: 'array', items: { type: 'number' }, description: 'One score per item, same order' }, note: NOTE }, ['scores']),
  };
  return { name: 'save_method', description: 'Return the assessment for every company.', input_schema: { type: 'object', properties: schema, required: Object.keys(schema) } };
}

const clamp = (v: any, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v))));

export async function runMethod(env: Env, wsId: string, data: any, key: string, ids: string[]) {
  const m = METHODS[key];
  if (!m) throw new Error('Unknown method');
  const client = data.client?.name || 'the client';
  const system = `You are a senior brand strategist applying "${m.source}" to a market. Judge only from the public positioning and facts given; do not invent customers, numbers or claims. Be specific to these companies, not generic. Include every company id, including the client "__client" (${client}). Write in English.`;
  const res: any = await askForTool(env, wsId, { system, prompt: `${m.task}\n\nCompanies (JSON):\n${dossier(data, ids)}`, tool: toolFor(m), max_tokens: 6000 });
  const rows: any[] = (res.companies || []).filter((r: any) => ids.includes(r.id));
  const base = { key, kind: m.kind, title: m.title, source: m.source, axes: m.axes, fields: m.fields, generated_at: Date.now(), ids };
  if (m.kind === 'scatter') return { ...base, points: Object.fromEntries(rows.map((r) => [r.id, { x: clamp(r.x, 0, 100), y: clamp(r.y, 0, 100), note: r.note }])) };
  if (m.kind === 'profile') return { ...base, rows: Object.fromEntries(rows.map((r) => [r.id, Object.fromEntries(m.fields!.map((f) => [f.key, String(r[f.key] || '')]))])) };
  if (m.kind === 'labels') return { ...base, values: Object.fromEntries(rows.map((r) => [r.id, { label: String(r.label || ''), type: r.type, note: r.note }])) };
  if (m.kind === 'archetype') return { ...base, values: Object.fromEntries(rows.map((r) => [r.id, { primary: r.primary, secondary: r.secondary !== r.primary ? r.secondary : undefined, note: r.note }])) };
  const items: string[] = (m.fixedItems || res.items || []).slice(0, 10).map(String);
  const [lo, hi] = m.scale!;
  return { ...base, items, scale: m.scale, values: Object.fromEntries(rows.map((r) => [r.id, { scores: items.map((_, i) => clamp(r.scores?.[i] ?? lo, lo, hi)), note: r.note }])) };
}
