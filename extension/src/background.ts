import { LrclibClient, LrclibError, cleanTitle } from '@lyrics-overlay/core';
import {
  isCommandName,
  isFindLyricsRequest,
  type CommandMessage,
  type CommandName,
  type FindLyricsRequest,
  type FindLyricsResponse,
} from './messages';
import { StorageCache } from './storage-cache';

const client = new LrclibClient({
  cache: new StorageCache(),
  clientName: `lyrics-overlay-extension/${chrome.runtime.getManifest().version}`,
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isFindLyricsRequest(message)) return false;
  void findLyrics(message).then(sendResponse);
  return true;
});

async function findLyrics(request: FindLyricsRequest): Promise<FindLyricsResponse> {
  const guess = cleanTitle({ title: request.title, channel: request.channel });
  try {
    const record = await client.find({
      track: guess.track,
      artist: guess.artist,
      trackBare: guess.trackBare,
      query: guess.query,
      duration: request.duration > 0 ? request.duration : undefined,
    });
    return { ok: true, guess, record };
  } catch (error) {
    const rateLimited = error instanceof LrclibError && error.status === 429;
    return { ok: false, error: rateLimited ? 'rate-limited' : 'failed' };
  }
}

function sendCommand(tabId: number | undefined, command: CommandName): void {
  if (tabId === undefined) return;
  const message: CommandMessage = { type: 'command', command };
  // Tab tanpa content script (bukan YouTube) akan menolak pesan, dan itu tidak apa-apa.
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (isCommandName(command)) sendCommand(tab?.id, command);
});

chrome.action.onClicked.addListener((tab) => sendCommand(tab.id, 'toggle-overlay'));
