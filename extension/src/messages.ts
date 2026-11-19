import type { LyricsRecord, TrackGuess } from '@lyrics-overlay/core';

/** Event DOM dari page.js (main world) ke content.js. */
export const VIDEO_EVENT = 'lyrics-overlay:video';
/** Event DOM dari content.js yang meminta page.js mengirim data terbaru. */
export const PING_EVENT = 'lyrics-overlay:ping';

export interface VideoPayload {
  videoId: string;
  title: string;
  author: string;
  /** Kategori video, misalnya "Music". Kosong kalau belum diketahui. */
  category: string;
  /** Durasi video dalam detik, 0 kalau belum diketahui. */
  duration: number;
  /** Sedang menayangkan iklan. */
  ad: boolean;
}

export interface FindLyricsRequest {
  type: 'find-lyrics';
  title: string;
  channel: string;
  duration: number;
}

export type FindLyricsResponse =
  | { ok: true; guess: TrackGuess; record: LyricsRecord | null }
  | { ok: false; error: 'rate-limited' | 'failed' };

export const COMMANDS = ['toggle-overlay', 'offset-earlier', 'offset-later'] as const;
export type CommandName = (typeof COMMANDS)[number];

export interface CommandMessage {
  type: 'command';
  command: CommandName;
}

export function isCommandName(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value);
}

export function isFindLyricsRequest(value: unknown): value is FindLyricsRequest {
  if (!isObject(value) || value.type !== 'find-lyrics') return false;
  return typeof value.title === 'string' && typeof value.channel === 'string' && typeof value.duration === 'number';
}

export function isCommandMessage(value: unknown): value is CommandMessage {
  return isObject(value) && value.type === 'command' && typeof value.command === 'string' && isCommandName(value.command);
}

export function parseVideoPayload(detail: unknown): VideoPayload | null {
  if (typeof detail !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(detail);
  } catch {
    return null;
  }
  if (!isObject(data) || typeof data.videoId !== 'string' || !data.videoId) return null;
  return {
    videoId: data.videoId,
    title: typeof data.title === 'string' ? data.title : '',
    author: typeof data.author === 'string' ? data.author : '',
    category: typeof data.category === 'string' ? data.category : '',
    duration: typeof data.duration === 'number' && Number.isFinite(data.duration) ? data.duration : 0,
    ad: data.ad === true,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
