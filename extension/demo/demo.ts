/**
 * Demo tampilan overlay dengan lirik buatan sendiri (docs/contoh.lrc), tanpa YouTube.
 * Parameter URL: ?t=12 mulai di detik 12, ?bg=gelap atau ?bg=ramai untuk latar, ?pause=1 untuk diam.
 */
import { SyncEngine, parseLrc } from '@lyrics-overlay/core';
import contoh from '../../docs/contoh.lrc';
import { OverlayView, overlayScale } from '../src/overlay';

const BACKGROUNDS = ['terang', 'gelap', 'ramai'];
const params = new URLSearchParams(location.search);

const { lines, meta } = parseLrc(contoh);
const end = (lines.at(-1)?.time ?? 0) + 4;

const engine = new SyncEngine();
engine.setLines(lines);
let playing = params.get('pause') !== '1';
engine.update({ position: Number(params.get('t')) || 0, playing });

const stage = document.getElementById('stage');
const view = new OverlayView({ bottom: '6%' });
if (stage) view.mountIn(stage);
view.setLabel(meta.ti ?? 'Lagu contoh', meta.ar ?? 'Nama artis');
let lastIndex = engine.activeIndex();
view.setLines(lines, lastIndex);

const fit = () => view.setScale(overlayScale(window.innerWidth, window.innerHeight));
window.addEventListener('resize', fit);
fit();

document.body.dataset.bg = params.get('bg') ?? 'terang';

function frame(): void {
  if (engine.position() >= end) engine.update({ position: 0, playing });
  const index = engine.activeIndex();
  if (index !== lastIndex) {
    lastIndex = index;
    view.setActive(index);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const playButton = document.getElementById('play');
const updatePlayLabel = () => {
  if (playButton) playButton.textContent = playing ? 'Jeda' : 'Putar';
};
updatePlayLabel();

playButton?.addEventListener('click', () => {
  playing = !playing;
  engine.update({ position: engine.position(), playing });
  updatePlayLabel();
});

document.getElementById('restart')?.addEventListener('click', () => {
  engine.update({ position: 0, playing });
});

document.getElementById('background')?.addEventListener('click', () => {
  const current = BACKGROUNDS.indexOf(document.body.dataset.bg ?? 'terang');
  document.body.dataset.bg = BACKGROUNDS[(current + 1) % BACKGROUNDS.length] ?? 'terang';
});
