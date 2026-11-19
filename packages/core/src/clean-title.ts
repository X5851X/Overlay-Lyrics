export interface VideoInfo {
  /** Judul video, atau judul lagu dari pemutar. */
  title: string;
  /** Nama channel, atau nama artis dari pemutar. */
  channel?: string;
}

export interface TrackGuess {
  artist: string;
  track: string;
  /** Judul tanpa keterangan dalam kurung, untuk pencarian cadangan. */
  trackBare: string;
  /** Teks untuk pencarian bebas: judul lalu artis. */
  query: string;
}

// Kata yang menandakan isi kurung hanya keterangan video, bukan bagian judul lagu.
const NOISE_WORDS = [
  'official', 'officiel', 'resmi', 'music\\s*video', 'video\\s*cli[pk]', 'klip', 'mv', 'm\\s*/\\s*v',
  'lyrics?', 'lirik', 'video', 'audio', 'visuali[sz]er', 'hd', 'hq', '4k', '8k', '\\d{3,4}p',
  '\\d{2}\\s*fps', 'remaster(?:ed)?', 'live', 'performance', 'dance\\s*practice', 'color\\s*coded',
  '(?:eng|ind|indo|han|rom|kan)\\s*sub', 'subs?', 'subtitles?', 'teaser', 'explicit', 'clean', 'ost',
  'from', 'prod\\.?',
].join('|');
const CJK_NOISE = '뮤직\\s*비디오|공식|가사|歌詞|公式|ミュージック\\s*ビデオ|オフィシャル|リリック';
const NOISE_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${NOISE_WORDS})(?![\\p{L}\\p{N}])|${CJK_NOISE}`, 'iu');

// Keterangan yang sering menempel di akhir judul tanpa kurung, misalnya "... Official MV".
const TRAILING_WORDS = [
  '(?:official\\s+)?(?:music\\s+video|lyric\\s+video|video\\s+cli[pk]|visuali[sz]er|audio|video|mv|m\\s*/\\s*v)(?:\\s+resmi)?',
  'official',
  'lyrics?',
  'lirik(?:\\s+lagu)?',
  'hd',
  '4k',
].join('|');
const SEPARATOR_CHARS = '\\s\\-–—|:_/~';
const TRAILING_RE = new RegExp(`(?:^|[${SEPARATOR_CHARS},.]+)(?:${TRAILING_WORDS})[${SEPARATOR_CHARS}]*$`, 'iu');
const EDGE_SEPARATORS_RE = new RegExp(`^[${SEPARATOR_CHARS}]+|[${SEPARATOR_CHARS}]+$`, 'gu');

const FEAT_BRACKET_RE = /^(?:feat\.?|ft\.?|featuring|with)\s/iu;
const FEAT_TAIL_RE = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/iu;
const BRACKET_RE = /[(\[【]([^()\[\]【】]*)[)\]】]/gu;
const ANY_BRACKET_RE = /\s*[(\[【][^()\[\]【】]*[)\]】]/gu;
const SEPARATOR_RE = /\s+[-–—_]\s+/u;
const PROMO_SPLIT_RE = /\s+\|\s+/u;
const JP_QUOTE_RE = /[「『]([^」』]+)[」』]/u;
// Kutip pembuka harus didahului spasi, supaya "Don't" atau "Taylor's" tidak dianggap kutipan.
const QUOTE_RE = /(?:^|\s)['‘"“](.{2,}?)['’"”](?=$|[\s.,!?:;)\]】_\-–—|])/u;
const FULL_QUOTE_RE = /^['‘"“「『](.+)['’"”」』]$/u;
const BILINGUAL_RE = /^(.+?)\s*\(([^()]+)\)$/u;
const LATIN_RE = /\p{Script=Latin}/u;

const MAX_SONG_SECONDS = 15 * 60;
const MUSIC_CATEGORY_RE = /^(?:music|musik|musique|música|musica|音乐|音楽|음악)$/iu;
const MUSIC_CHANNEL_RE = /(?:\s-\s*topic|vevo)$/iu;
const MUSIC_TITLE_RE = new RegExp(
  [
    '(?<![\\p{L}\\p{N}])(?:m\\s*/\\s*v|mv|lyrics?|lirik|official\\s+(?:music\\s+)?(?:video|audio|mv)|music\\s+video|visuali[sz]er|cover|feat\\.?|ft\\.)(?![\\p{L}\\p{N}])',
    '[「『][^」』]+[」』]',
    CJK_NOISE,
  ].join('|'),
  'iu',
);

export interface MusicHint {
  title: string;
  channel?: string;
  /** Kategori video dari platform, misalnya "Music". */
  category?: string;
  /** Durasi dalam detik. */
  duration?: number;
}

/**
 * Menebak apakah sebuah video adalah lagu. Dipakai supaya judul video lain (vlog, tutorial,
 * kompilasi berjam-jam) tidak ikut dikirim ke layanan lirik.
 */
export function looksLikeMusic(hint: MusicHint): boolean {
  if (hint.duration && hint.duration > MAX_SONG_SECONDS) return false;
  if (hint.category && MUSIC_CATEGORY_RE.test(hint.category.trim())) return true;
  if (hint.channel && MUSIC_CHANNEL_RE.test(hint.channel.trim())) return true;
  return MUSIC_TITLE_RE.test(hint.title.normalize('NFKC'));
}

/**
 * Menebak artis dan judul lagu dari judul video dan nama channel.
 *
 * Judul video sering berisi keterangan seperti "Official MV", tanda kurung, atau nama artis dalam
 * dua bahasa. Hasilnya dipakai untuk mencari lirik, jadi tebakan yang meleset sedikit masih
 * tertolong oleh pencarian cadangan di LRCLIB.
 */
export function cleanTitle(info: VideoInfo): TrackGuess {
  const channel = cleanChannel(info.channel ?? '');
  const original = tidy(info.title.normalize('NFKC'));
  const { text: unbracketed, leadingTag } = removeBrackets(original);
  const title = trimSeparators(stripTrailingNoise(unbracketed).split(PROMO_SPLIT_RE)[0] ?? '');

  let artist = '';
  let track = title;
  const separator = SEPARATOR_RE.exec(title);
  const quoted = separator ? null : (JP_QUOTE_RE.exec(title) ?? QUOTE_RE.exec(title));

  if (separator) {
    artist = title.slice(0, separator.index);
    track = unquote(title.slice(separator.index + separator[0].length));
    // "Judul - Artis" yang diunggah channel milik artis itu sendiri
    if (channel && sameText(track, channel) && !sameText(artist, channel)) {
      [artist, track] = [track, unquote(artist)];
    }
  } else if (quoted?.[1]) {
    track = quoted[1];
    artist = title.slice(0, quoted.index);
  }

  artist = cleanArtist(artist) || cleanArtist(leadingTag) || channel;
  track = trimSeparators(stripFeat(stripTrailingNoise(tidy(track)))) || original;
  const trackBare = tidy(track.replace(ANY_BRACKET_RE, '')) || track;

  return { artist, track, trackBare, query: tidy(`${trackBare} ${artist}`) };
}

function removeBrackets(title: string): { text: string; leadingTag: string } {
  let leadingTag = '';
  const text = title.replace(BRACKET_RE, (match: string, inner: string, offset: number) => {
    const content = inner.trim();
    if (!content || NOISE_RE.test(content) || FEAT_BRACKET_RE.test(content)) return ' ';
    // "[Artis] Judul" atau "【Artis】Judul"
    if (offset === 0 && !match.startsWith('(') && !leadingTag) {
      leadingTag = content;
      return ' ';
    }
    return match;
  });
  return { text: tidy(text), leadingTag };
}

function stripTrailingNoise(text: string): string {
  let current = text;
  for (;;) {
    const next = tidy(current.replace(TRAILING_RE, ''));
    if (next === current || !next) return current;
    current = next;
  }
}

function cleanChannel(raw: string): string {
  let name = tidy(raw.normalize('NFKC')).replace(/\s*-\s*topic$/iu, '');
  if (/vevo$/iu.test(name)) name = name.replace(/vevo$/iu, '').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
  name = name.replace(/\s*(?:official\s*)?(?:youtube\s*)?channel$/iu, '').replace(/\s+official$/iu, '');
  return pickName(tidy(name));
}

function cleanArtist(raw: string): string {
  return pickName(trimSeparators(stripTrailingNoise(stripFeat(tidy(raw)))));
}

/** "NewJeans (뉴진스)" atau "아이유 (IU)": pilih nama yang memakai huruf Latin. */
function pickName(name: string): string {
  const match = BILINGUAL_RE.exec(name);
  if (!match?.[1] || !match[2]) return name;
  const outside = match[1].trim();
  const inside = match[2].trim();
  if (!LATIN_RE.test(outside) && LATIN_RE.test(inside)) return inside;
  return outside;
}

function stripFeat(text: string): string {
  return text.replace(FEAT_TAIL_RE, '');
}

function unquote(text: string): string {
  const trimmed = text.trim();
  return FULL_QUOTE_RE.exec(trimmed)?.[1] ?? trimmed;
}

function trimSeparators(text: string): string {
  return text.replace(EDGE_SEPARATORS_RE, '').trim();
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
