# Panduan: foto dan video di bucket S3 (opsional)

Secara bawaan foto dan video disimpan di folder `api-php/uploads` (tidak ada yang berubah). Kalau suatu saat folder itu terlalu besar atau
ingin diakses lewat CDN, program bisa menyimpannya di bucket yang kompatibel dengan S3 (AWS S3, MinIO, Wasabi, dan sejenisnya).
Alamat foto di data tetap `/api/uploads/...`, jadi data tidak perlu diubah.

## 1. Siapkan bucket
- Buat bucket di penyedia S3 Anda, lalu buat kunci akses (Object Read & Write). Catat alamat endpoint, Access Key ID, dan Secret Access Key.
- Kalau ingin foto dimuat langsung dari alamat publik/CDN, aktifkan akses publik bucket (atau pasang domain CDN di depannya) dan catat alamatnya.

## 2. Isi `api-php/config.local.php` (file ini tidak masuk Git)
```php
return [
    // ...pengaturan database yang sudah ada...
    'storage_driver' => 's3',
    's3_endpoint'    => 'https://s3.contoh.com',
    's3_bucket'      => 'nama-bucket',
    's3_region'      => 'auto',
    's3_key'         => 'ACCESS_KEY_ID',
    's3_secret'      => 'SECRET_ACCESS_KEY',
    's3_public_base' => 'https://media.contoh.com',   // boleh dikosongkan: foto lalu diteruskan lewat server
    // 'backup_media' => false,                        // backup tanpa menyalin foto dari bucket (bucket-nya sendiri salinannya)
];
```

## 3. Pindahkan foto yang sudah ada
Dari folder `api-php`, jalankan (menyalin, memeriksa ukuran tiap file, tidak menghapus apa pun):
```
php bin/worker.php --enqueue=storage-migrate
```
Aman diulang: file yang sudah ada di bucket dengan ukuran sama dilewati. Pekerjaan yang sama bisa dijalankan dari Antrean (`POST /api/jobs`
dengan `{"type":"storage-migrate"}`) oleh Master Admin.

Setelah yakin semua foto tampil dari bucket, file lokal boleh dihapus untuk menghemat tempat:
```
php bin/worker.php --enqueue=storage-migrate --delete-local
```
(setiap file lokal hanya dihapus setelah salinannya di bucket terbukti berukuran sama).

## 4. Kembali ke penyimpanan lokal
Hapus baris `'storage_driver' => 's3'` (atau ubah ke `'local'`). Foto yang hanya ada di bucket harus disalin dulu ke `api-php/uploads`
(unduh dari bucket, atau restore sebuah backup lengkap).

## Yang perlu diketahui
- Thumbnail foto (`/api/thumb/<lebar>/...`) dibuat otomatis saat pertama diminta dan disimpan di `_thumbs/` pada penyimpanan yang sama.
  Thumbnail tidak masuk backup; dibuat ulang sesuai kebutuhan. `php bin/worker.php --enqueue=thumbs-warm` membuat semuanya sekaligus.
- Backup ZIP tetap berisi seluruh foto (diunduh dulu dari bucket) kecuali `'backup_media' => false`.
- Isi `config.local.php` jangan dibagikan: berisi kunci akses bucket.
- Penyimpanan S3 sudah diuji terhadap server S3 tiruan (tanda tangan Signature V4 dicocokkan dengan contoh resmi AWS) tetapi
  belum terhadap bucket R2/S3 sungguhan. Cobalah dulu dengan bucket uji sebelum dipakai untuk data asli.

# Pekerjaan latar belakang (Antrean)

Backup, restore, pembersihan file, pemindahan ke S3, dan pembuatan thumbnail berjalan sebagai pekerjaan di proses PHP terpisah
(`api-php/bin/worker.php`), bukan di dalam permintaan web. Program memulainya sendiri saat tombol ditekan; tidak ada yang perlu
dipasang atau dibiarkan menyala. Kemajuannya terlihat di tombol yang ditekan dan di menu Antrean.

- Kalau server tidak bisa memulai proses baru, halaman otomatis meminta server menjalankan pekerjaan itu di dalam satu permintaan.
- Pekerjaan yang tidak memberi kabar lebih dari 10 menit dianggap berhenti dan ditandai Gagal.
- Worker yang menyala terus (opsional): `php bin/worker.php --loop`.
- Jalankan satu jenis pekerjaan dari terminal: `php bin/worker.php --enqueue=<jenis>` dengan jenis `backup`, `restore`, `cleanup`,
  `storage-migrate`, `thumbs-warm`, atau `sync-media`.
