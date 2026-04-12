import { randomUUID } from 'crypto';
import { ensureDb } from '@/lib/db';

export type CutterRole = 'super_admin' | 'ops_manager' | 'cutter' | 'viewer';

export interface CutterRow {
  id: string;
  name: string;
  email: string;
  company_name: string | null;
  company_address: string | null;
  tax_id: string | null;
  iban: string | null;
  rate_per_view: number;
  is_admin: number;
  role: CutterRole;
  is_active: number;
  created_at: string;
}

/** @deprecated Use can(role, 'OPS_READ') from @/lib/permissions instead */
export function hasOpsAccess(cutter: CutterRow): boolean {
  return cutter.role === 'super_admin' || cutter.role === 'ops_manager';
}

/** @deprecated Use can(role, 'USER_MANAGE') from @/lib/permissions instead */
export function isSuperAdmin(cutter: CutterRow): boolean {
  return cutter.role === 'super_admin';
}

// ─── Magic Link ────────────────────────────────────────────────────

export async function generateMagicToken(email: string): Promise<string | null> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT id FROM cutters WHERE email = ? AND is_active = 1`,
    args: [email],
  });
  const cutter = result.rows[0] as { id: string } | undefined;

  if (!cutter) return null;

  const token = randomUUID();
  await db.execute({
    sql: `UPDATE cutters SET magic_token = ?, token_expires_at = datetime('now', '+15 minutes') WHERE id = ?`,
    args: [token, cutter.id],
  });

  return token;
}

export async function verifyMagicToken(
  token: string
): Promise<{ sessionToken: string; cutter: CutterRow } | null> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT * FROM cutters WHERE magic_token = ? AND token_expires_at > datetime('now') AND is_active = 1`,
    args: [token],
  });
  const cutter = result.rows[0] as unknown as CutterRow | undefined;

  if (!cutter) return null;

  // Clear magic token
  await db.execute({
    sql: `UPDATE cutters SET magic_token = NULL, token_expires_at = NULL WHERE id = ?`,
    args: [cutter.id],
  });

  // Create session (30 days)
  const sessionToken = randomUUID();
  const sessionId = randomUUID();
  await db.execute({
    sql: `INSERT INTO cutter_sessions (id, cutter_id, token, expires_at) VALUES (?, ?, ?, datetime('now', '+30 days'))`,
    args: [sessionId, cutter.id, sessionToken],
  });

  return { sessionToken, cutter };
}

// ─── Session Cache ─────────────────────────────────────────────────
// Module-level cache — survives across requests on a warm Vercel function.
// TTL: 60 seconds. Avoids one DB round trip per request for active users.

interface CacheEntry { cutter: CutterRow; expiresAt: number; }
const _sessionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 seconds

function getCached(token: string): CutterRow | null {
  const entry = _sessionCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _sessionCache.delete(token); return null; }
  return entry.cutter;
}

function setCache(token: string, cutter: CutterRow) {
  // Evict old entries if cache grows too large
  if (_sessionCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of _sessionCache) {
      if (now > v.expiresAt) _sessionCache.delete(k);
    }
  }
  _sessionCache.set(token, { cutter, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateSessionCache(token: string) {
  _sessionCache.delete(token);
}

// ─── Session Management ────────────────────────────────────────────

export async function getSessionFromCookie(
  cookieValue: string | undefined
): Promise<CutterRow | null> {
  if (!cookieValue) return null;

  // Try cache first — skips DB round trip on warm functions
  const cached = getCached(cookieValue);
  if (cached) return cached;

  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT c.* FROM cutters c
     JOIN cutter_sessions s ON s.cutter_id = c.id
     WHERE s.token = ? AND s.expires_at > datetime('now') AND c.is_active = 1`,
    args: [cookieValue],
  });

  const cutter = (result.rows[0] as unknown as CutterRow) ?? null;
  if (cutter) setCache(cookieValue, cutter);
  return cutter;
}

export function createSessionCookie(sessionToken: string): string {
  return `cutter_session=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
}

export function clearSessionCookie(): string {
  return `cutter_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function destroySession(token: string): Promise<void> {
  const db = await ensureDb();
  await db.execute({
    sql: `DELETE FROM cutter_sessions WHERE token = ?`,
    args: [token],
  });
}

// ─── Cleanup ───────────────────────────────────────────────────────

export async function cleanExpiredSessions(): Promise<void> {
  const db = await ensureDb();
  await db.execute(`DELETE FROM cutter_sessions WHERE expires_at < datetime('now')`);
}
