import { describe, expect, it } from 'vitest';
import { MemoryCache } from './cache';
import { LrclibClient, LrclibError, cacheKey, type LyricsQuery } from './lrclib';

const SYNCED = '[00:01.00]Baris satu\n[00:05.00]Baris dua';

function apiRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Lagu Contoh',
    trackName: 'Lagu Contoh',
    artistName: 'Nama Artis',
    albumName: 'Album Contoh',
    duration: 200,
    instrumental: false,
    plainLyrics: 'Baris satu\nBaris dua',
    syncedLyrics: SYNCED,
    ...overrides,
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const notFound = () => json({ code: 404, name: 'TrackNotFound' }, 404);

function setup(route: (url: URL) => Response) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const client = new LrclibClient({
    cache: new MemoryCache(),
    minGapMs: 0,
    clientName: 'tes/1.0',
    fetch: async (input, init) => {
      const url = new URL(input);
      calls.push({ url, init });
      return route(url);
    },
  });
  return { client, calls };
}

const query: LyricsQuery = {
  track: 'Lagu Contoh',
  artist: 'Nama Artis',
  duration: 201.4,
  trackBare: 'Lagu Contoh',
  query: 'Lagu Contoh Nama Artis',
};

describe('LrclibClient', () => {
  it('memakai hasil /api/get yang tersinkron', async () => {
    const { client, calls } = setup(() => json(apiRecord()));
    const record = await client.find(query);

    expect(record).toMatchObject({ id: 1, track: 'Lagu Contoh', artist: 'Nama Artis', duration: 200, synced: SYNCED });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe('/api/get');
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      track_name: 'Lagu Contoh',
      artist_name: 'Nama Artis',
      duration: '201',
    });
    expect(new Headers(calls[0]?.init?.headers).get('Lrclib-Client')).toBe('tes/1.0');
  });

  it('mencari cadangan lalu memilih durasi terdekat yang tersinkron', async () => {
    const { client, calls } = setup((url) =>
      url.pathname === '/api/get'
        ? notFound()
        : json([
            apiRecord({ id: 2, duration: 260 }),
            apiRecord({ id: 3, duration: 205 }),
            apiRecord({ id: 4, duration: 202, syncedLyrics: null }),
          ]),
    );
    expect((await client.find(query))?.id).toBe(3);
    expect(calls.map((call) => call.url.pathname)).toEqual(['/api/get', '/api/search']);
  });

  it('mengutamakan judul yang cocok di pencarian bebas', async () => {
    const { client } = setup((url) => {
      if (url.pathname === '/api/get') return notFound();
      if (url.searchParams.has('track_name')) return json([]);
      return json([
        apiRecord({ id: 5, trackName: 'Lagu Lain', duration: 201 }),
        apiRecord({ id: 6, trackName: 'Lagu Contoh (Versi Album)', duration: 230 }),
      ]);
    });
    expect((await client.find(query))?.id).toBe(6);
  });

  it('pencarian judul saja hanya menerima durasi yang hampir sama', async () => {
    const { client, calls } = setup((url) => {
      if (url.pathname === '/api/get') return notFound();
      if (url.searchParams.get('q') !== 'Lagu Contoh') return json([]);
      return json([
        apiRecord({ id: 7, artistName: 'Orang Lain', duration: 240 }),
        apiRecord({ id: 8, artistName: 'Orang Lain', duration: 203 }),
      ]);
    });
    expect((await client.find(query))?.id).toBe(8);
    expect(calls.at(-1)?.url.searchParams.get('q')).toBe('Lagu Contoh');
  });

  it('memakai lirik polos kalau tidak ada yang tersinkron', async () => {
    const { client, calls } = setup((url) =>
      url.pathname === '/api/get' ? json(apiRecord({ syncedLyrics: null })) : json([]),
    );
    const record = await client.find(query);
    expect(record?.synced).toBeNull();
    expect(record?.plain).toContain('Baris satu');
    expect(calls).toHaveLength(4);
  });

  it('langsung berhenti kalau lagunya instrumental', async () => {
    const { client, calls } = setup(() => json(apiRecord({ instrumental: true, syncedLyrics: null, plainLyrics: null })));
    expect((await client.find(query))?.instrumental).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('menyimpan hasil, termasuk hasil kosong, di cache', async () => {
    const hit = setup(() => json(apiRecord()));
    await hit.client.find(query);
    await hit.client.find(query);
    expect(hit.calls).toHaveLength(1);

    const miss = setup((url) => (url.pathname === '/api/get' ? notFound() : json([])));
    expect(await miss.client.find(query)).toBeNull();
    const count = miss.calls.length;
    expect(await miss.client.find(query)).toBeNull();
    expect(miss.calls).toHaveLength(count);
  });

  it('tidak menyimpan kegagalan jaringan di cache', async () => {
    let offline = true;
    const { client } = setup(() => {
      if (offline) throw new TypeError('offline');
      return json(apiRecord());
    });
    await expect(client.find(query)).rejects.toBeInstanceOf(LrclibError);
    offline = false;
    expect((await client.find(query))?.id).toBe(1);
  });

  it('menunggu sesuai Retry-After setelah kena batas', async () => {
    let now = 1_000_000;
    const calls: string[] = [];
    const client = new LrclibClient({
      minGapMs: 0,
      now: () => now,
      fetch: async (input) => {
        calls.push(input);
        return json({}, 429, { 'Retry-After': '20' });
      },
    });

    const error = await client.find(query).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(LrclibError);
    expect(error).toMatchObject({ status: 429, retryAfter: 20 });

    await expect(client.find(query)).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(1);

    now += 22_000;
    await expect(client.find(query)).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(2);
  });
});

describe('cacheKey', () => {
  it('tidak peka huruf besar dan spasi, dan durasinya dibulatkan', () => {
    expect(cacheKey({ track: ' Lagu  Contoh', artist: 'NAMA artis', duration: 200.6 })).toBe(
      cacheKey({ track: 'lagu contoh', artist: 'Nama Artis', duration: 201 }),
    );
  });
});
