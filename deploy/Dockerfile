# One image for the program server (php-fpm) and the background worker.
# Build from the repository root:  docker build -f deploy/Dockerfile -t nishikigoi-app .
FROM php:8.2-fpm-alpine

RUN apk add --no-cache libzip-dev libpng-dev libjpeg-turbo-dev libwebp-dev freetype-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install pdo_mysql gd zip exif opcache

COPY deploy/php.ini /usr/local/etc/php/conf.d/nishikigoi.ini
COPY api-php /var/www/api
RUN mkdir -p /var/www/storage/backups /var/www/storage/logs /var/www/api/uploads \
    && chown -R www-data:www-data /var/www/storage /var/www/api/uploads

WORKDIR /var/www/api
