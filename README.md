# Nishikigoi Farm Beta 1 — Manajemen Koi Farm

Aplikasi web untuk mengelola koi farm: Data Ikan, Data Kolam, Breeding, Laporan, Galeri, Inventori, Penjualan, Invoice, backup dan restore, import/export Excel dan ZIP, serta cetak.

**Mandiri.** Semuanya berjalan di perangkat Anda sendiri: web server, database, dan data. Tidak ada layanan cloud, akun, atau langganan. Setelah dipasang, program tetap jalan tanpa internet.

Cara kerjanya: **PHP** (server web bawaan PHP) + **MariaDB/MySQL** (database pribadi program, tersimpan di folder proyek dan tidak mengganggu database lain di komputer yang sama). Tampilan sudah jadi, jadi **tidak perlu Node.js, Astro, Laragon, Docker, Apache, atau Nginx**.

## Mulai cepat

Pada kali pertama, program memasang dan menyiapkan semuanya sendiri. Anda hanya perlu **Git**. Setelah itu buka **http://localhost:2000** dan masuk dengan:

> **username `admin`, kata sandi `admin`** — segera ganti kata sandinya di Pengaturan setelah masuk pertama kali.

### Windows 10 / 11

```powershell
git clone https://github.com/manaadajika/Nishikigoi-farm-beta1.git Nishikigoi-farm-beta1
cd Nishikigoi-farm-beta1
.\nishikigoi.bat
```

(atau klik dua kali `nishikigoi.bat`). Bila PHP dan MariaDB belum ada, program mengunduh versi portabelnya dari situs resmi (windows.php.net, sekitar 33 MB, dan downloads.mariadb.org, sekitar 100 MB) ke folder `runtime\` di dalam proyek: **tanpa installer dan tanpa hak administrator**. Butuh internet hanya untuk unduhan pertama ini. Jika Windows meminta, pasang juga *Microsoft Visual C++ Redistributable* (kebanyakan PC sudah punya).

### Linux dan macOS

```bash
git clone https://github.com/manaadajika/Nishikigoi-farm-beta1.git Nishikigoi-farm-beta1
cd Nishikigoi-farm-beta1
./nishikigoi.sh
```

Bila PHP dan MariaDB belum ada, skrip memasangnya lewat pengelola paket sistem (apt, dnf, pacman, zypper, apk, atau Homebrew di macOS), memakai `sudo` bila perlu.

### Android

- **Termux** (dari F-Droid):
  ```bash
  pkg update && pkg install -y git
  git clone https://github.com/manaadajika/Nishikigoi-farm-beta1.git Nishikigoi-farm-beta1
  cd Nishikigoi-farm-beta1
  ./nishikigoi.sh start
  ```
  Setelah kata sandi `admin` diganti (lalu jalankan ulang), program bisa dibuka dari perangkat lain di Wi-Fi yang sama (alamat `http://IP-HP:2000`). Agar tidak mati saat layar padam: `termux-wake-lock`.
- **Linux di Android** (UserLAnd, Andronix, atau proot-distro dengan Debian/Ubuntu): langkahnya sama dengan Linux di atas.

## Perintah sehari-hari

Ganti `./nishikigoi.sh` dengan `.\nishikigoi.bat` di Windows.

| Perintah | Fungsi |
|---|---|
| `./nishikigoi.sh` | Memasang bila perlu, lalu menjalankan program |
| `./nishikigoi.sh start` | Menjalankan (database menyala otomatis). `CTRL+C` menghentikan server web. Perangkat lain di jaringan yang sama otomatis boleh membuka setelah kata sandi `admin` diganti |
| `./nishikigoi.sh start --lan` | Memaksa perangkat lain boleh membuka (walau kata sandi masih bawaan, tidak disarankan) |
| `./nishikigoi.sh start --local` | Hanya perangkat ini yang boleh membuka |
| `./nishikigoi.sh start --port=2100` | Memakai port lain (bawaan 2000) |
| `./nishikigoi.sh stop` | Mematikan database pribadi |
| `./nishikigoi.sh status` | Melihat yang sedang jalan |
| `./nishikigoi.sh update` | Mencari dan memasang versi terbaru dari GitHub (`--check` hanya melihat) |
| `./nishikigoi.sh passwd USER SANDI` | Mengganti kata sandi akun (misalnya bila lupa) |
| `./nishikigoi.sh setup` | Pemasangan pertama saja (tabel dan akun `admin`); aman diulang |

**Keamanan.** Selama kata sandi `admin` masih bawaan, program hanya bisa dibuka dari perangkat itu sendiri (`127.0.0.1`). **Begitu kata sandinya diganti, jalankan ulang: perangkat lain di jaringan yang sama otomatis boleh membuka** (dengan alamat IP perangkat itu, mis. `http://192.168.1.20:2000`). Pakai `--local` bila ingin tetap hanya satu perangkat. Windows mungkin menanyakan izin firewall pada saat itu; izinkan untuk jaringan pribadi.

## Data Anda

| Lokasi | Isi |
|---|---|
| `storage/mysql/` | Database (data ikan, kolam, akun, dan seterusnya) |
| `api-php/uploads/` | Foto dan video yang diunggah |
| `storage/backups/` | Hasil backup di server |

Folder-folder ini **tidak ikut Git**. Untuk memindahkan data ke perangkat lain: di perangkat lama buka **Pengaturan > Master Akun > Backup** (data ikan dan foto) dan **Backup Akun** (akun, setingan, tema); di perangkat baru **Restore** file ZIP-nya (satu tombol mengenali kedua jenis).

## Memperbarui program

**Dari dalam program (paling mudah).** Akun **Master Admin** akan melihat bilah biru "Versi baru tersedia" di bagian atas halaman bila ada pembaruan di GitHub (akun dengan role lain tidak melihat apa pun). Program memeriksa GitHub paling sering sekali sehari selama ada internet. Klik **Lihat dan perbarui** untuk melihat daftar perubahannya, lalu **Perbarui sekarang**: versi baru langsung dipakai dan halaman dimuat ulang. Perubahan database ditambahkan otomatis, data tidak tersentuh. Sebaiknya buat Backup dulu.

Syarat: program hasil `git clone` yang dijalankan lewat `nishikigoi`, Git terpasang, dan ada internet. Bila ada berkas program yang diubah di komputer itu, pembaruan otomatis dibatalkan supaya tidak menimpanya.

**Lewat perintah**, di folder program (di Windows ganti `./nishikigoi.sh` dengan `.
ishikigoi.bat`):

```bash
./nishikigoi.sh update --check    # hanya melihat: ada pembaruan atau tidak, dan apa isinya
./nishikigoi.sh update            # mengambil dan memasangnya
```

Cara manualnya sama saja: `git pull`. Bila pembaruan mengubah pengelola di folder `bin/`, hentikan program (`CTRL+C`) dan jalankan lagi.

## Ringan dan efisien

- Database pribadi disetel kecil (memori sekitar 64 MB untuk cache, tanpa log biner, performance schema mati) dan hanya mendengarkan di perangkat ini, port 3307.
- Server web memakai OPcache bila tersedia; di Linux, macOS, dan Android melayani beberapa permintaan sekaligus (4 pekerja). Server bawaan PHP di Windows melayani satu permintaan sekali waktu, cukup untuk satu atau dua pengguna.
- Foto ditampilkan lewat thumbnail yang dibuat sekali lalu disimpan, dan ringkasan Dashboard disimpan sementara di server.

## Pilihan lain

- **Memakai MySQL/MariaDB yang sudah ada:** `php api-php/bin/install.php` (menanyakan login-nya), lalu jalankan server webnya saja.
- **Untuk banyak pengguna atau server:** Docker, Nginx, dan banyak server ada di `deploy/` (panduan di `docs/PANDUAN_SKALA_BESAR.md`); penyimpanan foto ke S3/R2 di `docs/PANDUAN_PENYIMPANAN_S3.md`.
- **Laragon (Apache):** tetap bisa dipakai seperti biasa; arahkan DocumentRoot ke `app/public/Nishikigoi-beta/preview/dist` dan `Alias /api` ke `api-php`.

## Isi folder

| Folder / file | Fungsi |
|---|---|
| `nishikigoi.bat`, `nishikigoi.ps1`, `nishikigoi.sh` | Pintu masuk: memastikan PHP dan database ada, lalu memanggil `bin/nishikigoi.php` |
| `bin/` | `nishikigoi.php` (pengelola: pasang, jalan, henti) dan `router.php` (pengarah untuk server bawaan PHP) |
| `api-php/` | API (PHP): `handlers/`, `lib/`, `schema.sql`, `bin/install.php`, `uploads/` |
| `app/public/Nishikigoi-beta/` | Tampilan: `preview/dist/` (yang disajikan ke browser) dan sumber Astro-nya |
| `deploy/` | Docker, Nginx, dan pengaturan produksi |
| `docs/` | Panduan penyimpanan foto di S3 dan penggunaan skala besar |
| `tools/` | Alat bantu pengembang |

## Kalau ada masalah

- **"Port ... sudah dipakai"**: jalankan di port lain, mis. `start --port=2100`.
- **Database tidak menyala**: lihat `storage/logs/mysql-error.log`. Bila port 3307 dipakai program lain, atur `NISHIKIGOI_DB_PORT=3310` sebelum `setup`.
- **"Ekstensi PHP belum aktif"**: aktifkan di `php.ini` (hapus `;` di depan `extension=gd`, `zip`, dan sebagainya). Pada Windows portabel ini sudah diatur otomatis.
- **Mulai dari nol**: hentikan program (`stop`), lalu hapus folder `storage/mysql/`, `runtime/`, dan `api-php/config.local.php`.

## Untuk pengembang

- Tampilan diedit langsung di `app/public/Nishikigoi-beta/preview/dist/` dan sumbernya di `release-pages/pages/*.astro`. Folder `dist/` ada di `.gitignore`, jadi setiap file baru yang dipakai halaman harus dimasukkan dengan `python tools/track-dist.py`.
- Riwayat perubahan ada di Change Log di dalam program (Etc > Log).
