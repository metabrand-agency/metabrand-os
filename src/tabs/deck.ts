// Pitch deck model: a deck is a list of slides in a few layouts taken from the brand's deck templates
// (SuperPlane: Figma "Pitchdeck"). Slides are drawn in HTML at 1920 × 1080 from the brand kit, so any
// project gets its own colours, fonts and logo; the text is edited in place.
import type { Kit, KitLogo } from './BrandKit';
import { rolesOf } from './banners';

export type Layout = 'cover' | 'text' | 'image' | 'cards' | 'steps' | 'contacts';
export type Card = { title: string; text: string; image?: string; icon?: string };
export type Step = { title: string; text: string };
export type Slide = {
  id: string;
  layout: Layout;
  dark?: boolean;
  kicker?: string;
  title: string;
  text?: string;
  image?: string;
  bg?: string;
  cards?: Card[];
  steps?: Step[];
  stat?: { value: string; label: string; note?: string; on?: boolean };
  person?: { name: string; role: string; email?: string; site?: string };
};
export type Deck = { v: 1; footer: string; slides: Slide[] };

export const W = 1920, H = 1080;
export const LAYOUTS: { id: Layout; name: string; hint: string }[] = [
  { id: 'cover', name: 'Cover', hint: 'Logo and a big headline on the brand art' },
  { id: 'text', name: 'Title and text', hint: 'Kicker, headline, a paragraph' },
  { id: 'image', name: 'Title and picture', hint: 'Headline and text, a picture on the right' },
  { id: 'contacts', name: 'Contacts', hint: 'Closing line, a person and how to reach them' },
  { id: 'cards', name: 'Three points', hint: 'Headline and three cards' },
  { id: 'steps', name: 'Steps', hint: 'Headline, a key figure and three steps' },
];

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Colours and type for slides, from any kit. */
export type Look = {
  dark: string; graphite: string; card: string; mist: string; cloud: string; panel: string; squares: string[];
  accent: string; ink: string; inkLight: string; head: string; mono: string; sign?: KitLogo; logo?: KitLogo;
};
const rgb = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

export function lookOf(kit: Kit): Look {
  const R = rolesOf(kit);
  const all = (kit.colors || []).flatMap((g) => g.items);
  const named = (re: RegExp, lo: number, hi: number) => all.find((c) => re.test(c.name) && lum(c.hex) >= lo && lum(c.hex) <= hi)?.hex;
  const lights = R.lights.length ? R.lights : [R.light];
  const mist = lights.length > 1 ? lights[0] : mix(R.light, R.dark, 0.06);
  const cloud = lights[lights.length - 1] || R.light;
  const graphite = named(/graphite|charcoal|anthracite|grey|gray/i, 0.08, 0.25) || mix(R.dark, R.light, 0.1);
  const panel = named(/neutral|grey|gray|steel|slate/i, 0.35, 0.7) || mix(R.dark, R.light, 0.58);
  const sage = R.mids.find((m) => lum(m) > 0.45) || panel;
  const logos = kit.logos || [];
  return {
    dark: R.dark, graphite, card: mix(R.dark, '#000000', 0.15), mist, cloud, panel,
    squares: [mix(panel, sage, 0.18), mix(panel, R.dark, 0.08), mix(panel, sage, 0.3), mix(panel, R.dark, 0.14)],
    accent: R.accent, ink: R.dark, inkLight: cloud, head: R.head.family, mono: R.mono?.family || 'ui-monospace',
    sign: R.sign || logos.find((l) => /sign|mark|symbol|icon/i.test(l.id + l.name)), logo: logos.find((l) => /^logo$/i.test(l.id)) || logos[0],
  };
}

/** Starter content for a new slide of a layout. */
export function blank(layout: Layout, kit: Kit | null, footer?: string): Slide {
  const bgs = kit?.backgrounds || [];
  const brand = kit?.brand || 'Company';
  const base = { id: uid(), layout };
  switch (layout) {
    case 'cover': return { ...base, title: `${brand}\n→ what you do, in one line`, bg: bgs.find((b) => /globe/i.test(b.name + b.src))?.src || bgs[0]?.src };
    case 'text': return { ...base, kicker: 'Section', title: 'One clear point per slide.', text: 'A short paragraph that backs the headline up: what it means, why it matters and what proves it.' };
    case 'image': return { ...base, kicker: 'Product', title: 'Show the thing you are talking about.', text: 'A sentence or two on what the picture shows and why it matters.' };
    case 'contacts': return { ...base, title: "Let's talk.", person: { name: 'Name Surname', role: `Founder, ${brand}`, email: 'name@company.com', site: footer ? '' : '' }, bg: bgs.find((b) => /field/i.test(b.name + b.src))?.src || bgs[0]?.src };
    case 'cards': return { ...base, kicker: 'Why us', title: 'Three reasons in one headline.', cards: [1, 2, 3].map((n) => ({ title: `Point ${n}`, text: 'One or two lines that explain it.' })) };
    case 'steps': return { ...base, kicker: 'How it works', title: 'Start small.\nScale after it proves itself.', text: 'What happens first, and how the work grows from there.', stat: { value: '4x faster', label: 'the key result', note: '* Where the figure comes from', on: true }, steps: ['Connect', 'Configure', 'Operate'].map((t) => ({ title: t, text: 'What happens here\nWhat you get' })) };
  }
}

const P = '/decks/superplane-k7q2';
/** The SuperPlane deck as designed in Figma (node 1327:8086). */
export function superplaneDeck(): Deck {
  return {
    v: 1,
    footer: 'AI software factory',
    slides: [
      { id: uid(), layout: 'cover', title: 'Engineering tasks\n→ 30% one-shot', bg: `${P}/cover.webp` },
      {
        id: uid(), layout: 'cards', dark: true, kicker: 'Problem', title: 'Agents can code. They still can’t be trusted on autopilot.',
        cards: [
          { title: 'Constant oversight.', text: 'Engineers still plan, prompt, validate, and follow every pull request from start to finish.', image: `${P}/problem-1.png` },
          { title: 'Unclear scope.', text: 'Teams struggle to know which tasks are safe to delegate. Agents misread context and choose the wrong strategy.', image: `${P}/problem-2.png` },
          { title: 'Inconsistent output.', text: 'Without repeatable guardrails, automated code can be inconsistent, insecure, and hard to review.', image: `${P}/problem-3.png` },
        ],
      },
      {
        id: uid(), layout: 'image', kicker: 'Solution', title: 'SuperPlane turns routine engineering work into verified pull requests.',
        text: 'It continuously scans the backlog for high-confidence tasks, applies deterministic guardrails, runs coding agents, verifies the results, and iterates when work is incomplete — without engineers having to project-manage every step.',
        image: `${P}/solution.webp`,
      },
      {
        id: uid(), layout: 'cards', kicker: 'Open source', title: 'Build your software factory around your stack — not someone else’s.',
        cards: [
          { title: 'Control and Ownership', text: 'Deterministic workflows and guardrails\nVisible runs, logs, and outputs\nYour stack, your data, your factory', icon: 'document' },
          { title: 'Deployment', text: 'Open source and self-hostable\nRun in the cloud or on-prem\nFit the factory to your infrastructure', icon: 'list' },
          { title: 'Model Freedom', text: 'Use any model or provider\nChoose the right model for every workflow', icon: 'lock' },
        ],
      },
      {
        id: uid(), layout: 'steps', kicker: 'Getting started', title: 'Start with one workflow.\nScale after it proves itself.',
        text: 'Connect repositories and tools, define repeatable workflows and guardrails, then start with high-confidence tasks. SuperPlane runs agents, verifies outcomes, and opens PRs — giving your team a measurable path from one workflow to a full software factory.',
        stat: { value: '4x faster', label: 'issue-to-reviewed-PR cycle', note: '* Customer-reported result shown on superplane.com', on: true },
        steps: [
          { title: 'Connect', text: 'GitHub repositories\nIssue tracker and CI\nExecution environment\nPreferred AI models' },
          { title: 'Configure', text: 'Workflow steps and triggers\nPolicies and quality gates\nTask-selection criteria\nBaseline metrics' },
          { title: 'Operate', text: 'Autonomous task execution\nVerification and iteration\nVerified pull requests\nExpand across workflows' },
        ],
      },
      {
        id: uid(), layout: 'contacts', title: 'Agents shouldn’t need you\nto hold their hand.', image: `${P}/person.webp`,
        person: { name: 'SuperPlane', role: 'AI Software Factory', site: 'superplane.com' }, bg: '/guides/superplane-k7q2/bg/superplane-field-2.jpg',
      },
    ],
  };
}

/** A first deck for any project: the SuperPlane one for its own workspace, otherwise starter slides. */
export function starterDeck(kit: Kit | null): Deck {
  if (/superplane/i.test(kit?.brand || '')) return superplaneDeck();
  return { v: 1, footer: kit?.brand || '', slides: (['cover', 'cards', 'image', 'steps', 'contacts'] as Layout[]).map((l) => blank(l, kit)) };
}
