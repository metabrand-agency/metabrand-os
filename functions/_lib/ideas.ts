// Article ideas for PR: what the press writes about the competitors (backlinks from articles, Ahrefs), what
// they publish themselves, and what is already written about the client, turned into pitches the client can
// own. Every idea points to the coverage that inspired it and to sites that already cover the category.
import type { Env } from './auth';
import { askForTool } from './ai';

const TOOL = {
  name: 'save_ideas',
  description: 'Return article ideas for the client.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Two sentences: what the press covers in this category right now, and where the client is missing' },
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Working headline of the article, specific, under 14 words' },
            format: { type: 'string', enum: ['guest post', 'listicle pitch', 'data study', 'case study', 'comparison', 'opinion', 'how-to', 'interview', 'launch story'] },
            angle: { type: 'string', description: '1 to 2 sentences: the argument, and why the client is the one to make it (use its positioning and proof)' },
            gap: { type: 'string', description: 'What competitors get covered for that the client does not, 5 to 15 words' },
            pitch_to: { type: 'array', items: { type: 'string' }, description: '2 to 4 sites from the coverage data that write about this topic (domains only)' },
            inspired_by: { type: 'array', items: { type: 'string' }, description: 'URLs of 1 to 3 articles from the data that inspired the idea' },
          },
          required: ['title', 'format', 'angle', 'pitch_to', 'inspired_by'],
        },
      },
    },
    required: ['ideas'],
  },
};

export function prContext(data: any) {
  const pick = (id: string) => {
    const c = id === '__client' ? data.client : (data.companies || []).find((x: any) => x.id === id);
    const a = data.activity?.[id] || {};
    return {
      name: c?.name, site: c?.url, calls_itself: c?.category_label, hero: c?.hero, claims: (c?.claims || []).slice(0, 5),
      press: (a.links?.latest || []).slice(0, 12).map((l: any) => ({ title: l.title, site: l.source, dr: l.dr, type: l.type, url: l.url })),
      own_posts: (a.latest || []).slice(0, 8).map((p: any) => p.title),
    };
  };
  const ids = Object.keys(data.activity || {}).filter((id) => id !== '__client');
  return { client: pick('__client'), competitors: ids.map(pick).filter((x) => x.name) };
}

export async function articleIdeas(env: Env, wsId: string, data: any, focus: string) {
  const ctx = prContext(data);
  const r: any = await askForTool(env, wsId, {
    system:
      'You are a B2B tech PR strategist. Ground every idea in the coverage data: which sites write about competitors and what for. ' +
      'Ideas must be things the client can credibly publish or pitch given its positioning; no invented facts, figures or customers. ' +
      'Prefer angles where the client can own a point of view the competitors do not. English.',
    prompt:
      `Client and competitors with their recent press coverage (backlinks from articles, Ahrefs) and own posts (JSON):\n${JSON.stringify(ctx)}\n\n` +
      (focus ? `Focus for these ideas: ${focus}\n\n` : '') +
      'Write 8 article ideas for the client: a mix of formats (guest posts, listicle pitches, data studies, comparisons, opinion pieces). For each, say which sites from the data to pitch and which articles inspired it.',
    tool: TOOL,
    max_tokens: 5000,
  });
  const urls = new Set([...ctx.competitors, ctx.client].flatMap((c: any) => c.press.map((p: any) => p.url)));
  return {
    summary: r.summary || '',
    focus: focus || undefined,
    ideas: (r.ideas || []).slice(0, 10).map((x: any) => ({
      title: String(x.title || '').trim(), format: x.format, angle: x.angle, gap: x.gap,
      pitch_to: (x.pitch_to || []).slice(0, 4).map((d: string) => String(d).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')),
      inspired_by: (x.inspired_by || []).filter((u: string) => urls.has(u)).slice(0, 3),
    })).filter((x: any) => x.title),
    generated_at: Date.now(),
  };
}
