// Lenses = perceptual matrices over the market. AI proposes brand-relevant axes and places companies
// from their public messaging (hero, sub, claims, proof). Output is forced through a tool for clean JSON.
import type { Env } from './auth';
import { askForTool } from './ai';

export type Lens = {
  id: string;
  kind: 'matrix';
  title: string;
  why?: string;
  source: 'ai' | 'manual';
  axes: { x: { left: string; right: string }; y: { bottom: string; top: string } };
  positions: Record<string, { x: number; y: number; note?: string }>;
  created_at: number;
};

const LENS_ITEM = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short name, e.g. "Brand personality"' },
    why: { type: 'string', description: 'One sentence: what decision this matrix helps the brand make' },
    x_left: { type: 'string' }, x_right: { type: 'string' }, y_bottom: { type: 'string' }, y_top: { type: 'string' },
    positions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, note: { type: 'string', description: '6-12 words: evidence from their messaging' } },
        required: ['id', 'x', 'y'],
      },
    },
  },
  required: ['title', 'x_left', 'x_right', 'y_bottom', 'y_top', 'positions'],
};
const TOOL = { name: 'save_lenses', description: 'Return the matrices with every company placed.', input_schema: { type: 'object', properties: { lenses: { type: 'array', items: LENS_ITEM } }, required: ['lenses'] } };

function brief(data: any) {
  const one = (c: any, id: string) => ({
    id, name: c.name, calls_itself: c.category_label, hero: c.hero, sub: c.sub,
    claims: (c.claims || []).slice(0, 6), proof: (c.proof || []).slice(0, 4),
  });
  return JSON.stringify([one(data.client, '__client'), ...(data.companies || []).map((c: any) => one(c, c.id))]);
}

const clamp = (v: any) => Math.max(0, Math.min(100, Math.round(Number(v) || 50)));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'lens';

export async function aiLenses(
  env: Env, wsId: string, data: any,
  mode: { kind: 'suggest'; existing: string[] } | { kind: 'score'; title: string; axes: Lens['axes'] }
): Promise<Lens[]> {
  const client = data.client?.name || 'the client';
  const task = mode.kind === 'suggest'
    ? `Propose 3 perceptual matrices (two axes each) that help make BRANDING decisions for ${client}: brand perception, personality, tone of voice, promise and proof. Not business model or product architecture.
Classic branding axes for reference: Reliable ↔ Visionary, Technical ↔ Human, Enterprise-grade ↔ Developer-first, Serious ↔ Playful, Feature-led ↔ Outcome-led, Abstract promise ↔ Concrete proof, Established ↔ Challenger. Pick or adapt the ones that actually SEPARATE these companies (good spread, not everyone in one corner), and where an empty or crowded zone would matter for ${client}'s brand.
Avoid repeating these existing matrices: ${mode.existing.join('; ') || 'none'}.`
    : `Place every company on this matrix: "${mode.title}". X axis: 0 = ${mode.axes.x.left}, 100 = ${mode.axes.x.right}. Y axis: 0 = ${mode.axes.y.bottom}, 100 = ${mode.axes.y.top}. Return exactly one lens with these axis labels.`;
  const system = `You are a senior brand strategist at a branding agency. Score companies only from the public messaging given (hero line, sub-line, claims, proof). Do not invent facts. Use the full 0-100 range so differences are visible. Include every company id and the client id "__client". Write in English.`;
  const result: any = await askForTool(env, wsId, { system, prompt: `${task}\n\nCompanies (JSON):\n${brief(data)}`, tool: TOOL, max_tokens: 8000 });
  const raw = result.lenses || [];
  const ids = new Set(['__client', ...(data.companies || []).map((c: any) => c.id)]);
  const now = Date.now();
  return raw.map((l: any, i: number): Lens => ({
    id: `${slug(l.title)}_${now.toString(36)}${i}`,
    kind: 'matrix',
    title: mode.kind === 'score' ? mode.title : String(l.title),
    why: l.why,
    source: mode.kind === 'score' ? 'manual' : 'ai',
    axes: mode.kind === 'score' ? mode.axes : { x: { left: l.x_left, right: l.x_right }, y: { bottom: l.y_bottom, top: l.y_top } },
    positions: Object.fromEntries(
      (l.positions || []).filter((p: any) => ids.has(p.id)).map((p: any) => [p.id, { x: clamp(p.x), y: clamp(p.y), note: p.note }])
    ),
    created_at: now,
  }));
}
