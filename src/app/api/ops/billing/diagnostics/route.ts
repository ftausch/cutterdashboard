/**
 * GET /api/ops/billing/diagnostics?cutter_id=…
 *
 * Returns ALL clips for a cutter (not just eligible ones) with a per-clip
 * explanation of why the clip is or is not eligible for billing.
 * Used by the admin prepare page to surface blockers.
 *
 * Also returns:
 *   - cutter profile info (rate, has_profile)
 *   - aggregate counts (eligible, ineligible, reasons breakdown)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args: args.map(a =>
        a === null                                      ? { type: 'null' } :
        typeof a === 'number' && !Number.isInteger(a)  ? { type: 'real',    value: String(a) } :
        typeof a === 'number'                          ? { type: 'integer', value: String(a) } :
        { type: 'text', value: String(a) }
      )}}, { type: 'close' }],
    }),
  });
  const data = await res.json();
  const r    = data.results?.[0];
  if (r?.type === 'error') throw new Error(r.error.message);
  return r?.response?.result ?? { rows: [], cols: [] };
}

async function dbAlter(sql: string) {
  try { await dbQuery(sql); } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('already has a column')) throw e;
  }
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (!v) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

// ── Compute per-clip ineligibility reasons ────────────────────────────
type BlockReason =
  | 'not_verified'
  | 'no_views'
  | 'already_billed'
  | 'included_in_batch'
  | 'flagged'
  | 'already_invoiced'
  | 'eligible';

function computeReason(clip: {
  verification_status: string | null;
  proof_status:        string | null;
  verified_views:      number;
  billed_baseline:     number;
  billing_status:      string | null;
  is_flagged:          number | null;
}): BlockReason {
  const isVerified =
    clip.proof_status === 'proof_approved' ||
    clip.verification_status === 'verified' ||
    clip.verification_status === 'manual_proof';

  if (clip.is_flagged === 1) return 'flagged';
  if (clip.billing_status === 'invoiced') return 'already_invoiced';
  if (clip.billing_status === 'included_in_batch') return 'included_in_batch';
  if (!isVerified) return 'not_verified';
  if (clip.verified_views <= 0) return 'no_views';
  if (clip.verified_views <= clip.billed_baseline) return 'already_billed';
  return 'eligible';
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  await Promise.all([
    dbAlter(`ALTER TABLE cutter_videos ADD COLUMN billing_status TEXT`),
    dbAlter(`ALTER TABLE cutter_videos ADD COLUMN billing_batch_id TEXT`),
  ]);

  const sp        = request.nextUrl.searchParams;
  const cutter_id = sp.get('cutter_id');
  if (!cutter_id) {
    return NextResponse.json({ error: 'cutter_id ist erforderlich.' }, { status: 400 });
  }

  // ── 1. Cutter + profile ───────────────────────────────────────────────
  const cutterRes = await dbQuery(
    `SELECT c.name, c.rate_per_view,
            p.rate_per_1k, p.currency, p.effective_from
     FROM cutters c
     LEFT JOIN cutter_billing_profiles p ON p.cutter_id = c.id
       AND p.effective_from = (
         SELECT MAX(p2.effective_from) FROM cutter_billing_profiles p2
         WHERE p2.cutter_id = c.id
       )
     WHERE c.id = ?`,
    [cutter_id]
  );

  if (!cutterRes.rows.length) {
    return NextResponse.json({ error: 'Cutter nicht gefunden.' }, { status: 404 });
  }

  const cr           = cutterRes.rows[0] as unknown[];
  const cutterName   = val(cr[0]) ?? '';
  const legacyRate   = num(cr[1]);
  const profileRate  = num(cr[2]);
  const currency     = val(cr[3]) ?? 'EUR';
  const ratePer1k    = profileRate ?? (legacyRate != null ? legacyRate * 1000 : null);
  const hasProfile   = ratePer1k != null;

  // ── 2. All clips ──────────────────────────────────────────────────────
  const clipsRes = await dbQuery(
    `SELECT
       v.id,
       v.platform,
       v.url,
       v.title,
       v.verification_status,
       v.proof_status,
       v.claimed_views,
       v.current_views,
       v.observed_views,
       COALESCE(v.views_at_last_invoice, 0)            AS billed_baseline,
       v.billing_status,
       COALESCE(v.is_flagged, 0)                        AS is_flagged,
       COALESCE(v.published_at, v.created_at)           AS clip_date,
       CASE
         WHEN v.proof_status IN ('proof_approved')
           OR  v.verification_status IN ('verified', 'manual_proof')
           THEN COALESCE(v.observed_views, v.current_views, v.claimed_views, 0)
         ELSE 0
       END                                              AS verified_views
     FROM cutter_videos v
     WHERE v.cutter_id = ?
     ORDER BY clip_date DESC`,
    [cutter_id]
  );

  const clips = (clipsRes.rows as unknown[][]).map(r => {
    const verifiedViews  = num(r[13]) ?? 0;
    const billedBaseline = num(r[9])  ?? 0;
    const billingStatus  = val(r[10]);
    const isFlagged      = num(r[11]) ?? 0;

    const reason = computeReason({
      verification_status: val(r[4]),
      proof_status:        val(r[5]),
      verified_views:      verifiedViews,
      billed_baseline:     billedBaseline,
      billing_status:      billingStatus,
      is_flagged:          isFlagged,
    });

    const billableViews = reason === 'eligible' ? verifiedViews - billedBaseline : 0;
    const amount        = hasProfile && billableViews > 0 ? (billableViews / 1000) * ratePer1k! : 0;

    return {
      id:                  val(r[0]),
      platform:            val(r[1]),
      url:                 val(r[2]),
      title:               val(r[3]),
      verification_status: val(r[4]),
      proof_status:        val(r[5]),
      claimed_views:       num(r[6]),
      current_views:       num(r[7]),
      observed_views:      num(r[8]),
      billed_baseline:     billedBaseline,
      billing_status:      billingStatus,
      is_flagged:          isFlagged === 1,
      clip_date:           val(r[12]),
      verified_views:      verifiedViews,
      billable_views:      billableViews,
      amount,
      reason,
      is_eligible:         reason === 'eligible',
    };
  });

  // ── 3. Aggregate counts ───────────────────────────────────────────────
  const reasonCounts: Record<string, number> = {};
  for (const c of clips) {
    reasonCounts[c.reason] = (reasonCounts[c.reason] ?? 0) + 1;
  }

  const eligibleClips    = clips.filter(c => c.is_eligible);
  const totalBillViews   = eligibleClips.reduce((s, c) => s + c.billable_views, 0);
  const totalAmount      = eligibleClips.reduce((s, c) => s + c.amount, 0);

  return NextResponse.json({
    cutter_id,
    cutter_name:  cutterName,
    has_profile:  hasProfile,
    rate_per_1k:  ratePer1k,
    currency,
    clips,
    summary: {
      total:              clips.length,
      eligible:           eligibleClips.length,
      total_billable_views: totalBillViews,
      estimated_amount:   totalAmount,
      reasons:            reasonCounts,
    },
  });
}
