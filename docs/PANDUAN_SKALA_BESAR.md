# Panduan: menjalankan program untuk beban besar (tahap 8) dan batas yang diketahui (tahap 9)

Dokumen ini menjelaskan apa yang sudah ada di program, apa yang sudah diuji, dan apa yang masih berupa keputusan infrastruktur
yang harus diambil pemilik program. Tidak semuanya bisa "dikerjakan" lewat kode: sebagian adalah layanan (server, MySQL terkelola, Redis).

## 1. Yang sudah ada di program (diuji di PC ini)

| Kemampuan | Cara | Diuji |
|---|---|---|
| Beberapa server program di belakang load balancer | tanpa sesi lengket; sesi di database, daftar di Redis | 2 server PHP + nginx: sesi lintas server, daftar pilihan ikut berubah di kedua server, pekerjaan diikuti dari server lain |
| Cache bersama | `cache_driver`: `file` (satu server), `apcu`, `redis` (banyak server); jatuh diam-diam ke "tidak ada cache" bila Redis mati | Redis sungguhan (Laragon) |
| Pembatas permintaan tanpa beban database | hitungan per pengunjung di Redis/APCu | 30 permintaan terhitung 30 di Redis |
| Alamat pengunjung di belakang proxy | `trusted_proxies` (IP/CIDR); `X-Forwarded-For` hanya dibaca dari proxy kita | uji unit, termasuk header palsu |
| Replika baca MySQL | `db_read_host`; setelah menulis, browser itu membaca database utama 3 detik | fungsi diuji (replikanya database yang sama); lag replika sungguhan belum |
| Koneksi database menetap | otomatis di server Termux; `db_persistent` untuk Apache/FPM | 15 ms per permintaan hemat |
| Pengecekan skema tidak tiap permintaan | diingat cache 5 menit (`KOI_SCHEMA_REV` dinaikkan bila menambah `ensure_*`) | 61 → 43 ms per permintaan |
| Kesehatan sistem | `GET /api/ready` (publik, untuk load balancer), `GET /api/health/detail` (Master Admin: database, replika, cache, penyimpanan, disk, antrean, tabel terbesar, permintaan lambat) | ya |
| Log permintaan lambat | `storage/logs/slow-<tanggal>.log` (> `slow_request_ms`, bawaan 1000) | ya |
| Pekerja di server lain | `php bin/worker.php --loop`; pekerjaan diklaim atomik (8 proses berebut, hanya 1 yang jalan) | ya |
| Konfigurasi lewat environment | `KOI_DB_HOST`, `KOI_REDIS_HOST`, `KOI_S3_*`, ... (lihat `config.php`) | ya |
| Kit Docker / nginx | folder `deploy/` | **belum dijalankan** (tidak ada Docker di sini) |

## 2. Kecepatan per permintaan: yang paling berpengaruh adalah opcache

Diukur (satu koneksi, server PHP bawaan): `/api/health`
- tanpa opcache, koneksi baru tiap permintaan: ±30 ms
- dengan koneksi menetap dan opcache: ±8 ms

Tanpa opcache setiap permintaan membaca ulang ±12.000 baris PHP. Karena itu:
- **Laragon/Apache (PC):** aktifkan `zend_extension=opcache` dan `opcache.enable=1` di `php.ini` Laragon (menu Laragon > PHP > php.ini), lalu restart Apache.
  Tambahkan `'db_persistent' => true` di `config.local.php` bila jumlah worker Apache di bawah `max_connections` MySQL (bawaan 151).
- **Termux (HP):** `start.sh` mematikan opcache secara sengaja. Coba `NISHIKIGOI_OPCACHE=1 bash start.sh`; kalau stabil di HP, jadikan kebiasaan.
- **Docker:** `deploy/php.ini` sudah mengaktifkannya.

## 3. Susunan untuk banyak pengguna (urutan pemasangan)

1. MySQL terkelola (atau server MySQL sendiri) dengan cadangan otomatis. Naikkan `max_connections`.
2. Redis (cache bersama). Isi `cache_driver=redis`, `redis_host`.
3. Media di bucket (tahap 6, `PANDUAN_PENYIMPANAN_S3.md`): server program tidak menyimpan file lagi, jadi boleh dipadamkan/diganti kapan saja.
4. Dua atau lebih server program (Apache/nginx + PHP-FPM, atau `deploy/docker-compose.yml`) dengan konfigurasi yang sama.
5. Satu atau dua pekerja: `php bin/worker.php --loop`. Folder pekerjaan (`storage/backups/jobs`) harus dapat dibaca semua server/pekerja
   (volume bersama), karena file backup dan file restore lewat folder itu.
6. Load balancer (`deploy/nginx-lb.conf`): isi `trusted_proxies` di server program dengan alamat load balancer.
7. Pantau: `/api/ready` untuk "hidup/mati", `/api/health/detail` untuk isi, dan log lambat untuk mencari permintaan yang perlu dioptimalkan.

## 4. Batas yang diketahui (tahap 9)

- **Pencarian "mengandung"** (`LIKE %x%`) tetap memindai kolom; ±1 detik di 200.000 ikan. Indeks teks penuh (FULLTEXT) tidak menggantikannya:
  FULLTEXT mencari per kata, sedangkan pencarian program ini (dan hasil ujinya) mencari potongan huruf. Mesin pencarian (Meilisearch, OpenSearch)
  baru masuk akal bila data mencapai jutaan ikan **dan** waktu ±1 detik tidak lagi bisa diterima; itu pekerjaan tersendiri
  (indeks n-gram, sinkronisasi dua arah, uji kesamaan hasil ulang). Tidak dikerjakan.
- **Partisi tabel** (misalnya `koi_growth_logs`) tidak bisa dipakai di MySQL selama tabel itu punya foreign key (milik MySQL, bukan program).
  Melepas foreign key mengubah jaminan hapus-berantai; tidak dikerjakan. Ukuran tabel terbesar terlihat di `/api/health/detail`.
- **Nomor urut** disimpan di `koi.seq` dan dihitung ulang (satu pernyataan SQL) saat ikan dihapus/diarsipkan/direstore: murah sampai ratusan ribu ikan,
  mulai terasa di jutaan. Opsi berikutnya: nomor tidak dihitung ulang (nomor seri tetap).
- **Satu farm per instalasi.** Banyak farm dalam satu sistem (multi-tenant) mengubah hampir semua tabel dan kueri: lihat `RENCANA_MULTI_FARM.md`.
- **Pembersihan otomatis** catatan yang tumbuh sendiri (sesi tertutup > 1 tahun, riwayat login > 90 hari, baris Antrean > 1 tahun, hitungan
  permintaan): pekerjaan `retention`, otomatis sehari sekali saat ada yang masuk, atau `php bin/worker.php --enqueue=retention`. Data farm tidak disentuh.
