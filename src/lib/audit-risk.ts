/**
 * audit-risk.ts — Monthly audit fraud / quality risk scoring engine.
 *
 * Pure functions, no imports from server-only modules.
 * Safe to import from both API routes and "use client" components.
 */

// ── Types ─────────────────────────────────────────────────────────────────
export type DataSource   = 'official_api' | 'manual_proof' | 'mixed_source' | 'unavailable';
export type AuditStatus  = 'pending' | 'proof_requested' | 'under_review' | 'approved' | 'flagged' | 'rejected';
export type RiskLevel    = 'low' | 'medium' | 'high' | 'critical';

export interface GeoEntry {
  code:   string;  // ISO 3166-1 alpha-2 (e.g. "DE")
  name:   string;
  pct:    number;  // 0–100, percentage of total views
  views?: number;
}

export interface RiskInput {
  platform:          string;
  total_views:       number;
  total_clips:       number;
  total_likes:       number | null;
  total_comments:    number | null;
  total_shares:      number | null;
  top_countries:     GeoEntry[];
  data_source:       DataSource;
  has_proof_files:   boolean;
  prev_month_views:  number | null;
}

export interface RiskResult {
  score:        number;  // 0–100 total
  geo:          number;
  engagement:   number;
  spike:        number;
  data_quality: number;
  flags:        string[];
}

// ── Geo risk (max 30) ─────────────────────────────────────────────────────
// Uses risk signals — no country blacklists.
// Signals:
//   1. Single-country concentration
//   2. Very low primary-market presence  (DACH + English-speaking West)
//   3. Suspiciously uniform multi-country split  (bot-farm pattern)

const DACH    = new Set(['DE', 'AT', 'CH']);
const ENGLISH = new Set(['US', 'GB', 'CA', 'AU', 'NZ', 'IE']);

function geoRisk(countries: GeoEntry[]): { score: number; flags: string[] } {
  if (!countries.length) return { score: 10, flags: ['geo_no_data'] };

  const flags: string[] = [];
  let score = 0;

  // 1. Top-country concentration
  const top = countries[0];
  if (top.pct >= 95) { score += 30; flags.push('geo_extreme_concentration'); }
  else if (top.pct >= 80) { score += 18; flags.push('geo_high_concentration'); }
  else if (top.pct >= 70) { score += 8;  flags.push('geo_moderate_concentration'); }

  // 2. Primary market share
  const primaryPct = countries
    .filter(c => DACH.has(c.code) || ENGLISH.has(c.code))
    .reduce((s, c) => s + c.pct, 0);

  if (countries.length >= 3) {
    if (primaryPct < 5)  { score += 15; flags.push('geo_mismatch'); }
    else if (primaryPct < 15) { score += 6; flags.push('geo_low_primary_market'); }
  }

  // 3. Artificially uniform distribution
  if (countries.length >= 5) {
    const top5   = countries.slice(0, 5);
    const avg5   = top5.reduce((s, c) => s + c.pct, 0) / 5;
    const maxDev = Math.max(...top5.map(c => Math.abs(c.pct - avg5)));
    if (maxDev < 5 && avg5 < 25) { score += 12; flags.push('geo_artificial_distribution'); }
  }

  return { score: Math.min(score, 30), flags };
}

// ── Engagement risk (max 30) ──────────────────────────────────────────────
// Platform-calibrated thresholds (loose industry averages).

const ENG_THRESH: Record<string, { low: number; very_low: number }> = {
  youtube:   { low: 1.0, very_low: 0.3 },
  tiktok:    { low: 3.0, very_low: 1.0 },
  instagram: { low: 2.0, very_low: 0.5 },
  facebook:  { low: 0.5, very_low: 0.1 },
};

function engagementRisk(
  views: number,
  likes: number | null,
  comments: number | null,
  shares: number | null,
  platform: string,
): { score: number; flags: string[] } {
  if (likes === null && comments === null && shares === null)
    return { score: 15, flags: ['no_engagement_data'] };

  if (views <= 0) return { score: 0, flags: [] };

  const total = (likes ?? 0) + (comments ?? 0) + (shares ?? 0);
  const rate  = (total / views) * 100;
  const thr   = ENG_THRESH[platform] ?? { low: 1.0, very_low: 0.3 };

  const flags: string[] = [];
  let score = 0;

  if (rate < thr.very_low)      { score += 30; flags.push('engagement_very_low'); }
  else if (rate < thr.low)      { score += 15; flags.push('engagement_low'); }
  else if (rate < thr.low * 2)  { score += 5; }

  return { score: Math.min(score, 30), flags };
}

// ── Spike risk (max 20) ───────────────────────────────────────────────────

function spikeRisk(
  current: number,
  prev: number | null,
): { score: number; flags: string[] } {
  if (!prev) return { score: 5, flags: ['no_baseline'] };

  const growth = ((current - prev) / prev) * 100;
  if (growth > 500) return { score: 20, flags: ['spike_extreme'] };
  if (growth > 200) return { score: 12, flags: ['spike_high'] };
  if (growth > 100) return { score: 5,  flags: ['spike_moderate'] };
  return { score: 0, flags: [] };
}

// ── Data-quality risk (max 20) ────────────────────────────────────────────

function dataQualityRisk(
  source: DataSource,
  hasFiles: boolean,
): { score: number; flags: string[] } {
  switch (source) {
    case 'unavailable':   return { score: 20, flags: ['no_data_source'] };
    case 'manual_proof':  return hasFiles
                            ? { score: 5,  flags: ['manual_only'] }
                            : { score: 15, flags: ['no_proof_files'] };
    case 'mixed_source':  return { score: 3,  flags: [] };
    case 'official_api':  return { score: 0,  flags: [] };
  }
}

// ── Main scorer ───────────────────────────────────────────────────────────

export function scoreAuditRisk(input: RiskInput): RiskResult {
  const g = geoRisk(input.top_countries);
  const e = engagementRisk(
    input.total_views, input.total_likes,
    input.total_comments, input.total_shares, input.platform,
  );
  const s  = spikeRisk(input.total_views, input.prev_month_views);
  const dq = dataQualityRisk(input.data_source, input.has_proof_files);

  return {
    score:        Math.min(g.score + e.score + s.score + dq.score, 100),
    geo:          g.score,
    engagement:   e.score,
    spike:        s.score,
    data_quality: dq.score,
    flags:        [...g.flags, ...e.flags, ...s.flags, ...dq.flags],
  };
}

// ── Risk level ────────────────────────────────────────────────────────────

export function riskLevel(score: number): RiskLevel {
  if (score >= 76) return 'critical';
  if (score >= 51) return 'high';
  if (score >= 26) return 'medium';
  return 'low';
}

export const RISK_CFG: Record<RiskLevel, {
  label: string; badge: string; dot: string; text: string; rowCls: string;
}> = {
  low:      { label: 'Niedrig',  badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400',               text: 'text-emerald-400', rowCls: '' },
  medium:   { label: 'Mittel',   badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',   dot: 'bg-yellow-400',                text: 'text-yellow-400',  rowCls: '' },
  high:     { label: 'Hoch',     badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',   dot: 'bg-orange-400',                text: 'text-orange-400',  rowCls: '' },
  critical: { label: 'Kritisch', badge: 'bg-red-500/15 text-red-400 border-red-500/25',            dot: 'bg-red-500 animate-pulse',     text: 'text-red-400',     rowCls: 'bg-red-500/[0.03]' },
};

// ── Flag labels (German) ──────────────────────────────────────────────────

export const FLAG_LABELS: Record<string, string> = {
  geo_extreme_concentration:   'Extreme geo. Konzentration (>95 % ein Land)',
  geo_high_concentration:      'Hohe geo. Konzentration (>80 % ein Land)',
  geo_moderate_concentration:  'Moderate geo. Konzentration (>70 % ein Land)',
  geo_mismatch:                'Geo-Diskrepanz: kaum Aufrufe aus Zielmarkt',
  geo_low_primary_market:      'Geringer Anteil DACH/Anglosphere',
  geo_artificial_distribution: 'Auffällig gleichmäßige Länderverteilung',
  geo_no_data:                 'Keine Geo-Daten vorhanden',
  no_engagement_data:          'Keine Engagement-Daten',
  engagement_very_low:         'Sehr niedrige Engagement-Rate (unter Plattform-Minimum)',
  engagement_low:              'Niedrige Engagement-Rate',
  spike_extreme:               'Extremer Views-Anstieg (>500 % ggü. Vormonat)',
  spike_high:                  'Hoher Views-Anstieg (>200 % ggü. Vormonat)',
  spike_moderate:              'Moderater Views-Anstieg (>100 % ggü. Vormonat)',
  no_baseline:                 'Kein Vormonat-Vergleich verfügbar',
  no_data_source:              'Keine Datenquelle angegeben',
  no_proof_files:              'Kein Nachweis hochgeladen',
  manual_only:                 'Nur manueller Nachweis — keine API-Verifizierung',
};

// ── Display configs ───────────────────────────────────────────────────────

export const AUDIT_STATUS_CFG: Record<AuditStatus, { label: string; badge: string }> = {
  pending:         { label: 'Ausstehend',            badge: 'bg-muted/30 text-muted-foreground border-border' },
  proof_requested: { label: 'Nachweis angefordert',  badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  under_review:    { label: 'In Prüfung',            badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  approved:        { label: 'Genehmigt',             badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  flagged:         { label: 'Verdächtig',            badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
  rejected:        { label: 'Abgelehnt',             badge: 'bg-red-500/15 text-red-400 border-red-500/25' },
};

export const DATA_SOURCE_CFG: Record<DataSource, { label: string; badge: string }> = {
  official_api:  { label: 'Offizielle API',      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  manual_proof:  { label: 'Manueller Nachweis',  badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  mixed_source:  { label: 'Gemischt',            badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  unavailable:   { label: 'Nicht verfügbar',     badge: 'bg-muted/30 text-muted-foreground border-border' },
};

export const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook',
};

// ── Engagement rate helper ────────────────────────────────────────────────

export function calcEngagementRate(
  views: number,
  likes: number | null,
  comments: number | null,
  shares: number | null,
): number | null {
  if (views <= 0) return null;
  if (likes === null && comments === null && shares === null) return null;
  return ((( likes ?? 0) + (comments ?? 0) + (shares ?? 0)) / views) * 100;
}
