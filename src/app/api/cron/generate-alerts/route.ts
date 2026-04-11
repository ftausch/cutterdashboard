import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionFromCookie } from '@/lib/cutter/auth';
import { can, type Role } from '@/lib/permissions';
import { ensureDb } from '@/lib/db';
import { upsertAlert, resolveAlert } from '@/lib/ops-alerts';

// POST /api/cron/generate-alerts
// Sweeps all videos and creates/clears alerts based on current state.
// Accepts: Vercel cron (x-cron-secret header) OR authenticated ops/admin session.

export async function POST(request: NextRequest) {
  // Dual auth: cron secret header OR authenticated session
  const cronSecret = request.headers.get('x-cron-secret');
  const isCronCall = cronSecret === process.env.CRON_SECRET;

  if (!isCronCall) {
    const cookieStore = await cookies();
    const session = await getSessionFromCookie(cookieStore.get('cutter_session')?.value);
    if (!session || !can(session.role as Role, 'ALERT_MANAGE')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = await ensureDb();

  // Fetch all videos with relevant fields for alert evaluation
  const videosResult = await db.execute({
    sql: `SELECT
            v.id, v.cutter_id, c.name AS cutter_name,
            v.discrepancy_status,
            v.discrepancy_percent,
            v.verification_status,
            v.proof_status,
            v.proof_requested_at,
            v.last_scraped_at,
            v.created_at
          FROM cutter_videos v
          JOIN cutters c ON c.id = v.cutter_id`,
    args: [],
  });

  const now = new Date();
  const SEVEN_DAYS_MS  = 7  * 24 * 60 * 60 * 1000;
  const THREE_DAYS_MS  = 3  * 24 * 60 * 60 * 1000;
  const SEVENTY_TWO_H  = 72 * 60 * 60 * 1000;

  let generated = 0;
  let cleared   = 0;

  for (const rawRow of videosResult.rows) {
    const row = rawRow as Record<string, unknown>;
    const videoId    = row.id        as string;
    const cutterId   = row.cutter_id as string;
    const cutterName = (row.cutter_name as string) ?? 'Unbekannt';

    // ── 1. Discrepancy alerts ─────────────────────────────────
    const discStatus = row.discrepancy_status as string | null;
    const discPct    = row.discrepancy_percent != null ? Number(row.discrepancy_percent) : null;

    if (discStatus === 'critical_difference') {
      await upsertAlert(db, { type: 'discrepancy_critical', videoId, cutterId, cutterName, meta: { discrepancy_percent: discPct } });
      generated++;
    } else {
      await resolveAlert(db, 'discrepancy_critical', videoId);
      cleared++;
    }

    if (discStatus === 'suspicious_difference') {
      await upsertAlert(db, { type: 'discrepancy_suspicious', videoId, cutterId, cutterName, meta: { discrepancy_percent: discPct } });
      generated++;
    } else {
      await resolveAlert(db, 'discrepancy_suspicious', videoId);
      cleared++;
    }

    // ── 2. Proof submitted (waiting for review) ───────────────
    const proofStatus = row.proof_status as string | null;

    if (proofStatus === 'proof_submitted') {
      await upsertAlert(db, { type: 'proof_submitted', videoId, cutterId, cutterName });
      generated++;
    } else {
      await resolveAlert(db, 'proof_submitted', videoId);
      cleared++;
    }

    // ── 3. Proof overdue (requested >72h, not yet submitted) ──
    if (proofStatus === 'proof_requested' && row.proof_requested_at) {
      const requestedAt = new Date(row.proof_requested_at as string);
      const elapsed     = now.getTime() - requestedAt.getTime();
      if (elapsed > SEVENTY_TWO_H) {
        await upsertAlert(db, {
          type: 'proof_overdue', videoId, cutterId, cutterName,
          meta: { hours_overdue: Math.floor(elapsed / (60 * 60 * 1000)) },
        });
        generated++;
      }
    } else if (proofStatus !== 'proof_requested') {
      await resolveAlert(db, 'proof_overdue', videoId);
      cleared++;
    }

    // ── 4. Sync stale (>7 days without sync) ─────────────────
    const lastScrapedAt = row.last_scraped_at as string | null;
    const isStale = !lastScrapedAt || (now.getTime() - new Date(lastScrapedAt).getTime()) > SEVEN_DAYS_MS;

    if (isStale) {
      await upsertAlert(db, {
        type: 'sync_stale', videoId, cutterId, cutterName,
        meta: { last_scraped_at: lastScrapedAt },
      });
      generated++;
    } else {
      await resolveAlert(db, 'sync_stale', videoId);
      cleared++;
    }

    // ── 5. No verification (unverifiable >3 days) ─────────────
    const verStatus = row.verification_status as string | null;
    const createdAt = row.created_at as string | null;
    const unverifiableStatuses = ['claimed_only', 'unavailable', 'unverified'];
    const isOldEnough = createdAt && (now.getTime() - new Date(createdAt).getTime()) > THREE_DAYS_MS;

    if (verStatus && unverifiableStatuses.includes(verStatus) && isOldEnough) {
      await upsertAlert(db, {
        type: 'no_verification', videoId, cutterId, cutterName,
        meta: { verification_status: verStatus },
      });
      generated++;
    } else if (verStatus && !unverifiableStatuses.includes(verStatus)) {
      await resolveAlert(db, 'no_verification', videoId);
      cleared++;
    }
  }

  return NextResponse.json({
    success: true,
    videos_processed: videosResult.rows.length,
    generated,
    cleared,
  });
}
