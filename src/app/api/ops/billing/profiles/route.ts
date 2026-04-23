/**
 * GET  /api/ops/billing/profiles  — list all cutters with their current billing profile
 * POST /api/ops/billing/profiles  — create a new billing profile for a cutter
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { randomUUID } from 'crypto';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args: args.map(a =>
        a === null                   ? { type: 'null' } :
        typeof a === 'number' && !Number.isInteger(a) ? { type: 'real', value: String(a) } :
        typeof a === 'number'        ? { type: 'integer', value: String(a) } :
        { type: 'text', value: String(a) }
      )}}, { type: 'close' }],
    }),
  });
  const data = await res.json();
  const r    = data.results?.[0];
  if (r?.type === 'error') throw new Error(r.error.message);
  return r?.response?.result ?? { rows: [], cols: [] };
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (!v) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

const PROFILES_DDL = `CREATE TABLE IF NOT EXISTS cutter_billing_profiles (
  id              TEXT PRIMARY KEY,
  cutter_id       TEXT NOT NULL,
  rate_per_1k     REAL NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'EUR',
  effective_from  TEXT NOT NULL,
  notes           TEXT,
  created_by_id   TEXT,
  created_by_name TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
)`;

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  await dbQuery(PROFILES_DDL);

  const result = await dbQuery(`
    SELECT c.id, c.name, c.rate_per_view,
           p.id AS profile_id, p.rate_per_1k, p.currency,
           p.effective_from, p.notes, p.created_at, p.created_by_name
    FROM cutters c
    LEFT JOIN cutter_billing_profiles p ON p.cutter_id = c.id
      AND p.effective_from = (
        SELECT MAX(p2.effective_from) FROM cutter_billing_profiles p2
        WHERE p2.cutter_id = c.id
      )
    WHERE c.is_active = 1
    ORDER BY c.name
  `);

  const profiles = (result.rows as unknown[][]).map(r => ({
    cutter_id:           val(r[0]),
    cutter_name:         val(r[1]),
    rate_per_view_legacy: num(r[2]),   // legacy € per 1 view field on cutters
    profile_id:          val(r[3]),
    rate_per_1k:         num(r[4]),    // new: € per 1,000 views
    currency:            val(r[5]) ?? 'EUR',
    effective_from:      val(r[6]),
    notes:               val(r[7]),
    created_at:          val(r[8]),
    created_by_name:     val(r[9]),
    has_profile:         val(r[3]) !== null,
  }));

  return NextResponse.json({ profiles });
}

// ── POST ──────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  await dbQuery(PROFILES_DDL);

  const body = await request.json() as {
    cutter_id:     string;
    rate_per_1k:   number;
    currency?:     string;
    effective_from?: string;
    notes?:        string;
  };

  if (!body.cutter_id || body.rate_per_1k == null) {
    return NextResponse.json({ error: 'cutter_id und rate_per_1k sind Pflichtfelder.' }, { status: 400 });
  }
  if (body.rate_per_1k <= 0) {
    return NextResponse.json({ error: 'rate_per_1k muss größer als 0 sein.' }, { status: 400 });
  }

  const id           = randomUUID();
  const today        = new Date().toISOString().slice(0, 10);
  const effectiveFrom = body.effective_from ?? today;

  await dbQuery(
    `INSERT INTO cutter_billing_profiles
       (id, cutter_id, rate_per_1k, currency, effective_from, notes, created_by_id, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, body.cutter_id, body.rate_per_1k, body.currency ?? 'EUR',
     effectiveFrom, body.notes ?? null, auth.id, auth.name]
  );

  return NextResponse.json({ id }, { status: 201 });
}
