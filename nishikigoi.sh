#!/usr/bin/env bash
# nishikigoi.sh - Nishikigoi di Linux, macOS, dan Android (Termux atau Linux lewat proot/UserLAnd).
#
#   ./nishikigoi.sh                 pasang bila perlu, lalu jalankan (http://localhost:2000)
#   ./nishikigoi.sh setup           pemasangan pertama (database pribadi + akun admin / admin)
#   ./nishikigoi.sh start --local   jalankan hanya untuk perangkat ini (bawaan: perangkat lain di jaringan boleh membuka)
#   ./nishikigoi.sh stop | status | passwd USER PASS
#
# Bila PHP atau MariaDB belum ada, skrip ini memasangnya lewat pengelola paket sistem (apt, dnf, pacman, zypper, apk, brew, pkg).
cd "$(dirname "$0")" || exit 1

have() { command -v "$1" >/dev/null 2>&1; }
php_ok() { have php && php -r 'exit(version_compare(PHP_VERSION, "8.1.0", ">=") ? 0 : 1);' 2>/dev/null; }
db_ok() { have mariadbd || have mysqld || [ -x /usr/sbin/mariadbd ] || [ -x /usr/sbin/mysqld ] || [ -x /usr/libexec/mysqld ] \
  || [ -x /opt/homebrew/opt/mariadb/bin/mariadbd ] || [ -x /usr/local/opt/mariadb/bin/mariadbd ] || [ -x "${PREFIX:-/nonexistent}/bin/mariadbd" ]; }

SUDO=""
if [ "$(id -u)" != "0" ] && have sudo; then SUDO="sudo"; fi

install_packages() {
  echo "Memasang PHP dan MariaDB yang belum ada..."
  if [ -n "${TERMUX_VERSION:-}" ] || [ "${PREFIX#*com.termux}" != "${PREFIX:-}" ]; then
    pkg install -y php php-gd mariadb
  elif have brew; then
    brew install php mariadb
  elif have apt-get; then
    $SUDO apt-get update && $SUDO apt-get install -y php-cli php-mysql php-mbstring php-gd php-zip php-xml php-curl mariadb-server
  elif have dnf; then
    $SUDO dnf install -y php-cli php-mysqlnd php-mbstring php-gd php-zip php-xml mariadb-server
  elif have pacman; then
    $SUDO pacman -S --needed --noconfirm php php-gd mariadb
  elif have zypper; then
    $SUDO zypper install -y php8 php8-mysql php8-mbstring php8-gd php8-zip php8-openssl php8-fileinfo mariadb
  elif have apk; then
    $SUDO apk add php php-pdo_mysql php-mbstring php-gd php-zip php-openssl php-fileinfo php-session mariadb mariadb-client
  else
    echo "Pengelola paket tidak dikenali. Pasang PHP 8.1+ (pdo_mysql, mbstring, gd, zip, openssl, fileinfo) dan MariaDB secara manual." >&2
    return 1
  fi
}

CMD="${1:-run}"
case "$CMD" in
  run|setup|start|--*)
    if ! php_ok || { { [ "$CMD" = "run" ] || [ "$CMD" = "setup" ] || [[ "$CMD" == --* ]]; } && ! db_ok; }; then
      install_packages || exit 1
    fi
    if ! php_ok; then echo "PHP 8.1 atau lebih baru belum terpasang." >&2; exit 1; fi
    ;;
esac

php bin/nishikigoi.php "$@"
code=$?
# exit code 3: PHP lacks an extension (for example gd on Termux): install the packages, then try once more
if [ "$code" -eq 3 ]; then
  install_packages && exec php bin/nishikigoi.php "$@"
fi
exit "$code"
