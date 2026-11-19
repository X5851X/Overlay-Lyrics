import { describe, expect, it } from 'vitest';
import { SyncEngine, lineIndexAt } from './sync';

const lines = [
  { time: 1, text: 'satu' },
  { time: 5, text: 'dua' },
  { time: 9, text: 'tiga' },
];

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

function engineWithClock() {
  const clock = fakeClock();
  const engine = new SyncEngine(clock.now);
  engine.setLines(lines);
  return { clock, engine };
}

describe('lineIndexAt', () => {
  it('memilih baris terakhir yang sudah lewat', () => {
    expect(lineIndexAt(lines, 0)).toBe(-1);
    expect(lineIndexAt(lines, 1)).toBe(0);
    expect(lineIndexAt(lines, 4.99)).toBe(0);
    expect(lineIndexAt(lines, 5)).toBe(1);
    expect(lineIndexAt(lines, 60)).toBe(2);
    expect(lineIndexAt([], 3)).toBe(-1);
  });
});

describe('SyncEngine', () => {
  it('memperkirakan posisi di antara pembaruan saat lagu diputar', () => {
    const { clock, engine } = engineWithClock();
    engine.update({ position: 4, playing: true });
    expect(engine.activeIndex()).toBe(0);
    clock.advance(1500);
    expect(engine.position()).toBeCloseTo(5.5);
    expect(engine.activeIndex()).toBe(1);
  });

  it('berhenti saat lagu dijeda', () => {
    const { clock, engine } = engineWithClock();
    engine.update({ position: 4, playing: false });
    clock.advance(10_000);
    expect(engine.position()).toBe(4);
    expect(engine.activeIndex()).toBe(0);
  });

  it('mengikuti seek maju dan mundur', () => {
    const { engine } = engineWithClock();
    engine.update({ position: 9.2, playing: true });
    expect(engine.activeIndex()).toBe(2);
    engine.update({ position: 0.5, playing: true });
    expect(engine.activeIndex()).toBe(-1);
  });

  it('memperhitungkan kecepatan putar', () => {
    const { clock, engine } = engineWithClock();
    engine.update({ position: 1, playing: true, rate: 2 });
    clock.advance(2000);
    expect(engine.position()).toBeCloseTo(5);
    expect(engine.activeIndex()).toBe(1);
  });

  it('menerapkan offset manual', () => {
    const { engine } = engineWithClock();
    engine.update({ position: 5.5, playing: false });
    expect(engine.activeIndex()).toBe(1);
    engine.setOffset(1);
    expect(engine.activeIndex()).toBe(0);
    engine.setOffset(-4);
    expect(engine.activeIndex()).toBe(2);
    expect(engine.getOffset()).toBe(-4);
  });

  it('tidak memakai posisi negatif', () => {
    const { engine } = engineWithClock();
    engine.update({ position: -3, playing: false });
    expect(engine.position()).toBe(0);
  });
});
