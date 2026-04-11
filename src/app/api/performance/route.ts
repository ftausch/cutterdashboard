/**
 * GET /api/performance
 * Single endpoint for the performance page — avoids multiple waterfall fetches.
 * Returns stats, top clips, platform breakdown, monthly earnings, monthly views.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db  = await ensureDb();
  const cid = auth.id;

  // Run all queries in parallel
  const [
    videosResult,
    statsResult,
    invoicesResult,
    scoreResult,
  ] = await Promise.all([
    // All videos for this cutter
    db.execute({
      sql: `SELECT id, platform, url, title, current_views, views_at_last_invoice,
                   verification_status, discrepancy_status, proof_url, proof_status,
                   is_flagged, published_at, created_at, last_scraped_at
            FROM cutter_videos
            WHERE cutter_id = ?
            ORDER BY current_views DESC`,
      args: [cid],
    }),

    // Aggregate stats
    db.execute({
      sql: `SELECT
              COUNT(*)                                              AS video_count,
              COALESCE(SUM(current_views), 0)                      AS total_views,
              COALESCE(SUM(current_views - views_at_last_invoice)
                FILTER (WHERE current_views > views_at_last_invoice), 0) AS unbilled_views
            FROM cutter_videos WHERE cutter_id = ?`,
      args: [cid],
    }),

    // Invoice history (last 12 months for chart)
    db.execute({
      sql: `SELECT
              strftime('%Y-%m', created_at)  AS month,
              SUM(total_amount)              AS earnings,
              SUM(total_views)               AS views,
              COUNT(*)                       AS invoice_count
            FROM cutter_invoices
            WHERE cutter_id = ?
              AND created_at >= datetime('now', '-12 months')
            GROUP BY month
            ORDER BY month ASC`,
      args: [cid],
    }),

    // Reliability score
    db.execute({
      sql: `SELECT score, trust_score, performance_score
            FROM reliability_scores WHERE cutter_id = ?`,
      args: [cid],
    }),
  ]);

  const videos   = videosResult.rows;
  const aggRow   = statsResult.rows[0]   as Record<string, unknown>;
  const scoreRow = scoreResult.rows[0]   as Record<string, unknown> | undefined;

  // ── Derived stats ────────────────────────────────────────────
  const videoCount   = Number(aggRow?.video_count ?? 0);
  const totalViews   = Number(aggRow?.total_views  ?? 0);
  const unbilledViews = Number(aggRow?.unbilled_views ?? 0);
  const unbilledAmount = unbilledViews * auth.rate_per_view;

  // Earnings from invoices (total)
  const totalEarnings = invoicesResult.rows.reduce(
    (sum, r) => sum + Number((r as Record<string, unknown>).earnings ?? 0), 0
  );

  // Views this calendar month
  const nowYear  = new Date().getFullYear();
  const nowMonth = new Date().getMonth();
  const viewsThisMonth = videos
    .filter((v) => {
      const d = new Date((v as Record<string, unknown>).created_at as string);
      return d.getFullYear() === nowYear && d.getMonth() === nowMonth;
    })
    .reduce((sum, v) => sum + Number((v as Record<string, unknown>).current_views ?? 0), 0);

  const avgViews = videoCount > 0 ? Math.round(totalViews / videoCount) : 0;

  // ── Platform breakdown ───────────────────────────────────────
  const platformViews: Record<string, number> = {};
  const platformCounts: Record<string, number> = {};
  for (const v of videos) {
    const row = v as Record<string, unknown>;
    const p = String(row.platform);
    platformViews[p]  = (platformViews[p]  ?? 0) + Number(row.current_views ?? 0);
    platformCounts[p] = (platformCounts[p] ?? 0) + 1;
  }

  // ── Monthly earnings chart (last 6 months, fill gaps) ───────
  const monthlyEarnings: Array<{ month: string; label: string; earnings: number; views: number }> = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
    const row = invoicesResult.rows.find(
      (r) => (r as Record<string, unknown>).month === key
    ) as Record<string, unknown> | undefined;
    monthlyEarnings.push({
      month:    key,
      label,
      earnings: Number(row?.earnings ?? 0),
      views:    Number(row?.views    ?? 0),
    });
  }

  // ── Top 10 clips ─────────────────────────────────────────────
  const topClips = videos.slice(0, 10).map((v) => {
    const row = v as Record<string, unknown>;
    return {
      id:                  row.id,
      platform:            row.platform,
      url:                 row.url,
      title:               row.title,
      current_views:       Number(row.current_views ?? 0),
      views_at_last_invoice: Number(row.views_at_last_invoice ?? 0),
      verification_status: row.verification_status,
      discrepancy_status:  row.discrepancy_status,
      proof_url:           row.proof_url,
      proof_status:        row.proof_status,
      is_flagged:          !!row.is_flagged,
      last_scraped_at:     row.last_scraped_at,
      created_at:          row.created_at,
    };
  });

  // ── Status distribution ──────────────────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const v of videos) {
    const row = v as Record<string, unknown>;
    let status = 'submitted';
    if (row.is_flagged) status = 'rejected';
    else if (row.proof_status === 'submitted') status = 'under_review';
    else if (row.discrepancy_status === 'critical_difference' || row.discrepancy_status === 'suspicious_difference') {
      status = row.proof_url ? 'under_review' : 'manual_proof_required';
    } else if (row.verification_status === 'verified') status = 'verified';
    else if (row.verification_status === 'partially_verified') status = 'partially_verified';
    else if (row.last_scraped_at) status = 'syncing';
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return NextResponse.json({
    // Summary
    videoCount,
    totalViews,
    viewsThisMonth,
    avgViews,
    totalEarnings,
    unbilledViews,
    unbilledAmount,
    ratePerView: auth.rate_per_view,

    // Reliability
    reliabilityScore:  scoreRow ? Number(scoreRow.score)            : null,
    trustScore:        scoreRow ? Number(scoreRow.trust_score)       : null,
    performanceScore:  scoreRow ? Number(scoreRow.performance_score) : null,

    // Lists
    topClips,
    platformViews,
    platformCounts,
    statusCounts,
    monthlyEarnings,
  });
}
