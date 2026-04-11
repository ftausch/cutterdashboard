/**
 * Platform capability definitions — the static truth table.
 *
 * This file describes what each platform CAN do in terms of view verification.
 * It is intentionally static: these are platform-level constraints, not
 * per-account decisions. Per-account data (actual scopes granted, token status,
 * whether view API calls succeeded) lives in the database.
 *
 * Business rule: we care about VIEWS above all other metrics.
 * Every field here is evaluated through that lens.
 */

export type Platform = 'youtube' | 'instagram' | 'facebook' | 'tiktok';

export type ConnectionStatus =
  | 'not_connected'     // no record in DB
  | 'manual'            // handle registered, no OAuth token
  | 'connecting'        // OAuth flow in progress
  | 'connected'         // OAuth token valid, views accessible
  | 'connected_limited' // OAuth token valid, but view scopes not granted
  | 'token_expired'     // had a token, now expired
  | 'permission_missing'// connected but missing required scopes
  | 'error'             // last sync returned an error
  | 'disconnected';     // was connected, manually disconnected

export type VerificationConfidence = 'high' | 'medium' | 'low' | 'none';

export interface PlatformDef {
  id: Platform;
  label: string;
  handle_label: string;        // e.g. "@channel", "Seitenname"
  placeholder: string;
  url_prefix: string;

  // Visual
  color_text: string;
  color_bg: string;
  color_border: string;
  emoji: string;

  // API access
  official_api: boolean;       // does an official API exist at all?
  oauth_supported: boolean;    // can we OAuth with this platform?
  oauth_env_vars: string[];    // which env vars must be set for OAuth to work

  // View-specific capabilities (best case — after full OAuth with all scopes)
  views_available: boolean;      // can we get view counts at all?
  views_source: 'official_api' | 'public_display' | 'none';
  clip_level_views: boolean;     // per-video/clip view count accessible?
  video_list_accessible: boolean;// can we list their videos?

  // Constraints / requirements
  requires_business_account: boolean;  // Instagram/Facebook: needs Business/Creator
  requires_page: boolean;              // Facebook: needs a Page (not personal profile)
  requires_developer_approval: boolean;// TikTok: restricted API access

  // What confidence can we achieve at best with this platform?
  max_confidence: VerificationConfidence;

  // Required OAuth scopes (what we ask for)
  required_scopes: string[];

  // UX copy
  connect_label: string;          // button text
  limitation_note: string | null; // warning shown in the UI
  capability_summary: string;     // one-line description for the card
}

export const PLATFORM_DEFS: Record<Platform, PlatformDef> = {
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    handle_label: '@Channel',
    placeholder: '@mein-kanal',
    url_prefix: 'https://youtube.com/@',
    color_text:   'text-red-400',
    color_bg:     'bg-red-500/10',
    color_border: 'border-red-500/30',
    emoji: '▶',

    official_api:  true,
    oauth_supported: true,
    oauth_env_vars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],

    views_available:       true,
    views_source:          'official_api',
    clip_level_views:      true,
    video_list_accessible: true,

    requires_business_account:   false,
    requires_page:               false,
    requires_developer_approval: false,

    max_confidence: 'high',
    required_scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
    ],

    connect_label:      'Mit YouTube verbinden',
    limitation_note:    null,
    capability_summary: 'Offizielle View-Daten pro Video via YouTube Data API v3',
  },

  instagram: {
    id: 'instagram',
    label: 'Instagram',
    handle_label: '@Username',
    placeholder: '@mein-account',
    url_prefix: 'https://instagram.com/',
    color_text:   'text-pink-400',
    color_bg:     'bg-pink-500/10',
    color_border: 'border-pink-500/30',
    emoji: '◎',

    official_api:  true,
    oauth_supported: true,
    oauth_env_vars: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],

    views_available:       true,
    views_source:          'official_api',
    clip_level_views:      true,
    video_list_accessible: true,

    requires_business_account:   true,
    requires_page:               false,
    requires_developer_approval: false,

    max_confidence: 'medium',
    required_scopes: [
      'instagram_basic',
      'instagram_manage_insights',
    ],

    connect_label:   'Mit Instagram verbinden',
    limitation_note: 'Erfordert ein Business- oder Creator-Konto. Persönliche Konten liefern keine View-Daten.',
    capability_summary: 'Video-Views via Instagram Graph API — nur Business/Creator-Konten',
  },

  facebook: {
    id: 'facebook',
    label: 'Facebook',
    handle_label: 'Seitenname',
    placeholder: 'Meine Seite',
    url_prefix: 'https://facebook.com/',
    color_text:   'text-blue-400',
    color_bg:     'bg-blue-500/10',
    color_border: 'border-blue-500/30',
    emoji: 'f',

    official_api:  true,
    oauth_supported: true,
    oauth_env_vars: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],

    views_available:       true,
    views_source:          'official_api',
    clip_level_views:      true,
    video_list_accessible: true,

    requires_business_account:   false,
    requires_page:               true,
    requires_developer_approval: false,

    max_confidence: 'medium',
    required_scopes: [
      'pages_read_engagement',
      'pages_show_list',
    ],

    connect_label:   'Mit Facebook verbinden',
    limitation_note: 'Nur Facebook-Seiten werden unterstützt. Persönliche Profile liefern keine Video-View-Daten.',
    capability_summary: 'Video-Views via Graph API — nur Facebook-Seiten (keine persönlichen Profile)',
  },

  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    handle_label: '@Handle',
    placeholder: '@mein-tiktok',
    url_prefix: 'https://tiktok.com/@',
    color_text:   'text-cyan-400',
    color_bg:     'bg-cyan-500/10',
    color_border: 'border-cyan-500/30',
    emoji: '♪',

    official_api:  true,
    oauth_supported: true,
    oauth_env_vars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],

    views_available:       true,
    views_source:          'official_api',
    clip_level_views:      true,
    video_list_accessible: true,

    requires_business_account:   false,
    requires_page:               false,
    requires_developer_approval: true,

    max_confidence: 'medium',
    required_scopes: [
      'user.info.basic',
      'video.list',
    ],

    connect_label:   'TikTok verbinden',
    limitation_note: 'API-Zugriff erfordert Genehmigung durch TikTok Developers. Wir manuell verknüpfen als Übergangslösung.',
    capability_summary: 'Play-Counts via TikTok Display API — Entwickler-Genehmigung erforderlich',
  },
};

export const PLATFORM_ORDER: Platform[] = ['youtube', 'instagram', 'tiktok', 'facebook'];

// ── Status display helpers ─────────────────────────────────────

export interface StatusMeta {
  label: string;
  color: string;    // text color class
  bg: string;       // background class
  border: string;   // border class
  dot: string;      // dot color class
}

export const CONNECTION_STATUS_META: Record<ConnectionStatus, StatusMeta> = {
  not_connected:    { label: 'Nicht verbunden', color: 'text-muted-foreground', bg: 'bg-muted/20',      border: 'border-border/50',      dot: 'bg-muted-foreground/40' },
  manual:           { label: 'Manuell',         color: 'text-yellow-400',       bg: 'bg-yellow-500/10', border: 'border-yellow-500/30',  dot: 'bg-yellow-400' },
  connecting:       { label: 'Verbinde…',       color: 'text-blue-400',         bg: 'bg-blue-500/10',   border: 'border-blue-500/30',    dot: 'bg-blue-400 animate-pulse' },
  connected:        { label: 'Verbunden',        color: 'text-emerald-400',      bg: 'bg-emerald-500/10',border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  connected_limited:{ label: 'Eingeschränkt',   color: 'text-yellow-400',       bg: 'bg-yellow-500/10', border: 'border-yellow-500/30',  dot: 'bg-yellow-400' },
  token_expired:    { label: 'Token abgelaufen', color: 'text-orange-400',      bg: 'bg-orange-500/10', border: 'border-orange-500/30',  dot: 'bg-orange-400' },
  permission_missing:{ label: 'Berechtigung fehlt',color:'text-orange-400',     bg: 'bg-orange-500/10', border: 'border-orange-500/30',  dot: 'bg-orange-400' },
  error:            { label: 'Fehler',           color: 'text-red-400',         bg: 'bg-red-500/10',    border: 'border-red-500/30',     dot: 'bg-red-400' },
  disconnected:     { label: 'Getrennt',         color: 'text-muted-foreground', bg: 'bg-muted/20',     border: 'border-border/50',      dot: 'bg-muted-foreground/40' },
};

export const CONFIDENCE_META: Record<VerificationConfidence, { label: string; color: string; bg: string; border: string }> = {
  high:   { label: 'Hoch',        color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  medium: { label: 'Mittel',      color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30'  },
  low:    { label: 'Niedrig',     color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30'  },
  none:   { label: 'Keine',       color: 'text-muted-foreground', bg: 'bg-muted/20',  border: 'border-border/50'      },
};

/** True if the platform has OAuth configured in the running environment */
export function isOAuthConfigured(envVars: string[]): boolean {
  // Only evaluable server-side; client always gets this from the API
  return envVars.every((v) => !!process.env[v]);
}
