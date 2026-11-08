// Horizontal bar chart comparing the client and its competitors on one metric (client in its brand colour).
import { Card, Favicon } from '../components/ui';
import { Company, fmtNum, shortName } from './marketShared';

export type Bar = { id: string; c: Company; value: number | null; label?: string };

export function Bars({ title, hint, rows, format = fmtNum, accent }: { title: string; hint: string; rows: Bar[]; format?: (n: number) => string; accent: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  const sorted = [...rows].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </div>
      <div className="space-y-2">
        {sorted.map((r) => (
          <div key={r.id} className="grid grid-cols-[120px_1fr] items-center gap-3 text-[12px]" title={r.value != null ? `${r.c.name}: ${r.label || format(r.value)}` : `${r.c.name}: no data`}>
            <span className={`flex min-w-0 items-center gap-1.5 ${r.id === '__client' ? 'font-medium' : ''}`}><Favicon url={r.c.url} name={r.c.name} size={14} /><span className="truncate">{r.id === '__client' ? r.c.name : shortName(r.c)}</span></span>
            <span className="flex min-w-0 items-center gap-2">
              {r.value != null && r.value > 0 && (
                <span
                  className="h-3 shrink-0 rounded-r-[3px]"
                  style={{ width: `${Math.max(1.5, (r.value / max) * 78)}%`, background: r.id === '__client' ? accent : 'var(--mb-muted)' }}
                />
              )}
              <span className="num truncate text-muted">{r.value == null ? '—' : r.label || format(r.value)}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
