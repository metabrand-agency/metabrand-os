// Small, safe Markdown renderer for chat answers: builds React elements (no HTML injection).
// Supports: headings (also a line that is all **bold**), paragraphs, bullet and numbered lists, quotes, rules,
// **bold**, *italic*, `code`, [links](url), bare URLs. `doc` sets it for reading a whole document (Memory).
import { ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)<>]+|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const t = m[0];
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k} className="font-semibold">{inline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k} className="mono rounded bg-panel-2 px-1 py-px text-[12px]">{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(<a key={k} href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-text">{label}</a>);
    } else if (t.startsWith('http')) {
      const clean = t.replace(/[.,;:]+$/, '');
      out.push(<a key={k} href={clean} target="_blank" rel="noreferrer" className="break-all underline decoration-line underline-offset-2 hover:decoration-text">{clean.replace(/^https?:\/\/(www\.)?/, '')}</a>);
      if (clean.length < t.length) out.push(t.slice(clean.length));
    } else out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { type: 'p' | 'h' | 'ul' | 'ol' | 'hr'; lines: string[]; level?: number };

export default function Markdown({ text, doc = false }: { text: string; doc?: boolean }) {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const prev = blocks[blocks.length - 1];
    let m;
    if (!line.trim()) { blocks.push({ type: 'p', lines: [] }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: 'hr', lines: [''] }); continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*$/))) { blocks.push({ type: 'h', lines: [m[2].replace(/^\*\*(.*)\*\*$/, '$1')], level: Math.min(4, m[1].length) }); continue; }
    // a line that is only bold text (often how exported briefs mark their headings)
    if ((m = line.match(/^\s*(?:\*\*|__)([^*_].*?)(?:\*\*|__)\s*:?\s*$/))) { blocks.push({ type: 'h', lines: [m[1]], level: 3 }); continue; }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { if (prev?.type === 'p' && prev.lines.length) prev.lines.push(m[1]); else blocks.push({ type: 'p', lines: [m[1]] }); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (prev?.type === 'ul') prev.lines.push(m[1]); else blocks.push({ type: 'ul', lines: [m[1]] }); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (prev?.type === 'ol') prev.lines.push(m[1]); else blocks.push({ type: 'ol', lines: [m[1]] }); continue; }
    if (prev?.type === 'p' && prev.lines.length) prev.lines.push(line);
    else if ((prev?.type === 'ul' || prev?.type === 'ol') && /^\s{2,}/.test(raw)) prev.lines[prev.lines.length - 1] += ' ' + line.trim();
    else blocks.push({ type: 'p', lines: [line] });
  }
  const hCls = (l: number) => (doc ? (l <= 1 ? 'pt-3 text-[20px] tracking-[-0.01em]' : l === 2 ? 'pt-3 text-[16px]' : 'pt-2 text-[14px]') : l <= 2 ? 'pt-1 text-[14px]' : 'pt-1 text-[13px]');
  return (
    <div className={doc ? 'space-y-3 text-[13.5px] leading-relaxed text-text' : 'space-y-2.5'}>
      {blocks.filter((b) => b.lines.length).map((b, i) => {
        const k = `b${i}`;
        if (b.type === 'hr') return <hr key={k} className="border-line" />;
        if (b.type === 'h') return <div key={k} className={`${hCls(b.level!)} font-semibold`}>{inline(b.lines[0], k)}</div>;
        if (b.type === 'ul') return <ul key={k} className="space-y-1">{b.lines.map((l, j) => <li key={j} className="flex gap-2"><span className="text-muted">–</span><span className="min-w-0">{inline(l, `${k}-${j}`)}</span></li>)}</ul>;
        if (b.type === 'ol') return <ol key={k} className="space-y-1">{b.lines.map((l, j) => <li key={j} className="flex gap-2"><span className="num text-muted">{j + 1}.</span><span className="min-w-0">{inline(l, `${k}-${j}`)}</span></li>)}</ol>;
        return <p key={k}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l, `${k}-${j}`)}</span>)}</p>;
      })}
    </div>
  );
}
