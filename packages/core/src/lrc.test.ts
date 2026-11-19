import { describe, expect, it } from 'vitest';
import { parseLrc } from './lrc';

describe('parseLrc', () => {
  it('membaca baris dan metadata', () => {
    const { lines, meta } = parseLrc('[ti:Lagu contoh]\n[ar:Nama artis]\n[00:01.00]Baris pertama\n[00:05.50]Baris kedua');
    expect(meta).toEqual({ ti: 'Lagu contoh', ar: 'Nama artis' });
    expect(lines).toEqual([
      { time: 1, text: 'Baris pertama' },
      { time: 5.5, text: 'Baris kedua' },
    ]);
  });

  it('memahami berbagai presisi timestamp', () => {
    const { lines } = parseLrc('[00:01]a\n[00:02.5]b\n[00:03.25]c\n[00:04.125]d\n[00:05:50]e\n[100:00.00]f');
    expect(lines.map((line) => line.time)).toEqual([1, 2.5, 3.25, 4.125, 5.5, 6000]);
  });

  it('memecah baris dengan beberapa timestamp lalu mengurutkannya', () => {
    const { lines } = parseLrc('[00:10.00][00:30.00]Reff\n[00:20.00]Bait');
    expect(lines).toEqual([
      { time: 10, text: 'Reff' },
      { time: 20, text: 'Bait' },
      { time: 30, text: 'Reff' },
    ]);
  });

  it('menyimpan baris kosong sebagai jeda', () => {
    const { lines } = parseLrc('[00:01.00]Ada teks\n[00:04.00]\n[00:08.00]Teks lagi');
    expect(lines[1]).toEqual({ time: 4, text: '' });
  });

  it('membuang timestamp per kata', () => {
    const { lines } = parseLrc('[00:01.00]<00:01.00>Satu <00:01.50>dua <00:02.00>tiga');
    expect(lines[0]?.text).toBe('Satu dua tiga');
  });

  it('menerapkan tag offset', () => {
    const { lines } = parseLrc('[offset:+500]\n[00:01.00]a\n[00:00.20]b');
    expect(lines).toEqual([
      { time: 0, text: 'b' },
      { time: 0.5, text: 'a' },
    ]);
  });

  it('menangani BOM, CRLF, dan baris tanpa timestamp', () => {
    const { lines, meta } = parseLrc('﻿[ar:Nama artis]\r\nTeks biasa\r\n[00:02.00]Ada waktunya\r\n');
    expect(meta).toEqual({ ar: 'Nama artis' });
    expect(lines).toEqual([{ time: 2, text: 'Ada waktunya' }]);
  });

  it('tidak memotong kurung siku di tengah teks', () => {
    const { lines } = parseLrc('[00:01.00]Teks [dengan kurung]');
    expect(lines[0]?.text).toBe('Teks [dengan kurung]');
  });

  it('mengembalikan daftar kosong untuk lirik tanpa timestamp', () => {
    expect(parseLrc('Baris satu\nBaris dua').lines).toEqual([]);
  });
});
