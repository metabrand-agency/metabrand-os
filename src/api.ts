export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth') && !location.pathname.startsWith('/login') && !location.pathname.startsWith('/setup')) {
    location.href = '/login';
  }
  if (!res.ok) throw new Error((data as any).error || `Error ${res.status}`);
  return data as T;
}

export type Me = { user: { id: string; email: string }; org: { id: string; name: string; logo_url: string | null } | null; isAgency: boolean };

export const STAGES = ['lead', 'proposal', 'active', 'launched', 'monitoring', 'archived'] as const;
export const DOC_KINDS = ['brief', 'transcript', 'email_thread', 'proposal', 'contract', 'research', 'note'] as const;

export function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
