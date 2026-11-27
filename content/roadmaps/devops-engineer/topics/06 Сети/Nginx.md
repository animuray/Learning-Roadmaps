---
title: Nginx
slug: nginx
description: Как устроен nginx и его конфиг, server и location, отдача статики, reverse proxy для бэкенда, HTTPS, проверка и применение конфига через nginx -t и reload.
duration: 120
level: Средний
quizSize: 10
materials:
  - title: nginx — Beginner's Guide
    url: https://nginx.org/docs/beginners_guide.html
    type: документация
  - title: nginx — документация
    url: https://nginx.org/docs/
    type: документация
  - title: DigitalOcean — Установка Nginx в Ubuntu (на русском)
    url: https://www.digitalocean.com/community/tutorials/how-to-install-nginx-on-ubuntu-20-04-ru
    type: статья
---

# Nginx

**nginx** — веб-сервер и **reverse proxy**. Его создал Игорь Сысоев. На практике nginx стоит перед приложением и:

- принимает соединения из интернета на портах 80 и 443;
- завершает HTTPS (TLS-терминация);
- отдаёт статические файлы (собранный фронтенд);
- проксирует запросы к API на бэкенд;
- балансирует нагрузку между несколькими бэкендами;
- кэширует, сжимает ответы и ограничивает частоту запросов.

## Архитектура

Один **master**-процесс (читает конфиг, управляет) и несколько **worker**-процессов (обслуживают соединения). Воркеры асинхронные: один воркер держит тысячи соединений. При `reload` мастер проверяет новый конфиг, запускает новых воркеров и плавно завершает старых — соединения не обрываются.

## Устройство конфига

```bash
sudo apt install nginx
nginx -v
ls /etc/nginx/
# nginx.conf  conf.d/  sites-available/  sites-enabled/ (Debian/Ubuntu)
```

Конфиг — дерево **директив** и **блоков**:

```nginx
# /etc/nginx/nginx.conf (фрагмент)
user www-data;
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    access_log    /var/log/nginx/access.log;
    error_log     /var/log/nginx/error.log;
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

- **http** — всё про HTTP;
- **server** — виртуальный хост: какой порт и какие имена он обслуживает;
- **location** — правила для путей внутри сайта.

В Debian и Ubuntu сайты описывают в `sites-available/` и включают символической ссылкой в `sites-enabled/`. В RHEL-семействе — файлы `.conf` в `conf.d/`.

## Сайт со статикой и прокси на API

```nginx
# /etc/nginx/sites-available/myapp
server {
    listen 80;
    server_name myapp.example.com;

    root /var/www/myapp/dist;      # собранный фронтенд
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;    # SPA: неизвестные пути отдаём index.html
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;    # бэкенд
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location = /health {
        access_log off;
        return 200 "ok\n";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo nginx -t                    # ПРОВЕРИТЬ конфиг
sudo nginx -s reload             # применить без остановки (или systemctl reload nginx)
```

> [!important] Всегда nginx -t перед reload
> Если в конфиге ошибка, `nginx -t` её покажет, а работающий nginx продолжит обслуживать запросы со старым конфигом. Применяйте изменения через **reload**, а не restart: restart рвёт активные соединения и, если конфиг сломан, nginx просто не запустится.

### Тонкость proxy_pass и слеша

```nginx
location /api/ { proxy_pass http://127.0.0.1:8000; }    # /api/items → /api/items
location /api/ { proxy_pass http://127.0.0.1:8000/; }   # /api/items → /items (префикс /api/ отрезан)
```

### Как nginx выбирает location

1. Точное совпадение `location = /path` — сразу выигрывает.
2. Самый длинный префикс; если у него модификатор `^~`, регулярные выражения не проверяются.
3. Регулярные выражения `~` (с учётом регистра) и `~*` (без) — по порядку в файле, первое подходящее.
4. Если регулярки не подошли — самый длинный префикс из шага 2.

## HTTPS

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name myapp.example.com;

    ssl_certificate     /etc/letsencrypt/live/myapp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myapp.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # ... location как выше
}

server {
    listen 80;
    server_name myapp.example.com;
    return 301 https://$host$request_uri;    # всех на HTTPS
}
```

Проще всего получить сертификат и прописать эти строки — через `certbot --nginx`. (В версиях nginx старше 1.25.1 вместо `http2 on;` пишут `listen 443 ssl http2;`.)

## Логи и отладка

```bash
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
sudo nginx -T | less        # итоговый конфиг со всеми include
curl -I -H "Host: myapp.example.com" http://127.0.0.1/
```

Частые ошибки:

| Симптом | Причина |
| --- | --- |
| **502 Bad Gateway**, в error.log `connect() failed (111: Connection refused)` | Бэкенд не запущен или слушает другой порт |
| **504 Gateway Timeout** | Бэкенд отвечает дольше `proxy_read_timeout` |
| **403 Forbidden** на статике | Нет прав у пользователя nginx на файлы или каталоги (`namei -l путь`) или нет index-файла |
| **404** на путях SPA при обновлении страницы | Нет `try_files … /index.html` |
| Открывается не тот сайт | Не совпал `server_name`, сработал `default_server` |
| **413 Request Entity Too Large** | Большая загрузка: увеличить `client_max_body_size` |

## Практика

- [ ] Установить nginx, найти master- и worker-процессы в `ps`, изучить `/etc/nginx/nginx.conf`
- [ ] Отдать собранный фронтенд из проекта через `root` и `try_files`
- [ ] Настроить `location /api/` как reverse proxy на бэкенд своего приложения с заголовками X-Forwarded-*
- [ ] Специально сломать конфиг и увидеть, что `nginx -t` ловит ошибку; убедиться, что `reload` с ошибкой не роняет сайт
- [ ] Остановить бэкенд и получить 502, найти причину в error.log
- [ ] Подключить HTTPS: самоподписанный сертификат для теста или Let's Encrypt, если есть домен; настроить редирект с HTTP на HTTPS

## Тест

### Что такое reverse proxy?
- [ ] Прокси, через который клиенты выходят в интернет
- [x] Сервер, который принимает запросы клиентов и пересылает их на бэкенды, возвращая клиенту ответ
- [ ] Программа для обратной записи логов
- [ ] DNS-сервер
> Клиент общается только с nginx, бэкенды скрыты за ним.

### Какой командой проверить синтаксис конфигурации nginx?
= sudo nginx -t
= nginx -t
> `nginx -T` дополнительно выводит итоговый конфиг.

### Почему изменения конфига nginx применяют через reload, а не restart?
- [x] reload плавно заменяет воркеров без обрыва активных соединений
- [x] При ошибке в конфиге reload не применится, и nginx продолжит работать со старым конфигом, а restart оставит сервис лежать
- [ ] restart не перечитывает конфиг
- [ ] reload быстрее перезагружает сервер
> Последовательность: `nginx -t`, затем `nginx -s reload`.

### Что задаёт блок server в nginx?
- [ ] Адрес бэкенда
- [x] Виртуальный хост: на каком порту и для каких имён (server_name) обслуживаются запросы
- [ ] Число воркеров
- [ ] Путь к логам
> Внутри server — блоки location для разных путей.

### Какая директива пересылает запросы на бэкенд?
= proxy_pass
> Например: `proxy_pass http://127.0.0.1:8000;`

### Чем отличаются proxy_pass http://127.0.0.1:8000; и proxy_pass http://127.0.0.1:8000/; в location /api/?
- [ ] Ничем
- [x] Без слеша путь передаётся как есть (/api/items), со слешем префикс location заменяется на / (/items)
- [ ] Со слешем включается HTTPS
- [ ] Без слеша nginx не запустится
> Частая причина 404 от бэкенда после настройки прокси.

### Зачем в location / для SPA пишут try_files $uri $uri/ /index.html?
- [ ] Чтобы включить кэширование
- [x] Чтобы на неизвестные пути отдавать index.html, а маршрутизацию выполнял фронтенд
- [ ] Чтобы запретить доступ к файлам
- [ ] Чтобы перенаправить на бэкенд
> Иначе при обновлении страницы /items будет 404.

### Nginx отдаёт 502, в error.log — connect() failed (111: Connection refused) while connecting to upstream. В чём причина?
- [ ] Ошибка в сертификате
- [x] Бэкенд не запущен или слушает не тот адрес или порт
- [ ] У клиента неверный DNS
- [ ] Закончилось место на диске
> Проверьте `systemctl status` бэкенда и `ss -tulpn`.

### Какие заголовки стоит передавать бэкенду через proxy_set_header, чтобы он знал исходный хост и IP клиента?
- [x] Host
- [x] X-Real-IP и X-Forwarded-For
- [x] X-Forwarded-Proto
- [ ] Content-Length
> Без них бэкенд видит IP nginx и может строить неправильные ссылки.

### Какой location победит для запроса /images/logo.png, если есть `location /images/` и `location ~* \.png$`?
- [ ] `location /images/` — он длиннее
- [x] `location ~* \.png$` — регулярные выражения проверяются после префиксов и выигрывают, если префикс без ^~
- [ ] Будет ошибка конфигурации
- [ ] Ни один
> Чтобы победил префикс, ему добавляют модификатор `^~`.

### Как перенаправить все HTTP-запросы на HTTPS?
- [ ] proxy_pass https://$host;
- [x] В server на порту 80 указать return 301 https://$host$request_uri;
- [ ] listen 80 ssl;
- [ ] ssl_redirect on;
> Код 301 — постоянное перенаправление.

### При загрузке файла пользователи получают 413 Request Entity Too Large. Что изменить?
- [ ] proxy_read_timeout
- [x] client_max_body_size
- [ ] worker_connections
- [ ] keepalive_timeout
> По умолчанию лимит тела запроса — 1 МБ.

### Статика отдаёт 403 Forbidden, хотя файлы на месте. Что проверить?
- [x] Права пользователя nginx на файлы и все каталоги по пути (namei -l путь)
- [x] Есть ли index-файл, если запрошен каталог
- [ ] Свободную оперативную память
- [ ] Сертификат
> Пользователю www-data нужно право x на каждый каталог по пути и r на файлы.
