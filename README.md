# Lyrics Overlay

Lirik lagu yang tersinkron, tampil sebagai teks transparan di atas layar. Aplikasinya tidak mendengarkan audio. Judul lagu dan posisi putar dibaca dari pemutar, lalu liriknya dicari di [LRCLIB](https://lrclib.net).

Status: tahap 1, extension untuk YouTube. Aplikasi Windows dan Android menyusul.

## Coba extension-nya

Butuh Node.js 20.19 atau yang lebih baru.

```bash
git clone https://github.com/X5851X/Overlay-Lyrics.git
cd Overlay-Lyrics
npm install
npm run build
```

1. Buka `chrome://extensions` (atau `edge://extensions` di Edge).
2. Nyalakan **Developer mode**.
3. Klik **Load unpacked**, lalu pilih folder `extension/dist`.
4. Putar lagu di YouTube. Liriknya muncul di bagian bawah video.

| Shortcut | Fungsi |
|---|---|
| Alt+Shift+L | Tampilkan atau sembunyikan lirik (bisa juga klik ikon extension) |
| Alt+Shift+, | Lirik lebih cepat 0,5 detik |
| Alt+Shift+. | Lirik lebih lambat 0,5 detik |

Pergeseran waktu disimpan per video, karena versi MV sering punya intro yang beda dari versi album. Shortcut bisa diubah di `chrome://extensions/shortcuts`.

Mau lihat tampilannya tanpa YouTube? Setelah `npm run build`, buka `extension/demo/index.html` di browser. Demo itu memakai lirik buatan sendiri dari `docs/contoh.lrc`.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm test` | Menjalankan tes |
| `npm run typecheck` | Mengecek tipe TypeScript |
| `npm run build` | Build extension ke `extension/dist` |
| `npm run watch` | Build ulang otomatis setiap ada file yang berubah |

## Struktur

```
packages/core     parser LRC, pembersih judul, klien LRCLIB, mesin sinkronisasi
packages/tokens   design token (belum diisi)
extension/        extension Chrome dan Edge (Manifest V3)
desktop/          aplikasi Windows (belum dikerjakan)
android/          aplikasi Android (belum dikerjakan)
docs/             catatan dan contoh file LRC buatan sendiri
```

## Catatan

- Lirik hanya dicari untuk video yang terlihat seperti lagu: kategori Musik, channel "Topic" atau VEVO, atau judul yang memuat penanda seperti MV, Official Video, Lyrics, atau Cover. Judul video lain tidak dikirim ke mana pun.
- Lirik diambil dari LRCLIB saat lagu diputar, lalu disimpan sementara di browser. Repo ini tidak menyimpan lirik lagu.
- Tes dan demo hanya memakai teks buatan sendiri.

## Lisensi

MIT. Lihat [LICENSE](LICENSE).
