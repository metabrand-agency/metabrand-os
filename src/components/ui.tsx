import { ReactNode, useState } from 'react';

export function Logo({ url, name = 'Metabrand' }: { url?: string | null; name?: string }) {
  if (url) return <img src={url} alt={name} className="h-5" />;
  return (
    <span className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
      <span className="brand-dot inline-block h-3 w-3 rounded-full" />
      {name}
      <span className="font-normal text-muted">OS</span>
    </span>
  );
}

export function Btn({ children, onClick, kind = 'ghost', type = 'button', disabled }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'brand'; type?: 'button' | 'submit'; disabled?: boolean }) {
  const cls =
    kind === 'primary' ? 'bg-accent text-ink hover:opacity-85'
    : kind === 'brand' ? 'brand-dot text-brand-ink hover:brightness-95'
    : 'border border-line text-text hover:bg-panel-2';
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-md border border-line bg-panel px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-muted ${props.className || ''}`} />;
}

export function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-line bg-panel px-2 py-2 text-[13px] outline-none">
      {options.map((o) => (
        <option key={o} value={o}>{o.replace('_', ' ')}</option>
      ))}
    </select>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-panel ${className}`}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-medium uppercase tracking-[.08em] text-muted">{children}</div>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="num text-2xl font-medium">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[.08em] text-muted">{label}</div>
    </div>
  );
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: 'inset 0 0 0 1px var(--mb-brand-edge)' }} />}
      {children}
    </span>
  );
}

type Theme = 'auto' | 'light' | 'dark';
function readTheme(): Theme {
  try { const t = localStorage.getItem('mos_theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
}
export function ThemeSwitch() {
  const [t, setT] = useState<Theme>(readTheme);
  const pick = (v: Theme) => {
    setT(v);
    if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    try { v === 'auto' ? localStorage.removeItem('mos_theme') : localStorage.setItem('mos_theme', v); } catch { /* storage unavailable */ }
  };
  const opts: [Theme, string][] = [['auto', 'Auto (system)'], ['light', 'Light'], ['dark', 'Dark']];
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-md border border-line p-0.5">
      {opts.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={t === v} title={label} onClick={() => pick(v)}
          className={`flex h-6 items-center gap-1 rounded px-2 text-[11px] ${t === v ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'}`}>
          {label.split(' ')[0]}
        </button>
      ))}
    </div>
  );
}
