import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();
  const cutterId = auth.id;

  const videoCountResult = await db.execute({
    sql: `SELECT COUNT(*) as count FROM cutter_videos WHERE cutter_id = ?`,
    args: [cutterId],
  });
  const videoCount = videoCountResult.rows[0] as { count: number };

  const totalViewsResult = await db.execute({
    sql: `SELECT COALESCE(SUM(current_views), 0) as total FROM cutter_videos WHERE cutter_id = ?`,
    args: [cutterId],
  });
  const totalViews = totalViewsResult.rows[0] as { total: number };

  const totalEarningsResult = await db.execute({
    sql: `SELECT COALESCE(SUM(total_amount), 0) as total FROM cutter_invoices WHERE cutter_id = ?`,
    args: [cutterId],
  });
  const totalEarnings = totalEarningsResult.rows[0] as { total: number };

  const earnings30dResult = await db.execute({
    sql: `SELECT COALESCE(SUM(total_amount), 0) as total FROM cutter_invoices
       WHERE cutter_id = ? AND created_at > datetime('now', '-30 days')`,
    args: [cutterId],
  });
  const earnings30d = earnings30dResult.rows[0] as { total: number };

  const unbilledViewsResult = await db.execute({
    sql: `SELECT COALESCE(SUM(current_views - views_at_last_invoice), 0) as total
       FROM cutter_videos WHERE cutter_id = ? AND current_views > views_at_last_invoice`,
    args: [cutterId],
  });
  const unbilledViews = unbilledViewsResult.rows[0] as { total: number };

  const unbilledAmount = unbilledViews.total * auth.rate_per_view;

  // Onboarding status
  const profileComplete = !!(auth.company_name && auth.company_address && auth.tax_id && auth.iban);

  const accountCountResult = await db.execute({
    sql: `SELECT COUNT(*) as count FROM cutter_accounts WHERE cutter_id = ?`,
    args: [cutterId],
  });
  const hasAccounts = (accountCountResult.rows[0] as { count: number }).count > 0;

  const hasVideos = videoCount.count > 0;

  // Reliability score
  const scoreResult = await db.execute({
    sql: `SELECT score, trust_score, performance_score,
                 claim_accuracy_score, completeness_score, proof_score, behavioral_score
          FROM reliability_scores WHERE cutter_id = ?`,
    args: [cutterId],
  });
  const scoreRow = scoreResult.rows[0] as Record<string, unknown> | undefined;
  const reliabilityScore = scoreRow ? Number(scoreRow.score) : 100;
  const trustScore       = scoreRow ? Number(scoreRow.trust_score) : 0;
  const performanceScore = scoreRow ? Number(scoreRow.performance_score) : 0;

  return NextResponse.json({
    videoCount: videoCount.count,
    totalViews: totalViews.total,
    totalEarnings: totalEarnings.total,
    earnings30d: earnings30d.total,
    unbilledViews: unbilledViews.total,
    unbilledAmount,
    ratePerView: auth.rate_per_view,
    reliabilityScore,
    trustScore,
    performanceScore,
    onboarding: {
      profileComplete,
      hasAccounts,
      hasVideos,
    },
  });
}
