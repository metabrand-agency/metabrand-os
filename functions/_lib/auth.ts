export type Env = {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  APOLLO_API_KEY?: string;
  AHREFS_API_KEY?: string;
  SESSION_SECRET: string;
  ACCESS_CODE: string;
  MODEL?: string;
};

export type Membership = {
  orgRoles: Record<string, 'agency_admin' | 'agency_member'>;
  wsRoles: Record<string, 'client_admin' | 'client_member' | 'brand_guest'>;
};

export type SessionUser = { id: string; email: string; name: string | null } & Membership;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function makeSession(secret: string, userId: string, days = 30): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ uid: userId, exp: Date.now() + days * 864e5 })));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function readSession(secret: string, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if ((await hmac(secret, payload)) !== sig) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof json.exp !== 'number' || json.exp < Date.now()) return null;
    return json.uid as string;
  } catch {
    return null;
  }
}

export async function loadUser(db: D1Database, userId: string): Promise<SessionUser | null> {
  const u = await db.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(userId).first<{ id: string; email: string; name: string | null }>();
  if (!u) return null;
  const orgs = await db.prepare('SELECT org_id, role FROM org_members WHERE user_id = ?').bind(userId).all<{ org_id: string; role: any }>();
  const wss = await db.prepare('SELECT workspace_id, role FROM workspace_members WHERE user_id = ?').bind(userId).all<{ workspace_id: string; role: any }>();
  return {
    ...u,
    orgRoles: Object.fromEntries(orgs.results.map((r) => [r.org_id, r.role])),
    wsRoles: Object.fromEntries(wss.results.map((r) => [r.workspace_id, r.role])),
  };
}

export type Access = { level: 'agency_admin' | 'agency_member' | 'client_admin' | 'client_member' | 'brand_guest'; isAgency: boolean };

export function accessFor(user: SessionUser, ws: { id: string; org_id: string }): Access | null {
  const orgRole = user.orgRoles[ws.org_id];
  if (orgRole) return { level: orgRole, isAgency: true };
  const wsRole = user.wsRoles[ws.id];
  if (wsRole) return { level: wsRole, isAgency: false };
  return null;
}

export function uid(prefix = ''): string {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// Personal sign-in codes for client users (shown once on invite, stored as HMAC).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export const normCode = (c: string) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export async function hashCode(secret: string, code: string): Promise<string> {
  return hmac(secret, `code:${normCode(code)}`);
}
