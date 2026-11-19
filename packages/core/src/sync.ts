import type { LyricLine } from './lrc';

/** Indeks baris terakhir yang waktunya sudah lewat. -1 kalau belum sampai baris pertama. */
export function lineIndexAt(lines: readonly LyricLine[], position: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const line = lines[mid];
    if (line && line.time <= position) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export interface PlaybackState {
  /** Posisi putar dalam detik. */
  position: number;
  playing: boolean;
  /** Kecepatan putar. Default 1. */
  rate?: number;
}

/**
 * Menentukan baris aktif dari posisi putar.
 *
 * Di antara dua pembaruan, posisi diperkirakan dari jam. Jadi sumber yang jarang mengirim posisi
 * (misalnya kontrol media Windows) tetap terasa mulus. Seek cukup dikirim sebagai pembaruan biasa.
 */
export class SyncEngine {
  private lines: readonly LyricLine[] = [];
  private offset = 0;
  private basePosition = 0;
  private baseTime = 0;
  private playing = false;
  private rate = 1;
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  setLines(lines: readonly LyricLine[]): void {
    this.lines = lines;
  }

  /** Menggeser lirik dalam detik. Positif berarti lirik muncul lebih lambat. */
  setOffset(seconds: number): void {
    this.offset = seconds;
  }

  getOffset(): number {
    return this.offset;
  }

  update(state: PlaybackState): void {
    this.basePosition = Math.max(0, state.position);
    this.baseTime = this.now();
    this.playing = state.playing;
    this.rate = state.rate ?? 1;
  }

  /** Perkiraan posisi putar saat ini, dalam detik. */
  position(): number {
    if (!this.playing) return this.basePosition;
    return this.basePosition + ((this.now() - this.baseTime) / 1000) * this.rate;
  }

  activeIndex(): number {
    return lineIndexAt(this.lines, this.position() - this.offset);
  }
}
