import { SyncEngine, looksLikeMusic, parseLrc } from '@lyrics-overlay/core';
import {
  PING_EVENT,
  VIDEO_EVENT,
  isCommandMessage,
  parseVideoPayload,
  type FindLyricsRequest,
  type FindLyricsResponse,
  type VideoPayload,
} from './messages';
import { OverlayView, overlayScale } from './overlay';

const OFFSET_STEP = 0.5;
// Durasi membantu memilih versi lagu yang tepat, jadi tunggu sebentar kalau belum tersedia.
const WAIT_FOR_DURATION_MS = 3000;
// Pemutar kecil (miniplayer) terlalu sempit untuk lirik.
const MIN_PLAYER_HEIGHT = 280;

const view = new OverlayView();
const engine = new SyncEngine();

let video: VideoPayload | null = null;
let currentId = '';
let requested = false;
let hasLines = false;
let lastIndex = Number.NaN;
let hiddenByUser = false;
let waitTimer: ReturnType<typeof setTimeout> | undefined;
let observedPlayer: HTMLElement | null = null;

const resizeObserver = new ResizeObserver(() => applyLayout());

function playerElement(): HTMLElement | null {
  return document.getElementById('movie_player');
}

function isWatchPage(): boolean {
  return location.pathname === '/watch';
}

function applyLayout(): void {
  const player = playerElement();
  if (player && player !== observedPlayer) {
    if (observedPlayer) resizeObserver.unobserve(observedPlayer);
    resizeObserver.observe(player);
    observedPlayer = player;
  }
  if (player) {
    view.mountIn(player);
    view.setScale(overlayScale(player.clientWidth, player.clientHeight));
  }
  const showingAd = Boolean(video?.ad) || Boolean(player?.classList.contains('ad-showing'));
  view.setVisible(
    Boolean(player) &&
      !hiddenByUser &&
      !showingAd &&
      isWatchPage() &&
      video?.videoId === currentId &&
      (player?.clientHeight ?? 0) >= MIN_PLAYER_HEIGHT,
  );
}

function onVideo(next: VideoPayload | null): void {
  video = next;
  if (next && !next.ad && isWatchPage()) {
    if (next.videoId !== currentId) startVideo(next.videoId);
    if (!requested && next.duration > 0) void requestLyrics();
  }
  applyLayout();
}

function startVideo(id: string): void {
  currentId = id;
  requested = false;
  hasLines = false;
  lastIndex = Number.NaN;
  engine.setLines([]);
  engine.setOffset(0);
  view.clear();
  clearTimeout(waitTimer);
  waitTimer = setTimeout(() => {
    if (currentId === id) void requestLyrics();
  }, WAIT_FOR_DURATION_MS);
}

async function requestLyrics(): Promise<void> {
  const current = video;
  if (!current || requested || current.videoId !== currentId) return;
  // Video yang bukan lagu tidak dicari liriknya. Dicek ulang setiap data pemutar berubah,
  // karena kategori kadang baru tersedia sesaat setelah video berganti.
  const music = looksLikeMusic({
    title: current.title,
    channel: current.author,
    category: current.category,
    duration: current.duration,
  });
  if (!music) return;
  requested = true;
  clearTimeout(waitTimer);
  const id = current.videoId;
  view.setStatus('Nyari lirik…');

  const request: FindLyricsRequest = {
    type: 'find-lyrics',
    title: current.title,
    channel: current.author,
    duration: current.duration,
  };
  let response: FindLyricsResponse | undefined;
  try {
    response = (await chrome.runtime.sendMessage(request)) as FindLyricsResponse | undefined;
  } catch {
    response = undefined;
  }
  if (id !== currentId) return;

  if (!response?.ok) {
    const busy = response?.ok === false && response.error === 'rate-limited';
    view.setStatus(busy ? 'LRCLIB lagi sibuk, coba lagi nanti' : 'Gagal ambil lirik', { fade: true });
    return;
  }

  const { guess, record } = response;
  view.setLabel(record?.track || guess.track, record?.artist || guess.artist);

  const lines = record?.synced ? parseLrc(record.synced).lines : [];
  if (lines.length > 0) {
    const offset = await loadOffset(id);
    if (id !== currentId) return;
    engine.setLines(lines);
    engine.setOffset(offset);
    const media = playerElement()?.querySelector('video');
    if (media) engine.update({ position: media.currentTime, playing: !media.paused, rate: media.playbackRate });
    lastIndex = engine.activeIndex();
    view.setLines(lines, lastIndex);
    hasLines = true;
    return;
  }

  let message = 'Lirik nggak ketemu';
  if (record?.instrumental) message = 'Instrumental';
  else if (record?.plain) message = 'Liriknya belum tersinkron';
  view.setStatus(message, { fade: true });
}

function frame(): void {
  requestAnimationFrame(frame);
  if (!hasLines) return;
  const media = playerElement()?.querySelector('video');
  if (!media) return;
  engine.update({ position: media.currentTime, playing: !media.paused, rate: media.playbackRate });
  const index = engine.activeIndex();
  if (index !== lastIndex) {
    lastIndex = index;
    view.setActive(index);
  }
}

function offsetKey(id: string): string {
  return `offset:${id}`;
}

async function loadOffset(id: string): Promise<number> {
  try {
    const stored = await chrome.storage.local.get(offsetKey(id));
    const value = stored[offsetKey(id)];
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

async function saveOffset(id: string, value: number): Promise<void> {
  try {
    if (value === 0) await chrome.storage.local.remove(offsetKey(id));
    else await chrome.storage.local.set({ [offsetKey(id)]: value });
  } catch {
    // Extension baru dimuat ulang; offset cukup berlaku sampai halaman di-refresh.
  }
}

function formatOffset(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toFixed(1).replace('.', ',')} dtk`;
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCommandMessage(message)) return;
  if (message.command === 'toggle-overlay') {
    hiddenByUser = !hiddenByUser;
    chrome.storage.local.set({ hidden: hiddenByUser }).catch(() => undefined);
    applyLayout();
    return;
  }
  if (!hasLines) return;
  const step = message.command === 'offset-later' ? OFFSET_STEP : -OFFSET_STEP;
  const offset = Math.round((engine.getOffset() + step) * 10) / 10;
  engine.setOffset(offset);
  lastIndex = Number.NaN;
  void saveOffset(currentId, offset);
  view.flash(`Offset ${formatOffset(offset)}`);
});

document.addEventListener(VIDEO_EVENT, (event) => onVideo(parseVideoPayload((event as CustomEvent<unknown>).detail)));
document.addEventListener('fullscreenchange', applyLayout);
setInterval(applyLayout, 1000);
chrome.storage.local
  .get('hidden')
  .then((stored) => {
    hiddenByUser = stored.hidden === true;
    applyLayout();
  })
  .catch(() => undefined);
document.dispatchEvent(new CustomEvent(PING_EVENT));
requestAnimationFrame(frame);
