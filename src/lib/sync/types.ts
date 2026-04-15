export type SupportedPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

export interface VideoData {
  externalId: string;
  url: string;
  title: string;
  viewCount: number;
  publishedAt: string | null;
  platform: SupportedPlatform;
}

export interface SyncResult {
  cutterId: string;
  cutterName: string;
  platform: SupportedPlatform;
  accountHandle: string;
  videosFound: number;
  videosCreated: number;
  videosUpdated: number;
  error?: string;
  durationMs: number;
}

export interface CutterAccount {
  id: string;
  cutterId: string;
  cutterName: string;
  platform: SupportedPlatform;
  accountHandle: string;
  accountUrl: string | null;
  youtubeChannelId: string | null;
  oauthAccessToken: string | null;
  instagramUserId: string | null;
}
