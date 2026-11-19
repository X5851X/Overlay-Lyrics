import type { LyricsCache } from './cache';

/** Data lirik dari LRCLIB, sudah dirapikan. */
export interface LyricsRecord {
  id: number;
  track: string;
  artist: string;
  album: string;
  /** Durasi lagu dalam detik. */
  duration: number;
  instrumental: boolean;
  /** Lirik format LRC, atau null kalau tidak ada versi tersinkron. */
  synced: string | null;
  plain: string | null;
}

export interface LyricsQuery {
  track: string;
  artist: string;
  album?: string;
  /** Durasi lagu yang sedang diputar, dalam detik. Membantu memilih versi yang tepat. */
  duration?: number;
  /** Judul tanpa keterangan dalam kurung, untuk pencarian cadangan. */
  trackBare?: string;
  /** Teks untuk pencarian bebas. */
  query?: string;
}

export interface LrclibClientOptions {
  baseUrl?: string;
  /** Nama dan versi aplikasi. LRCLIB meminta setiap klien memperkenalkan diri. */
  clientName?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  cache?: LyricsCache;
  /** Jeda minimal antar permintaan, dalam milidetik. */
  minGapMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

export class LrclibError extends Error {
  /** Kode HTTP, atau null kalau server tidak bisa dihubungi. */
  readonly status: number | null;
  /** Detik yang harus ditunggu sebelum mencoba lagi (untuk status 429). */
  readonly retryAfter: number | null;

  constructor(message: string, status: number | null, retryAfter: number | null = null, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LrclibError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

type Params = Record<string, string | number | undefined>;

// Pencarian dengan judul saja hanya diterima kalau durasinya hampir sama.
const TITLE_ONLY_MAX_DIFF = 3;

/** Kunci cache untuk satu permintaan lirik. */
export function cacheKey(query: LyricsQuery): string {
  const norm = (text?: string) => (text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const duration = query.duration ? Math.round(query.duration) : '';
  return [norm(query.artist), norm(query.track), norm(query.album), duration].join('|');
}

/**
 * Klien LRCLIB (https://lrclib.net).
 *
 * Urutan pencarian: cocok persis (/api/get), lalu cari judul dan artis, lalu pencarian bebas,
 * lalu judul saja dengan durasi yang hampir sama. Lirik tersinkron selalu diutamakan.
 */
export class LrclibClient {
  private readonly baseUrl: string;
  private readonly clientName: string;
  private readonly fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly cache: LyricsCache | undefined;
  private readonly minGapMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private blockedUntil = 0;

  constructor(options: LrclibClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://lrclib.net';
    this.clientName = options.clientName ?? 'lyrics-overlay/0.1.0';
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.cache = options.cache;
    this.minGapMs = options.minGapMs ?? 250;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? (() => Date.now());
  }

  /** Mencari lirik. Hasilnya null kalau tidak ketemu. Gagal jaringan dilempar sebagai LrclibError. */
  async find(query: LyricsQuery): Promise<LyricsRecord | null> {
    const key = cacheKey(query);
    const cached = await this.cache?.get(key);
    if (cached !== undefined) return cached;

    const record = await this.lookup(query);
    await this.cache?.set(key, record);
    return record;
  }

  private async lookup(query: LyricsQuery): Promise<LyricsRecord | null> {
    const duration = query.duration && query.duration > 0 ? Math.round(query.duration) : undefined;
    const bare = query.trackBare || query.track;
    let fallback: LyricsRecord | null = null;

    if (query.track && query.artist) {
      const exact = await this.get({
        track_name: query.track,
        artist_name: query.artist,
        album_name: query.album,
        duration,
      });
      if (exact && (exact.synced || exact.instrumental)) return exact;
      fallback ??= exact;

      const results = await this.search({ track_name: query.track, artist_name: query.artist });
      const found = pickBest(results, { duration, title: bare, strict: false });
      if (found.synced) return found.synced;
      fallback ??= found.other;
    }

    const text = (query.query ?? `${bare} ${query.artist}`).trim();
    if (text) {
      const found = pickBest(await this.search({ q: text }), { duration, title: bare, strict: false });
      if (found.synced) return found.synced;
      fallback ??= found.other;
    }

    if (duration && bare && bare !== text) {
      const found = pickBest(await this.search({ q: bare }), { duration, title: bare, strict: true });
      if (found.synced) return found.synced;
      fallback ??= found.other;
    }

    return fallback;
  }

  private async get(params: Params): Promise<LyricsRecord | null> {
    const response = await this.request('/api/get', params);
    return response ? toRecord(await readJson(response)) : null;
  }

  private async search(params: Params): Promise<LyricsRecord[]> {
    const response = await this.request('/api/search', params);
    if (!response) return [];
    const body = await readJson(response);
    if (!Array.isArray(body)) return [];
    return body.map(toRecord).filter((record): record is LyricsRecord => record !== null);
  }

  /** Mengirim satu permintaan. Hasilnya null untuk 404. */
  private async request(path: string, params: Params): Promise<Response | null> {
    const waitUntilUnblocked = this.blockedUntil - this.now();
    if (waitUntilUnblocked > 0) {
      throw new LrclibError('Terlalu banyak permintaan ke LRCLIB', 429, Math.ceil(waitUntilUnblocked / 1000));
    }
    const gap = this.lastRequestAt + this.minGapMs - this.now();
    if (gap > 0) await sleep(gap);

    const url = new URL(path, this.baseUrl);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
    }

    let response: Response;
    try {
      response = await this.fetchFn(url.toString(), {
        headers: { Accept: 'application/json', 'Lrclib-Client': this.clientName },
        signal: timeoutSignal(this.timeoutMs),
      });
    } catch (error) {
      throw new LrclibError('Tidak bisa menghubungi LRCLIB', null, null, { cause: error });
    } finally {
      this.lastRequestAt = this.now();
    }

    if (response.status === 404) return null;
    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('Retry-After'), this.now());
      // Jitter kecil supaya klien tidak mencoba ulang bersamaan
      this.blockedUntil = this.now() + retryAfter * 1000 + Math.random() * 1000;
      throw new LrclibError('Terlalu banyak permintaan ke LRCLIB', 429, retryAfter);
    }
    if (!response.ok) throw new LrclibError(`LRCLIB membalas ${response.status}`, response.status);
    return response;
  }
}

interface PickOptions {
  duration: number | undefined;
  /** Judul yang dicari. Hasil dengan judul yang cocok diutamakan. */
  title: string;
  /** Kalau true, hasil harus cocok judulnya dan durasinya hampir sama. */
  strict: boolean;
}

/**
 * Memilih hasil tersinkron dengan durasi terdekat. Hasil yang judulnya cocok diutamakan.
 * Kalau tidak ada yang cocok, hanya hasil dengan durasi hampir sama yang dipakai.
 */
function pickBest(
  records: readonly LyricsRecord[],
  { duration, title, strict }: PickOptions,
): { synced: LyricsRecord | null; other: LyricsRecord | null } {
  const diff = (record: LyricsRecord) =>
    duration && record.duration > 0 ? Math.abs(record.duration - duration) : Number.POSITIVE_INFINITY;
  const closeEnough = (record: LyricsRecord) => diff(record) <= TITLE_ONLY_MAX_DIFF;
  const wanted = normalizeTitle(title);
  const titled = records.filter((record) => titlesMatch(normalizeTitle(record.track), wanted));

  let pool: LyricsRecord[];
  if (strict) pool = titled.filter(closeEnough);
  else pool = titled.length > 0 ? titled : records.filter(closeEnough);

  const ranked = pool
    .map((record, index) => ({ record, index, diff: diff(record) }))
    .sort((a, b) => a.diff - b.diff || a.index - b.index)
    .map((entry) => entry.record);
  return {
    synced: ranked.find((record) => record.synced) ?? null,
    other: ranked[0] ?? null,
  };
}

/** Huruf kecil, tanpa isi kurung, tanpa spasi dan tanda baca. */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[(\[【][^()\[\]【】]*[)\]】]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function titlesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

function toRecord(raw: unknown): LyricsRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'number') return null;
  return {
    id: data.id,
    track: text(data.trackName) ?? text(data.name) ?? '',
    artist: text(data.artistName) ?? '',
    album: text(data.albumName) ?? '',
    duration: typeof data.duration === 'number' ? data.duration : 0,
    instrumental: data.instrumental === true,
    synced: text(data.syncedLyrics),
    plain: text(data.plainLyrics),
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new LrclibError('Balasan LRCLIB tidak bisa dibaca', response.status, null, { cause: error });
  }
}

function parseRetryAfter(value: string | null, now: number): number {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return clamp(seconds, 1, 3600);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return clamp(Math.ceil((date - now) / 1000), 1, 3600);
  }
  return 30;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
