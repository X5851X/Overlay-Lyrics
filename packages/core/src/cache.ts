import type { LyricsRecord } from './lrclib';

/**
 * Tempat menyimpan hasil pencarian lirik. `undefined` berarti belum pernah dicari,
 * `null` berarti sudah dicari dan tidak ketemu.
 */
export interface LyricsCache {
  get(key: string): Promise<LyricsRecord | null | undefined>;
  set(key: string, value: LyricsRecord | null): Promise<void>;
}

/** Cache di memori. Cocok untuk tes dan untuk klien yang tidak perlu menyimpan ke disk. */
export class MemoryCache implements LyricsCache {
  private readonly entries = new Map<string, LyricsRecord | null>();

  async get(key: string): Promise<LyricsRecord | null | undefined> {
    return this.entries.get(key);
  }

  async set(key: string, value: LyricsRecord | null): Promise<void> {
    this.entries.set(key, value);
  }
}
