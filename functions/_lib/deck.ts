// Pitch deck from content: Claude lays a brief, notes or an old deck out on the brand's deck templates.
import type { Env } from './auth';
import { askForTool } from './ai';

const LAYOUTS = ['cover', 'text', 'image', 'cards', 'steps', 'contacts'];
const TOOL = {
  name: 'build_deck',
  description: 'The pitch deck, slide by slide, in the template layouts.',
  input_schema: {
    type: 'object',
    properties: {
      footer: { type: 'string', description: 'Short line in every slide footer: what the company is, 2 to 4 words (e.g. "AI software factory").' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            layout: { type: 'string', enum: LAYOUTS },
            kicker: { type: 'string', description: 'Section label, 1 to 3 words: Problem, Solution, Product, Market, Traction, Business model, Team, Competition, Roadmap, The ask…' },
            title: { type: 'string', description: 'The headline, a full thought in up to 12 words. Use \\n for a deliberate line break. On the cover, the second line may start with "→ ".' },
            text: { type: 'string', description: 'For text, image and steps layouts: up to 45 words.' },
            cards: { type: 'array', description: 'cards layout: exactly 3.', items: { type: 'object', properties: { title: { type: 'string', description: 'Up to 4 words.' }, text: { type: 'string', description: '1 to 3 short lines separated by \\n, or one sentence up to 22 words.' } }, required: ['title', 'text'] } },
            steps: { type: 'array', description: 'steps layout: exactly 3.', items: { type: 'object', properties: { title: { type: 'string', description: 'One or two words.' }, text: { type: 'string', description: '2 to 4 short lines separated by \\n.' } }, required: ['title', 'text'] } },
            stat: { type: 'object', description: 'steps layout: one key figure, only if the content states it.', properties: { value: { type: 'string' }, label: { type: 'string' }, note: { type: 'string', description: 'Where the figure comes from.' } } },
            person: { type: 'object', description: 'contacts layout.', properties: { name: { type: 'string' }, role: { type: 'string' }, email: { type: 'string' }, site: { type: 'string' } } },
            picture: { type: 'string', description: 'image layout: what the picture on the right should show (a note for the designer).' },
          },
          required: ['layout', 'title'],
        },
      },
    },
    required: ['slides'],
  },
};

export async function generateDeck(env: Env, wsId: string, o: { brand: string; about: any; text?: string; pdf_base64?: string; slides?: number }) {
  const attachments = o.pdf_base64 ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: o.pdf_base64 } }] : [];
  const r: any = await askForTool(env, wsId, {
    system:
      `You are a senior brand strategist at the Metabrand agency writing a pitch deck for ${o.brand}. ` +
      'You lay the given content out on fixed slide templates: cover (logo and a big headline), text (kicker, headline, paragraph), image (kicker, headline, short text, a picture on the right), ' +
      'cards (kicker, headline, exactly three cards), steps (kicker, headline, text, three steps and an optional key figure), contacts (closing line and a person). ' +
      'Write like the brand: plain, concrete, confident, short. One idea per slide. No hashtags, emojis or clichés (game-changer, unlock, revolutionize, seamless). ' +
      'Never invent figures, customers, investors, names or contacts: use only what the content says; leave a person or a figure out when it is not given. Write in the language of the content.',
    prompt:
      `Brand: ${o.brand}\nWhat the brand says about itself (JSON): ${JSON.stringify(o.about || {})}\n\n` +
      (o.text ? `Content for the deck:\n"""\n${o.text.slice(0, 60000)}\n"""\n\n` : 'The content for the deck is in the attached document.\n\n') +
      `Make ${o.slides || '8 to 12'} slides. Start with a cover and end with contacts. Pick for each point the layout that fits it: cards for three parallel points, steps for a process, image where a product view or a picture helps, text for a single argument.`,
    tool: TOOL as any,
    max_tokens: 6000,
    ...(attachments.length ? { attachments } : {}),
  });
  const clean = (s: any, n = 400) => (typeof s === 'string' ? s.replace(/\\n/g, '\n').trim().slice(0, n) : undefined);
  const slides = (Array.isArray(r.slides) ? r.slides : []).filter((s: any) => LAYOUTS.includes(s?.layout) && s.title).slice(0, 20).map((s: any) => ({
    layout: s.layout,
    kicker: clean(s.kicker, 40),
    title: clean(s.title, 160),
    text: clean(s.text, 600),
    cards: s.layout === 'cards' ? (s.cards || []).slice(0, 3).map((c: any) => ({ title: clean(c.title, 60) || '', text: clean(c.text, 240) || '' })) : undefined,
    steps: s.layout === 'steps' ? (s.steps || []).slice(0, 3).map((c: any) => ({ title: clean(c.title, 40) || '', text: clean(c.text, 240) || '' })) : undefined,
    stat: s.layout === 'steps' && s.stat?.value ? { value: clean(s.stat.value, 30), label: clean(s.stat.label, 80) || '', note: clean(s.stat.note, 120), on: true } : undefined,
    person: s.layout === 'contacts' && s.person ? { name: clean(s.person.name, 60) || '', role: clean(s.person.role, 80) || '', email: clean(s.person.email, 80), site: clean(s.person.site, 80) } : undefined,
    picture: clean(s.picture, 200),
  }));
  if (!slides.length) throw new Error('The AI returned no slides, try again');
  return { footer: clean(r.footer, 40) || '', slides };
}
