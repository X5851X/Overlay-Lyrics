import type { LyricsCache, LyricsRecord } from '@lyrics-overlay/core';

const PREFIX = 'lyrics:';
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Lagu yang belum ada bisa ditambahkan ke LRCLIB belakangan, jadi hasil kosong cepat kedaluwarsa.
const MISS_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

interface Entry {
  value: LyricsRecord | null;
  savedAt: number;
}

/** Cache lirik di chrome.storage.local, terbatas jumlahnya, yang paling lama dibuang duluan. */
export class StorageCache implements LyricsCache {
  async get(key: string): Promise<LyricsRecord | null | undefined> {
    const storageKey = PREFIX + key;
    const stored = await chrome.storage.local.get(storageKey);
    const entry = stored[storageKey] as Entry | undefined;
    if (!entry) return undefined;
    const ttl = entry.value ? HIT_TTL_MS : MISS_TTL_MS;
    if (Date.now() - entry.savedAt > ttl) {
      await chrome.storage.local.remove(storageKey);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: LyricsRecord | null): Promise<void> {
    const entry: Entry = { value, savedAt: Date.now() };
    await chrome.storage.local.set({ [PREFIX + key]: entry });
    await this.prune();
  }

  private async prune(): Promise<void> {
    const all = await chrome.storage.local.get(null);
    const entries = Object.entries(all).filter(([key]) => key.startsWith(PREFIX)) as [string, Entry][];
    if (entries.length <= MAX_ENTRIES) return;
    entries.sort((a, b) => a[1].savedAt - b[1].savedAt);
    await chrome.storage.local.remove(entries.slice(0, entries.length - MAX_ENTRIES).map(([key]) => key));
  }
}
