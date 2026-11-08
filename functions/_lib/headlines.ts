// Post cover headlines: short options in the brand's own voice, grounded in what the client says about itself
// (site copy, claims, proof, recent posts). Numbers only when they come from the facts or the topic.
import type { Env } from './auth';
import { askForTool } from './ai';

const TOOL = {
  name: 'save_headlines',
  description: 'Return headline options for social post covers.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            headline: { type: 'string', description: 'The text on the cover, 2 to 9 words' },
            number: { type: 'string', description: 'Only for a stat cover: the figure alone, like $2.6M, 30%, 10x, 0.29.0. Must come from the facts or the topic' },
            label: { type: 'string', description: 'Optional kicker, 1 to 3 words, like RELEASE, CODING AGENTS, CASE STUDY' },
            angle: { type: 'string', enum: ['statement', 'stat', 'before-after', 'process', 'question', 'news'] },
          },
          required: ['headline', 'angle'],
        },
      },
    },
    required: ['items'],
  },
};

export async function suggestHeadlines(env: Env, wsId: string, brand: string, about: any, topic: string) {
  const r: any = await askForTool(env, wsId, {
    system:
      'You write short, confident headlines for a B2B brand\'s LinkedIn and social post covers. Match the brand\'s own voice from its site copy: plain words, concrete, specific to what the product does. ' +
      'No hashtags, no emojis, no exclamation marks, no clichés (game-changer, unlock, revolutionize, supercharge, next-level, seamless). ' +
      'Never invent figures, customers or dates. Write in the language of the topic; English when there is no topic.',
    prompt:
      `Brand: ${brand}\nWhat the brand says about itself (JSON):\n${JSON.stringify(about)}\n\n` +
      (topic ? `Post topic: ${topic}\n\n` : 'No topic given: write about the brand\'s core promise and proof points.\n\n') +
      'Write 8 options with different angles: two plain statements, a stat (headline plus the figure in number), a before → after (use the → character), ' +
      'a process of 3 to 5 short steps separated by →, a short question, and two news or release lines. Keep each headline under 9 words.',
    tool: TOOL,
    max_tokens: 2000,
  });
  return (r.items || [])
    .filter((x: any) => x?.headline)
    .slice(0, 10)
    .map((x: any) => ({ headline: String(x.headline).trim(), number: x.number ? String(x.number).trim() : undefined, label: x.label ? String(x.label).trim() : undefined, angle: x.angle }));
}
