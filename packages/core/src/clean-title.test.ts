import { describe, expect, it } from 'vitest';
import { cleanTitle, looksLikeMusic } from './clean-title';

// Semua nama artis dan judul di sini buatan sendiri.
describe('cleanTitle', () => {
  const cases: { title: string; channel: string; artist: string; track: string }[] = [
    { title: 'Nama Artis - Lagu Contoh (Official Music Video)', channel: 'Nama Artis', artist: 'Nama Artis', track: 'Lagu Contoh' },
    { title: 'Lagu Contoh', channel: 'Nama Artis - Topic', artist: 'Nama Artis', track: 'Lagu Contoh' },
    { title: "Grup Bintang (그룹별) 'Lompat Tinggi' Official MV", channel: 'Label Musik', artist: 'Grup Bintang', track: 'Lompat Tinggi' },
    { title: 'Grup Bintang "Lompat Tinggi" M/V', channel: 'Label Musik', artist: 'Grup Bintang', track: 'Lompat Tinggi' },
    { title: "Grup Bintang - 'Lompat Tinggi' M/V", channel: 'Label Musik', artist: 'Grup Bintang', track: 'Lompat Tinggi' },
    { title: '[MV] Penyanyi(가수) _ Hari Cerah', channel: 'Kanal Musik (뮤직)', artist: 'Penyanyi', track: 'Hari Cerah' },
    { title: 'Duo Senja「夜の灯り」Official Music Video', channel: 'Duo Senja', artist: 'Duo Senja', track: '夜の灯り' },
    { title: 'Lagu Pagi (feat. Teman) [Official Video]', channel: 'BandKopiVEVO', artist: 'Band Kopi', track: 'Lagu Pagi' },
    { title: "Band Kopi - Don't Stop Sekarang (Official Audio)", channel: 'Band Kopi', artist: 'Band Kopi', track: "Don't Stop Sekarang" },
    { title: 'Nama Artis - Hati-Hati Pulang (Lirik)', channel: 'Nama Artis', artist: 'Nama Artis', track: 'Hati-Hati Pulang' },
    { title: 'Nama Artis - Lagu Contoh | Album Baru Sekarang', channel: 'Label', artist: 'Nama Artis', track: 'Lagu Contoh' },
    { title: 'Lagu Contoh - Nama Artis', channel: 'Nama Artis', artist: 'Nama Artis', track: 'Lagu Contoh' },
    { title: '【Penyanyi】Lagu Malam', channel: 'Kanal Lain', artist: 'Penyanyi', track: 'Lagu Malam' },
    { title: '가수 (Penyanyi) - Lagu Contoh', channel: 'Kanal', artist: 'Penyanyi', track: 'Lagu Contoh' },
    { title: 'Nama Artis - Lagu Contoh feat. Teman', channel: 'Nama Artis', artist: 'Nama Artis', track: 'Lagu Contoh' },
    { title: 'Grup Bintang(그룹별) - Lompat Tinggi [뮤직비디오]', channel: 'Label', artist: 'Grup Bintang', track: 'Lompat Tinggi' },
    { title: 'Ｎａｍａ Ａｒｔｉｓ － Ｌａｇｕ Ｃｏｎｔｏｈ', channel: 'Label', artist: 'Nama Artis', track: 'Lagu Contoh' },
    { title: 'Lagu Contoh', channel: 'Nama Artis Official', artist: 'Nama Artis', track: 'Lagu Contoh' },
  ];

  it.each(cases)('$title', ({ title, channel, artist, track }) => {
    expect(cleanTitle({ title, channel })).toMatchObject({ artist, track });
  });

  it('menyimpan keterangan versi di judul, tapi membuangnya di trackBare', () => {
    const guess = cleanTitle({ title: 'Nama Artis - Lagu Lama (Versi Baru) (Lyric Video)', channel: 'Nama Artis' });
    expect(guess.track).toBe('Lagu Lama (Versi Baru)');
    expect(guess.trackBare).toBe('Lagu Lama');
    expect(guess.query).toBe('Lagu Lama Nama Artis');
  });

  it('tidak mengosongkan judul yang isinya mirip keterangan', () => {
    expect(cleanTitle({ title: 'Video', channel: 'Nama Artis' })).toMatchObject({ artist: 'Nama Artis', track: 'Video' });
  });
});

describe('looksLikeMusic', () => {
  it('menerima video berkategori musik', () => {
    expect(looksLikeMusic({ title: 'Lagu Contoh', category: 'Music', duration: 210 })).toBe(true);
    expect(looksLikeMusic({ title: 'Lagu Contoh', category: 'Musik', duration: 210 })).toBe(true);
  });

  it('menerima channel Topic, VEVO, dan judul yang terlihat seperti lagu', () => {
    expect(looksLikeMusic({ title: 'Lagu Contoh', channel: 'Nama Artis - Topic' })).toBe(true);
    expect(looksLikeMusic({ title: 'Lagu Contoh', channel: 'NamaArtisVEVO' })).toBe(true);
    expect(looksLikeMusic({ title: 'Nama Artis - Lagu Contoh (Official Video)', category: 'Entertainment' })).toBe(true);
    expect(looksLikeMusic({ title: "Grup Bintang 'Lompat Tinggi' M/V", category: 'Entertainment' })).toBe(true);
    expect(looksLikeMusic({ title: 'Lagu Contoh (Cover)', category: 'People & Blogs' })).toBe(true);
    expect(looksLikeMusic({ title: 'Duo Senja「夜の灯り」', category: 'Entertainment' })).toBe(true);
  });

  it('menolak video biasa dan video yang terlalu panjang', () => {
    expect(looksLikeMusic({ title: 'Cara Masak Nasi - Vlog Harian', category: 'Howto & Style', duration: 420 })).toBe(false);
    expect(looksLikeMusic({ title: 'Tips Menemukan Barang Hilang', category: 'Education' })).toBe(false);
    expect(looksLikeMusic({ title: 'Playlist Santai Lirik Lengkap', category: 'Music', duration: 4167 })).toBe(false);
  });
});
