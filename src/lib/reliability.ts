/**
 * Reliability Scoring Engine — v2
 *
 * SCORE ARCHITECTURE
 * ══════════════════
 * Total Score (0–100) = Trust Score × 0.70 + Performance Score × 0.30
 *
 * TRUST SCORE (0–100)
 *   ├─ Claim Accuracy    (0–35)  — how accurate claimed vs verified views
 *   ├─ Completeness      (0–20)  — % of clips with claimed_views filled in
 *   ├─ Proof Track Record(0–20)  — proof approval rate, anti-gaming capped
 *   └─ Behavioral        (0–25)  — starts full, penalised per flag/critical
 *
 * PERFORMANCE SCORE (0–100)
 *   ├─ Volume            (0–40)  — total clips submitted (log scale)
 *   ├─ Avg Views         (0–40)  — average views per clip (log scale)
 *   └─ Platform Mix      (0–20)  — diversity across platforms
 *
 * ANTI-GAMING RULES
 *   · High proof volume doesn't equal high trust (proof_score capped at 16 if >8 approved)
 *   · High views cannot compensate for false claims (trust weighted 70%)
 *   · Low-volume accurate cutters still score well on trust
 *   · Neutral defaults for new cutters with no data (not punished)
 *
 * LABELS:  85–100 Excellent · 70–84 Strong · 50–69 Average · 30–49 Risky · 0–29 Critical
 */

import { randomUUID } from 'crypto';
import type { DbClient } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────

export interface RawStats {
  total_videos: number;
  verified_count: number;
  accurate_count: number;      // match + minor_difference
  verifiable_count: number;    // has any discrepancy data
  suspicious_count: number;
  critical_count: number;
  proof_approved_count: number;
  proof_rejected_count: number;
  has_claimed_count: number;   // clips with claimed_views filled
  flagged_count: number;
  avg_views: number;
  total_views: number;
  platform_count: number;
}

export interface ScoreBreakdown {
  // Combined
  score: number;               // 0–100 (final)

  // Trust sub-score
  trustScore: number;          // 0–100
  claimAccuracy: number;       // 0–35
  completeness: number;        // 0–20
  proofRecord: number;         // 0–20
  behavioral: number;          // 0–25

  // Performance sub-score
  performanceScore: number;    // 0–100
  volumeScore: number;         // 0–40
  viewsScore: number;          // 0–40
  platformScore: number;       // 0–20

  // Raw stats (for UI explanations)
  totalVideos: number;
  verifiedCount: number;
  accurateCount: number;
  verifiableCount: number;
  suspiciousCount: number;
  criticalCount: number;
  proofApprovedCount: number;
  proofRejectedCount: number;
  flaggedCount: number;
  avgViews: number;
  totalViews: number;
  platformCount: number;
  completenessRate: number;    // 0–1 float
}

export type ScoreLabel = 'excellent' | 'strong' | 'average' | 'risky' | 'critical';

export interface ScoreLabelMeta {
  label: string;
  labelDe: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const SCORE_LABELS: Record<ScoreLabel, ScoreLabelMeta> = {
  excellent: {
    label: 'Excellent',       labelDe: 'Ausgezeichnet',
    color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30',
  },
  strong: {
    label: 'Strong',          labelDe: 'Stark',
    color: 'text-green-400',   bgColor: 'bg-green-500/10',   borderColor: 'border-green-500/30',
  },
  average: {
    label: 'Average',         labelDe: 'Durchschnittlich',
    color: 'text-yellow-400',  bgColor: 'bg-yellow-500/10',  borderColor: 'border-yellow-500/30',
  },
  risky: {
    label: 'Risky',           labelDe: 'Riskant',
    color: 'text-orange-400',  bgColor: 'bg-orange-500/10',  borderColor: 'border-orange-500/30',
  },
  critical: {
    label: 'Critical',        labelDe: 'Kritisch',
    color: 'text-red-400',     bgColor: 'bg-red-500/10',     borderColor: 'border-red-500/30',
  },
};

export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 50) return 'average';
  if (score >= 30) return 'risky';
  return 'critical';
}

// ── Core Calculation ──────────────────────────────────────────

export function computeScoreBreakdown(stats: RawStats): ScoreBreakdown {
  const {
    total_videos, verified_count, accurate_count, verifiable_count,
    suspicious_count, critical_count, proof_approved_count,
    proof_rejected_count, has_claimed_count, flagged_count,
    avg_views, total_views, platform_count,
  } = stats;

  // ── TRUST SCORE ─────────────────────────────────────────────

  // 1. Claim Accuracy (0–35)
  // Measures: how often submitted views match verified data
  // Anti-gaming: suspicious/critical clips apply direct penalty points
  let claimAccuracy: number;
  if (verifiable_count === 0) {
    // No verifiable clips yet — neutral, not punished
    claimAccuracy = 18;
  } else {
    const matchRate = accurate_count / verifiable_count;
    const base = matchRate * 35;
    const penalty = suspicious_count * 5 + critical_count * 12;
    claimAccuracy = Math.max(0, Math.min(35, Math.round(base - penalty)));
  }

  // 2. Submission Completeness (0–20)
  // Measures: do they bother to fill in claimed_views?
  const completenessRate = total_videos > 0 ? has_claimed_count / total_videos : 1;
  const completeness = total_videos === 0
    ? 12 // neutral for new cutter
    : Math.round(completenessRate * 20);

  // 3. Proof Track Record (0–20)
  // Measures: when proofs were needed, were they valid?
  // Anti-gaming: proof volume alone can't push this above 16 (max 16 if >8 approved)
  // Logic: absence of proof requests is also fine (neutral 14)
  let proofRecord: number;
  const proofTotal = proof_approved_count + proof_rejected_count;
  if (proofTotal === 0) {
    proofRecord = 14; // no history — neutral-positive
  } else {
    const approvalRate = proof_approved_count / proofTotal;
    let raw = Math.round(approvalRate * 20);
    // High proof volume cap: too many proofs approved signals scrutiny, not virtue
    if (proof_approved_count > 8) raw = Math.min(raw, 16);
    proofRecord = raw;
  }

  // 4. Behavioral Score (0–25)
  // Measures: no flags, no repeated critical violations
  // Starts at full 25, penalties are permanent
  let behavioral = 25;
  behavioral -= flagged_count * 6;
  behavioral -= critical_count * 3;
  behavioral = Math.max(0, behavioral);

  const trustScore = Math.min(100, claimAccuracy + completeness + proofRecord + behavioral);

  // ── PERFORMANCE SCORE ────────────────────────────────────────

  // 1. Volume (0–40) — log-ish scale
  let volumeScore: number;
  if (total_videos === 0) volumeScore = 0;
  else if (total_videos <= 3)  volumeScore = 10;
  else if (total_videos <= 8)  volumeScore = 18;
  else if (total_videos <= 20) volumeScore = 27;
  else if (total_videos <= 40) volumeScore = 33;
  else volumeScore = 40;

  // 2. Average Views per Clip (0–40) — log scale
  let viewsScore: number;
  if (avg_views === 0)                viewsScore = 0;
  else if (avg_views < 1_000)         viewsScore = 8;
  else if (avg_views < 5_000)         viewsScore = 16;
  else if (avg_views < 20_000)        viewsScore = 24;
  else if (avg_views < 100_000)       viewsScore = 32;
  else if (avg_views < 500_000)       viewsScore = 37;
  else                                viewsScore = 40;

  // 3. Platform Diversity (0–20)
  let platformScore: number;
  if (platform_count === 0) platformScore = 0;
  else if (platform_count === 1) platformScore = 8;
  else if (platform_count === 2) platformScore = 14;
  else platformScore = 20;

  const performanceScore = Math.min(100, volumeScore + viewsScore + platformScore);

  // ── COMBINED (70% trust, 30% performance) ────────────────────
  const score = Math.round(trustScore * 0.70 + performanceScore * 0.30);

  return {
    score,
    trustScore,
    claimAccuracy,
    completeness,
    proofRecord,
    behavioral,
    performanceScore,
    volumeScore,
    viewsScore,
    platformScore,
    totalVideos: total_videos,
    verifiedCount: verified_count,
    accurateCount: accurate_count,
    verifiableCount: verifiable_count,
    suspiciousCount: suspicious_count,
    criticalCount: critical_count,
    proofApprovedCount: proof_approved_count,
    proofRejectedCount: proof_rejected_count,
    flaggedCount: flagged_count,
    avgViews: avg_views,
    totalViews: total_views,
    platformCount: platform_count,
    completenessRate,
  };
}

// ── DB Integration ────────────────────────────────────────────

export async function recalculateReliabilityScore(db: DbClient, cutterId: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT
      COUNT(*) as total_videos,
      SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) as verified_count,
      SUM(CASE WHEN discrepancy_status IN ('match','minor_difference') THEN 1 ELSE 0 END) as accurate_count,
      SUM(CASE WHEN discrepancy_status IN ('match','minor_difference','suspicious_difference','critical_difference') THEN 1 ELSE 0 END) as verifiable_count,
      SUM(CASE WHEN discrepancy_status = 'suspicious_difference' THEN 1 ELSE 0 END) as suspicious_count,
      SUM(CASE WHEN discrepancy_status = 'critical_difference' THEN 1 ELSE 0 END) as critical_count,
      SUM(CASE WHEN proof_status IN ('proof_approved','approved') THEN 1 ELSE 0 END) as proof_approved_count,
      SUM(CASE WHEN proof_status IN ('proof_rejected','rejected') THEN 1 ELSE 0 END) as proof_rejected_count,
      SUM(CASE WHEN claimed_views IS NOT NULL THEN 1 ELSE 0 END) as has_claimed_count,
      SUM(CASE WHEN is_flagged = 1 THEN 1 ELSE 0 END) as flagged_count,
      COALESCE(CAST(AVG(current_views) AS INTEGER), 0) as avg_views,
      COALESCE(SUM(current_views), 0) as total_views,
      COUNT(DISTINCT platform) as platform_count
    FROM cutter_videos WHERE cutter_id = ?`,
    args: [cutterId],
  });

  const row = result.rows[0] as Record<string, unknown>;
  const stats: RawStats = {
    total_videos:          Number(row.total_videos)          || 0,
    verified_count:        Number(row.verified_count)        || 0,
    accurate_count:        Number(row.accurate_count)        || 0,
    verifiable_count:      Number(row.verifiable_count)      || 0,
    suspicious_count:      Number(row.suspicious_count)      || 0,
    critical_count:        Number(row.critical_count)        || 0,
    proof_approved_count:  Number(row.proof_approved_count)  || 0,
    proof_rejected_count:  Number(row.proof_rejected_count)  || 0,
    has_claimed_count:     Number(row.has_claimed_count)     || 0,
    flagged_count:         Number(row.flagged_count)         || 0,
    avg_views:             Number(row.avg_views)             || 0,
    total_views:           Number(row.total_views)           || 0,
    platform_count:        Number(row.platform_count)        || 0,
  };

  const bd = computeScoreBreakdown(stats);

  // Upsert main score row
  await db.execute({
    sql: `INSERT INTO reliability_scores (
            id, cutter_id, score, trust_score, performance_score,
            claim_accuracy_score, completeness_score, proof_score, behavioral_score,
            volume_score, views_score, platform_score,
            total_videos, verified_count, accurate_count, verifiable_count,
            suspicious_count, critical_count, proof_approved_count, proof_rejected_count,
            flagged_count, avg_views, total_views, platform_count, completeness_rate,
            last_calculated_at
          )
          VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?, datetime('now'))
          ON CONFLICT(cutter_id) DO UPDATE SET
            score=excluded.score, trust_score=excluded.trust_score,
            performance_score=excluded.performance_score,
            claim_accuracy_score=excluded.claim_accuracy_score,
            completeness_score=excluded.completeness_score,
            proof_score=excluded.proof_score, behavioral_score=excluded.behavioral_score,
            volume_score=excluded.volume_score, views_score=excluded.views_score,
            platform_score=excluded.platform_score,
            total_videos=excluded.total_videos, verified_count=excluded.verified_count,
            accurate_count=excluded.accurate_count, verifiable_count=excluded.verifiable_count,
            suspicious_count=excluded.suspicious_count, critical_count=excluded.critical_count,
            proof_approved_count=excluded.proof_approved_count,
            proof_rejected_count=excluded.proof_rejected_count,
            flagged_count=excluded.flagged_count, avg_views=excluded.avg_views,
            total_views=excluded.total_views, platform_count=excluded.platform_count,
            completeness_rate=excluded.completeness_rate,
            last_calculated_at=excluded.last_calculated_at`,
    args: [
      randomUUID(), cutterId,
      bd.score, bd.trustScore, bd.performanceScore,
      bd.claimAccuracy, bd.completeness, bd.proofRecord, bd.behavioral,
      bd.volumeScore, bd.viewsScore, bd.platformScore,
      stats.total_videos, stats.verified_count, stats.accurate_count, stats.verifiable_count,
      stats.suspicious_count, stats.critical_count,
      stats.proof_approved_count, stats.proof_rejected_count,
      stats.flagged_count, stats.avg_views, stats.total_views, stats.platform_count,
      Math.round(bd.completenessRate * 100),
    ],
  });

  // Write history entry (once per calendar day per cutter)
  await db.execute({
    sql: `INSERT INTO reliability_score_history (id, cutter_id, score, trust_score, performance_score, calculated_at)
          SELECT ?, ?, ?, ?, ?, datetime('now')
          WHERE NOT EXISTS (
            SELECT 1 FROM reliability_score_history
            WHERE cutter_id = ? AND date(calculated_at) = date('now')
          )`,
    args: [randomUUID(), cutterId, bd.score, bd.trustScore, bd.performanceScore, cutterId],
  });

  return bd.score;
}
