/**
 * Berjalan di "main world" halaman YouTube, karena fungsi pemutar seperti getVideoData()
 * tidak terlihat dari content script biasa. Skrip ini hanya membaca, lalu mengirim hasilnya
 * ke content.js lewat event DOM.
 */
import { PING_EVENT, VIDEO_EVENT } from './messages';

interface PlayerResponse {
  videoDetails?: { videoId?: string };
  microformat?: { playerMicroformatRenderer?: { category?: string } };
}

interface YouTubePlayer extends HTMLElement {
  getVideoData?: () => { video_id?: string; title?: string; author?: string } | undefined;
  getDuration?: () => number;
  getPlayerResponse?: () => PlayerResponse | undefined;
}

let lastSent = '';

function snapshot(): string {
  const player = document.getElementById('movie_player') as YouTubePlayer | null;
  if (!player) return 'null';
  try {
    const data = player.getVideoData?.();
    if (!data?.video_id) return 'null';
    const response = player.getPlayerResponse?.();
    // Abaikan kategori kalau datanya masih milik video sebelumnya.
    const category =
      response?.videoDetails?.videoId === data.video_id
        ? (response.microformat?.playerMicroformatRenderer?.category ?? '')
        : '';
    return JSON.stringify({
      videoId: data.video_id,
      title: data.title ?? '',
      author: data.author ?? '',
      category,
      duration: Number(player.getDuration?.()) || 0,
      ad: player.classList.contains('ad-showing'),
    });
  } catch {
    return 'null';
  }
}

function send(force: boolean): void {
  const next = snapshot();
  if (!force && next === lastSent) return;
  lastSent = next;
  document.dispatchEvent(new CustomEvent(VIDEO_EVENT, { detail: next }));
}

document.addEventListener(PING_EVENT, () => send(true));
setInterval(() => send(false), 500);
send(true);
