/** Satu baris lirik bertimestamp. */
export interface LyricLine {
  /** Waktu mulai baris, dalam detik sejak awal lagu. */
  time: number;
  /** Teks baris. Kosong berarti jeda (bagian instrumental). */
  text: string;
}

export interface ParsedLrc {
  /** Baris lirik, urut berdasarkan waktu. */
  lines: LyricLine[];
  /** Tag metadata seperti ti, ar, al, length, dan offset. Kuncinya huruf kecil. */
  meta: Record<string, string>;
}

// [mm:ss], [mm:ss.x], [mm:ss.xx], [mm:ss.xxx], dan varian [mm:ss:xx]
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/y;
const META_TAG = /^\[([A-Za-z#]+):(.*)\]$/;
// Timestamp per kata dari format LRC "enhanced", misalnya <00:12.34>
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

export function parseLrc(input: string): ParsedLrc {
  const lines: LyricLine[] = [];
  const meta: Record<string, string> = {};

  for (const rawLine of input.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const times: number[] = [];
    let pos = 0;
    for (;;) {
      TIME_TAG.lastIndex = pos;
      const match = TIME_TAG.exec(line);
      if (!match) break;
      times.push(toSeconds(match[1] ?? '0', match[2] ?? '0', match[3]));
      pos = TIME_TAG.lastIndex;
      while (line[pos] === ' ') pos++;
    }

    if (times.length > 0) {
      const text = line.slice(pos).replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
      for (const time of times) lines.push({ time, text });
      continue;
    }

    const tag = META_TAG.exec(line);
    if (tag?.[1] !== undefined) meta[tag[1].toLowerCase()] = (tag[2] ?? '').trim();
  }

  // Menurut format LRC, offset positif (milidetik) membuat lirik muncul lebih awal.
  const offsetMs = Number(meta.offset ?? 0);
  if (Number.isFinite(offsetMs) && offsetMs !== 0) {
    for (const line of lines) line.time = round3(Math.max(0, line.time - offsetMs / 1000));
  }

  lines.sort((a, b) => a.time - b.time);
  return { lines, meta };
}

function toSeconds(minutes: string, seconds: string, fraction: string | undefined): number {
  const part = fraction ? Number(fraction) / 10 ** fraction.length : 0;
  return round3(Number(minutes) * 60 + Number(seconds) + part);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
