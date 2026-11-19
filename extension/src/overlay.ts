import type { LyricLine } from '@lyrics-overlay/core';
import css from './overlay.css';

// Ukuran desain: baris aktif 58 px, tetangga 40 px, jauh 34 px.
const SCALE_BY_DISTANCE = [1, 40 / 58, 34 / 58];
const OPACITY_BY_DISTANCE = [1, 0.8, 0.45];
const STATUS_FADE_MS = 5000;
const FLASH_MS = 1600;

/** Skala tampilan dari ukuran area, 1 untuk layar 1920 x 1080. */
export function overlayScale(width: number, height: number): number {
  const scale = Math.min(width / 1920, height / 1080);
  return Math.round(Math.min(1.2, Math.max(0.4, scale)) * 100) / 100;
}

export interface OverlayOptions {
  /** Jarak dari bawah area, sebagai nilai CSS. Default menyisakan ruang untuk kontrol pemutar. */
  bottom?: string;
}

/**
 * Tampilan lirik di dalam Shadow DOM, supaya CSS halaman tidak ikut campur.
 * Tidak punya elemen interaktif dan tidak menangkap klik.
 */
export class OverlayView {
  readonly host: HTMLElement;
  private readonly box: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private rows: HTMLDivElement[] = [];
  private labelText = '';
  private scale = 0;
  private visible = true;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: OverlayOptions = {}) {
    this.host = document.createElement('lyrics-overlay-root');
    this.host.style.cssText = 'all:initial;position:absolute;inset:0;display:block;pointer-events:none;z-index:40;';
    if (options.bottom) this.host.style.setProperty('--lo-bottom', options.bottom);

    const root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css;
    this.box = div('box');
    this.label = div('label');
    this.stage = div('stage');
    this.status = div('status');
    this.status.hidden = true;
    this.box.append(this.label, this.stage, this.status);
    root.append(style, this.box);
  }

  mountIn(parent: HTMLElement): void {
    if (this.host.parentNode !== parent) parent.append(this.host);
  }

  setScale(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    this.host.style.setProperty('--lo-scale', String(scale));
    this.measure();
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.host.style.display = visible ? 'block' : 'none';
    if (visible) this.measure();
  }

  /** Mengosongkan semuanya, misalnya saat pindah video. */
  clear(): void {
    this.rows = [];
    this.stage.replaceChildren();
    this.setLabel('', '');
    this.setStatus(null);
  }

  setLabel(track: string, artist: string): void {
    this.labelText = [track, artist].filter(Boolean).join(' · ');
    this.label.textContent = this.labelText;
  }

  /** Menampilkan pesan pengganti lirik. `fade` membuatnya hilang sendiri setelah beberapa detik. */
  setStatus(text: string | null, options: { fade?: boolean } = {}): void {
    clearTimeout(this.statusTimer);
    this.box.classList.remove('is-faded');
    this.status.textContent = text ?? '';
    this.status.hidden = text === null;
    this.stage.hidden = text !== null;
    if (text !== null && options.fade) {
      this.statusTimer = setTimeout(() => this.box.classList.add('is-faded'), STATUS_FADE_MS);
    }
  }

  /** Memasang lirik. `activeIndex` adalah baris yang sedang dinyanyikan saat lirik dimuat. */
  setLines(lines: readonly LyricLine[], activeIndex = -1): void {
    this.setStatus(null);
    this.rows = lines.map((line) => {
      const row = div('row');
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = line.text || '♪';
      row.append(text);
      return row;
    });
    // Posisi diatur sebelum dipasang, supaya baris langsung muncul di tempatnya tanpa animasi.
    this.setActive(activeIndex);
    this.stage.replaceChildren(...this.rows);
    this.measure();
  }

  /** Menandai baris aktif. Baris lain mengecil dan meredup menurut jaraknya. */
  setActive(index: number): void {
    this.rows.forEach((row, i) => {
      const distance = i - index;
      const far = Math.abs(distance);
      row.style.setProperty('--d', String(Math.max(-3, Math.min(3, distance))));
      row.style.setProperty('--s', String(SCALE_BY_DISTANCE[Math.min(far, 2)] ?? 0));
      row.style.setProperty('--o', String(OPACITY_BY_DISTANCE[far] ?? 0));
    });
  }

  /** Pesan singkat di tempat label, misalnya saat offset diubah. */
  flash(text: string): void {
    clearTimeout(this.flashTimer);
    this.box.classList.remove('is-faded');
    this.label.textContent = text;
    this.flashTimer = setTimeout(() => {
      this.label.textContent = this.labelText;
    }, FLASH_MS);
  }

  /** Baris yang terlalu panjang dikecilkan supaya tetap satu baris. */
  private measure(): void {
    if (!this.visible || this.rows.length === 0) return;
    const available = this.stage.clientWidth;
    if (available <= 0) return;
    // Baca semua lebar dulu, baru ubah gaya, supaya browser tidak menghitung ulang layout berkali-kali.
    const widths = this.rows.map((row) => (row.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0);
    this.rows.forEach((row, i) => {
      const width = widths[i] ?? 0;
      row.style.setProperty('--fit', width > available ? (available / width).toFixed(3) : '1');
    });
  }
}

function div(className: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
}
