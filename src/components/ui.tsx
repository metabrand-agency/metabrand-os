import { ReactNode, useState } from 'react';

/** Metabrand mark (orbit star), drawn from the site logo. */
export function Mark({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="887 -1 82 80" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round">
      <path d="M927.351 2.47559C928.64 2.47573 930.109 3.10896 931.698 4.76465C933.294 6.42727 934.845 8.96398 936.2 12.3018C938.905 18.965 940.635 28.3414 940.635 38.8242C940.635 49.3068 938.905 58.6826 936.2 65.3457C934.845 68.6835 933.294 71.2202 931.698 72.8828C930.109 74.5385 928.64 75.1727 927.351 75.1729C926.061 75.1729 924.591 74.5388 923.002 72.8828C921.406 71.2202 919.855 68.6835 918.5 65.3457C915.795 58.6826 914.066 49.3068 914.066 38.8242C914.066 28.3414 915.795 18.965 918.5 12.3018C919.855 8.96396 921.406 6.42728 923.002 4.76465C924.591 3.10873 926.061 2.47559 927.351 2.47559Z" />
      <path d="M953.053 13.1219C953.965 14.0338 954.556 15.5204 954.509 17.8147C954.462 20.1187 953.765 23.0094 952.363 26.3277C949.564 32.9518 944.157 40.8051 936.744 48.2176C929.332 55.6299 921.479 61.0363 914.855 63.8354C911.537 65.2375 908.646 65.9342 906.342 65.9816C904.048 66.0287 902.561 65.4384 901.649 64.5266C900.737 63.6147 900.146 62.1271 900.193 59.8324C900.24 57.5284 900.937 54.6377 902.339 51.3195C905.138 44.6954 910.546 36.8433 917.958 29.4309C925.37 22.0185 933.223 16.6108 939.847 13.8117C943.165 12.4096 946.056 11.7129 948.36 11.6655C950.655 11.6184 952.142 12.2099 953.053 13.1219Z" />
      <path d="M953.052 64.5261C952.14 65.4379 950.653 66.0289 948.359 65.9818C946.055 65.9344 943.164 65.2377 939.846 63.8356C933.222 61.0365 925.369 55.6296 917.956 48.2171C910.544 40.8048 905.137 32.9519 902.338 26.3279C900.936 23.0096 900.24 20.1189 900.192 17.815C900.145 15.5205 900.735 14.0334 901.647 13.1214C902.559 12.2095 904.047 11.6186 906.341 11.6658C908.645 11.7131 911.536 12.4098 914.854 13.812C921.478 16.611 929.331 22.0182 936.743 29.4304C944.155 36.8429 949.563 44.6955 952.362 51.3197C953.764 54.6379 954.461 57.5287 954.508 59.8326C954.555 62.1273 953.964 63.6142 953.052 64.5261Z" />
      <path d="M890.364 39.2183H965.623" />
    </svg>
  );
}

export function Logo({ url, name = 'Metabrand' }: { url?: string | null; name?: string }) {
  if (url) return <img src={url} alt={name} className="h-5" />;
  return (
    <span className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-brand-ink"><Mark className="h-4 w-4" /></span>
      <span>{name}<span className="ml-[3px] font-normal text-muted">OS</span></span>
    </span>
  );
}

/** Site favicon via Google's favicon service; falls back to a letter tile. */
export function Favicon({ url, name, size = 16 }: { url?: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  let host = '';
  try { host = url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { /* not a URL */ }
  const box = { width: size, height: size };
  if (!host || broken)
    return <span style={box} className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-panel-2 text-[9px] font-semibold uppercase text-muted">{name.slice(0, 1)}</span>;
  return <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" style={{ ...box, minWidth: size }} className="shrink-0 rounded-[4px] bg-white object-contain" onError={() => setBroken(true)} />;
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

export function Select({ value, onChange, options, labels }: { value: string; onChange: (v: string) => void; options: readonly string[]; labels?: Record<string, string> }) {
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-line bg-panel py-2 pl-3 pr-9 text-[13px] outline-none hover:border-muted focus:border-muted"
      >
        {options.map((o) => (
          <option key={o} value={o}>{labels?.[o] ?? o.replace('_', ' ')}</option>
        ))}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-line bg-panel ${className}`}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-medium uppercase tracking-[.08em] text-muted">{children}</div>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3">
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
