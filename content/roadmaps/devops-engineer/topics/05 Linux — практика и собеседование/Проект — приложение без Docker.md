---
title: Проект — приложение без Docker
slug: proekt-prilozhenie-bez-docker
description: Главная практика по Linux — своё приложение из фронтенда, бэкенда и базы, запущенное руками на сервере, со всеми зависимостями и проблемами.
duration: 480
level: Средний
quizSize: 10
materials:
  - title: Python — venv, виртуальные окружения
    url: https://docs.python.org/3/library/venv.html
    type: документация
  - title: Apache Maven — Maven in 5 Minutes
    url: https://maven.apache.org/guides/getting-started/maven-in-five-minutes.html
    type: документация
  - title: Ubuntu Server — Install and configure PostgreSQL
    url: https://ubuntu.com/server/docs/how-to/databases/install-postgresql/
    type: документация
---

# Проект — приложение без Docker

Это главная практика блока Linux и сквозной проект всего роадмапа. Дальше вы будете упаковывать **это же приложение** в Docker, прогонять через CI/CD, деплоить в Kubernetes, мониторить и описывать инфраструктуру Terraform.

Сейчас задача — запустить его **без контейнеров**, руками на Linux, и столкнуться со всеми реальными проблемами: версиями, зависимостями, портами, правами, переменными окружения.

## Шаг 1. Сгенерировать приложение

Попросите нейросеть сгенерировать простейшее приложение из трёх частей:

- **Frontend** — страница, которая показывает список и форму добавления (React/Vue или просто HTML + JS);
- **Backend** — REST API (Python FastAPI/Flask, Node.js Express или Java Spring Boot) с эндпоинтами `/api/items` и `/health`;
- **База данных** — PostgreSQL.

Пример запроса: *«Сгенерируй простое приложение “список задач”: фронтенд на React (Vite), бэкенд на Python FastAPI, база PostgreSQL. Бэкенд берёт адрес базы из переменной окружения DATABASE_URL. Добавь /health. Без Docker. Дай структуру проекта и README с командами запуска»*.

Положите код в отдельный Git-репозиторий.

## Шаг 2. Схема

```
Браузер ──► Frontend (статические файлы, порт 5173/80)
                │  fetch /api/...
                ▼
            Backend API (порт 8000) ──► PostgreSQL (порт 5432, только localhost)
```

Нарисуйте схему в README: какие процессы, какие порты, кто к кому подключается. Это пригодится в разделе «Сети» и при упаковке в Docker.

## Шаг 3. Бэкенд руками

Python:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql://app:secret@localhost:5432/appdb"
uvicorn main:app --host 0.0.0.0 --port 8000      # или gunicorn для Flask
```

Node.js:

```bash
node --version                   # проверьте, что версия подходит проекту (поле engines в package.json)
npm ci
npm start
```

Java:

```bash
java -version && mvn -version
mvn clean package
java -jar target/app.jar
```

## Шаг 4. Фронтенд

```bash
cd frontend
npm ci
npm run dev              # режим разработки
npm run build            # сборка статических файлов в dist/
```

Собранный `dist/` — это просто HTML, JS и CSS. На сервере их будет отдавать nginx (раздел «Сети»), а пока можно `npx vite preview` или `python3 -m http.server -d dist 8081`.

## Шаг 5. База

Установка PostgreSQL, пользователь, база, права и порт — в следующей теме.

## Шаг 6. Оформить как службы

Когда всё работает руками, сделайте бэкенд службой systemd (как в теме «Свой systemd-сервис»): отдельный пользователь, `EnvironmentFile=` с `DATABASE_URL`, `Restart=on-failure`.

## Частые проблемы и как их искать

| Симптом | Вероятная причина | Как проверить |
| --- | --- | --- |
| `Address already in use` | Порт занят другим процессом (или старой копией приложения) | `sudo ss -tulpn \| grep 8000` |
| `ModuleNotFoundError` | Не активирован venv или пакет не установлен | `which python`, `pip list` |
| Конфликт версий при `pip install` | Пакеты требуют несовместимые версии, не та версия Python | `python3 --version`, зафиксировать версии в requirements.txt |
| `npm ERR! engine` или странные ошибки сборки | Не та версия Node.js | `node --version`, поставить нужную через nvm |
| `UnsupportedClassVersionError` | Jar собран новой Java, а запускается старой | `java -version`, `JAVA_HOME` |
| `Connection refused` к базе | База не запущена или слушает не тот адрес или порт | `systemctl status postgresql`, `ss -tlnp \| grep 5432` |
| `password authentication failed` | Неверный пароль или правило в pg_hba.conf | Логи PostgreSQL, `psql -h localhost -U app appdb` |
| Фронтенд открывается, а API — нет (CORS, 404) | Неверный адрес API во фронтенде, нет прокси | Инструменты разработчика в браузере → Network |
| Работает у вас, не работает с другой машины | Приложение слушает `127.0.0.1`, порт закрыт файрволом | `ss -tlnp`, `ufw status` |
| `Permission denied` | Права на файлы или каталог службы | `ls -l`, `namei -l /путь` |

Каждую непонятную ошибку разбирайте до конца и записывайте в README раздел «Проблемы и решения» — это ваша первая эксплуатационная документация.

## Практика

- [ ] Сгенерировать приложение frontend + backend + PostgreSQL и положить его в Git-репозиторий
- [ ] Нарисовать схему компонентов и портов в README
- [ ] Запустить бэкенд руками в venv (или через npm/Maven — в зависимости от языка)
- [ ] Собрать фронтенд и открыть его в браузере
- [ ] Подключить бэкенд к PostgreSQL (следующая тема) через переменную DATABASE_URL
- [ ] Оформить бэкенд как службу systemd
- [ ] Специально воспроизвести три ошибки из таблицы и починить их
- [ ] Описать в README команды запуска и раздел «Проблемы и решения»

## Лаборатория

Приложение «Заметки»: бэкенд на Python (`/opt/notes-api/app.py`, только стандартная библиотека и драйвер PostgreSQL) и база PostgreSQL. Задача — развернуть его на сервере так, как это делают без Docker.

```bash setup
# приложение и база — общие для задач темы
mkdir -p /opt/notes-api
cat > /opt/notes-api/app.py <<'EOF'
#!/usr/bin/env python3
"""Заметки: GET /health — проверка базы, GET /notes — число заметок. Настройки — из окружения."""
import os, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
import psycopg2

DSN = os.environ.get("DATABASE_URL")
PORT = int(os.environ.get("PORT", "8000"))
if not DSN:
    print("ОШИБКА: не задана переменная окружения DATABASE_URL", file=sys.stderr)
    sys.exit(1)

class Handler(BaseHTTPRequestHandler):
    def reply(self, code, text):
        self.send_response(code); self.send_header("Content-Type", "text/plain; charset=utf-8"); self.end_headers()
        self.wfile.write(text.encode())
    def do_GET(self):
        try:
            with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
                cur.execute("create table if not exists notes (id serial primary key, body text)")
                cur.execute("select count(*) from notes")
                n = cur.fetchone()[0]
        except Exception as e:
            return self.reply(500, f"db error: {e}")
        self.reply(200, "db ok" if self.path == "/health" else f"notes: {n}")

print(f"notes-api слушает 127.0.0.1:{PORT}", flush=True)
HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
EOF
chmod 755 /opt/notes-api/app.py
id notes >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin notes
sudo -u postgres psql -qXtA -c "select 1 from pg_roles where rolname = 'notes'" | grep -q 1 || sudo -u postgres psql -qX -c "CREATE ROLE notes LOGIN PASSWORD 'notes-pass'" >/dev/null
sudo -u postgres psql -qXtA -c "select 1 from pg_database where datname = 'notesdb'" | grep -q 1 || sudo -u postgres psql -qX -c "CREATE DATABASE notesdb OWNER notes" >/dev/null
```

### Бэкенд как служба

Запустите бэкенд как службу systemd **`notes-api`**:

- от системного пользователя `notes` (уже создан);
- с переменной окружения `DATABASE_URL=postgresql://notes:notes-pass@localhost/notesdb`;
- с перезапуском при падении;
- служба включена в автозапуск и работает.

Бэкенд слушает `127.0.0.1:8000`; `curl localhost:8000/health` должен отвечать `db ok`.

```bash setup
systemctl disable --now notes-api >/dev/null 2>&1
rm -rf /etc/systemd/system/notes-api.service /etc/systemd/system/notes-api.service.d
systemctl daemon-reload
```

```bash check
[ -f /etc/systemd/system/notes-api.service ] || fail "Нет /etc/systemd/system/notes-api.service"
[ "$(systemctl is-active notes-api)" = active ] || fail "Служба notes-api не работает: $(journalctl -u notes-api -n 2 --no-pager -o cat | tr '\n' ' ')"
[ "$(systemctl is-enabled notes-api)" = enabled ] || fail "Служба не в автозапуске"
[ "$(systemctl show -p User --value notes-api)" = notes ] || fail "Служба работает от «$(systemctl show -p User --value notes-api)»"
case "$(systemctl show -p Restart --value notes-api)" in always|on-failure|on-abnormal) ;; *) fail "При падении служба не перезапустится";; esac
r=$(curl -s --max-time 5 http://127.0.0.1:8000/health)
[ "$r" = "db ok" ] || fail "localhost:8000/health отвечает: «${r:-нет ответа}»"
ok "notes-api: $r, PID $(systemctl show -p MainPID --value notes-api)"
```

```text hint
1. Unit-файл службы: описание; в разделе службы — что запускать, от какого пользователя, переменная окружения и политика перезапуска; раздел установки — обычная многопользовательская загрузка.
2. Перечитать конфигурацию systemd, включить и запустить.
3. Если служба падает — первое, что смотреть, это её журнал: приложение пишет, чего ему не хватает.
```

```bash solution
sudo tee /etc/systemd/system/notes-api.service >/dev/null <<'EOF'
[Unit]
Description=Notes API
After=network.target postgresql.service

[Service]
User=notes
Environment=DATABASE_URL=postgresql://notes:notes-pass@localhost/notesdb
ExecStart=/usr/bin/python3 /opt/notes-api/app.py
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now notes-api
sleep 1
curl -s localhost:8000/health
```

```text review
Эталон — в «Решении».

- `After=postgresql.service` — порядок запуска при загрузке (если база на этом же сервере). `Requires=`/`Wants=` — зависимость, `After=` — только порядок.
- Секреты в `Environment=` видны всем через `systemctl show`. Лучше `EnvironmentFile=/etc/notes-api.env` с правами 600 или `LoadCredential=`.
- Порядок диагностики «приложение не работает»: `systemctl status` → `journalctl -u notes-api -n 50` → `ss -ltnp | grep 8000` → `curl -v localhost:8000/health`.
- Бэкенд слушает только `127.0.0.1` — наружу его выставит nginx (следующая задача). Так принято: приложение не торчит в интернет напрямую.
```

```text notes
nohup|&\s*$|screen|tmux => Бэкенд запускался вручную в фоне — после перезагрузки или падения он не поднимется. Для постоянной работы — служба systemd.
```

### nginx перед бэкендом

Бэкенд `notes-api` уже работает на `127.0.0.1:8000`. Опубликуйте его через **nginx** для сайта `notes.local`: запросы на порт 80 с заголовком `Host: notes.local` должны проксироваться на бэкенд. Сайт оформите отдельным файлом в `/etc/nginx/sites-available/` и включите. Конфигурация nginx должна проходить проверку, а сам nginx — применить её без остановки.

```bash setup
systemctl disable --now notes-api >/dev/null 2>&1
mkdir -p /etc/systemd/system
cat > /etc/systemd/system/notes-api.service <<'EOF'
[Unit]
Description=Notes API
After=network.target postgresql.service

[Service]
User=notes
Environment=DATABASE_URL=postgresql://notes:notes-pass@localhost/notesdb
ExecStart=/usr/bin/python3 /opt/notes-api/app.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now notes-api >/dev/null 2>&1
rm -f /etc/nginx/sites-enabled/notes* /etc/nginx/sites-available/notes*
nginx -t -q && systemctl reload nginx
```

```bash check
nginx -t >/dev/null 2>&1 || fail "nginx -t находит ошибку в конфигурации"
ls /etc/nginx/sites-available/ | grep -q . || fail "В /etc/nginx/sites-available/ нет файла сайта"
grep -lqs 'notes.local' /etc/nginx/sites-enabled/* || fail "Сайт notes.local не включён (в sites-enabled его нет)"
r=$(curl -s --max-time 5 -H 'Host: notes.local' http://127.0.0.1/health)
[ "$r" = "db ok" ] || fail "http://notes.local/health отвечает: «$(echo "$r" | head -c 80)» — запросы не доходят до бэкенда (конфигурация не применена или прокси настроен не туда)"
ok "notes.local → 127.0.0.1:8000: $r"
```

```text hint
1. Файл сайта: блок сервера, который слушает 80-й порт и отвечает на имя notes.local; в корневом location — проксирование на адрес бэкенда. Полезно передать бэкенду исходные Host и IP клиента заголовками.
2. Включить сайт символической ссылкой из каталога включённых сайтов.
3. Проверить синтаксис и перечитать конфигурацию nginx без остановки.
```

```bash solution
sudo tee /etc/nginx/sites-available/notes >/dev/null <<'EOF'
server {
    listen 80;
    server_name notes.local;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/notes /etc/nginx/sites-enabled/notes
sudo nginx -t
sudo systemctl reload nginx
curl -s -H 'Host: notes.local' http://127.0.0.1/health
```

```text review
Эталон — в «Решении»: `server_name notes.local` + `proxy_pass http://127.0.0.1:8000` → ссылка в `sites-enabled` → `nginx -t` → `reload`.

- `sites-available` — все конфиги, `sites-enabled` — ссылки на включённые (схема Debian/Ubuntu). В RHEL — просто файлы в `/etc/nginx/conf.d/*.conf`.
- `X-Real-IP`/`X-Forwarded-For` — без них бэкенд видит все запросы от `127.0.0.1`. `Host` — чтобы бэкенд знал, по какому имени к нему пришли.
- **Всегда** `nginx -t` перед `reload`: с ошибкой reload не применится (nginx продолжит со старым конфигом), а restart — уронит сайт.
- 502 Bad Gateway — nginx не достучался до бэкенда (не запущен, не тот порт); 504 — бэкенд не ответил вовремя. Причина — в `/var/log/nginx/error.log`.
- Следующий шаг — HTTPS: `certbot --nginx -d notes.example.com` (тема TLS).
```

```text notes
systemctl\s+restart\s+nginx => nginx перезапускался — работает, но reload применяет конфиг без разрыва текущих соединений, а при ошибке в конфиге оставляет старый.
```

## Тест

### Зачем запускать приложение сначала без Docker?
- [ ] Docker нельзя использовать на Linux
- [x] Чтобы своими руками разобраться с зависимостями, версиями, портами, правами и переменными окружения — именно это потом «упаковывается» в контейнер
- [ ] Без Docker приложение работает быстрее
- [ ] Это требование PostgreSQL
> Понимая, как приложение запускается руками, вы напишете правильный Dockerfile.

### Бэкенд не стартует с ошибкой Address already in use. Что проверить?
- [ ] Свободное место на диске
- [x] Какой процесс уже занял порт: ss -tulpn | grep 8000
- [ ] Версию Python
- [ ] Права на /etc
> Часто это старая копия приложения, запущенная в другом терминале или как служба.

### Скрипт падает с ModuleNotFoundError, хотя пакет устанавливали. Самая вероятная причина?
- [ ] Повреждён диск
- [x] Скрипт запущен не тем интерпретатором: не активирован venv, и пакеты стоят в другом окружении
- [ ] Нет прав root
- [ ] Не запущен PostgreSQL
> Проверьте `which python` и `pip list`.

### Как передать бэкенду адрес базы данных, не прописывая его в коде?
- [ ] Отредактировать /etc/hosts
- [x] Через переменную окружения, например DATABASE_URL, а в службе systemd — через EnvironmentFile
- [ ] Через аргумент в имени файла
- [ ] Никак, адрес должен быть в коде
> Конфигурация через переменные окружения — один из принципов 12-factor app. Так же это будет работать в Docker и Kubernetes.

### Java-приложение не запускается с UnsupportedClassVersionError. В чём дело?
- [ ] Неправильный порт
- [x] Приложение собрано более новой версией Java, чем та, которой его запускают
- [ ] Нет базы данных
- [ ] Не установлен Maven
> Проверьте `java -version` и `JAVA_HOME`.

### Приложение открывается на сервере через curl localhost:8000, но не открывается с вашего ноутбука. Что проверить?
- [x] Слушает ли приложение 0.0.0.0, а не только 127.0.0.1 (ss -tlnp)
- [x] Открыт ли порт в файрволе сервера и в группе безопасности облака
- [ ] Версию Python на ноутбуке
- [ ] Свободное место на ноутбуке
> 127.0.0.1 доступен только с самой машины.

### Что получится после npm run build у типичного фронтенда на React или Vue?
- [ ] Бинарный исполняемый файл
- [x] Набор статических файлов (HTML, JS, CSS) в каталоге вроде dist/, которые может отдавать любой веб-сервер
- [ ] Docker-образ
- [ ] База данных
> Поэтому в продакшене фронтенд часто отдаёт nginx.

### Чем npm ci лучше npm install для запуска на сервере?
- [ ] Устанавливает пакеты глобально
- [x] Ставит зависимости строго по package-lock.json, поэтому версии всегда одинаковые
- [ ] Не требует интернета
- [ ] Собирает фронтенд
> Воспроизводимость установки важна на серверах и в CI.

### Бэкенд пишет Connection refused при подключении к PostgreSQL. С чего начать?
- [ ] Переустановить Python
- [x] Проверить, запущена ли база и на каком адресе и порту она слушает: systemctl status postgresql, ss -tlnp | grep 5432
- [ ] Удалить venv
- [ ] Перезагрузить ноутбук
> Connection refused значит, что по этому адресу и порту никто не слушает.

### Зачем вести в README раздел «Проблемы и решения»?
- [ ] Это требование GitHub
- [x] Это первая эксплуатационная документация: вы и коллеги быстро решите те же проблемы снова, а на собеседовании будет что рассказать
- [ ] Без него приложение не запустится
- [ ] Чтобы увеличить размер репозитория
> Хорошая документация — часть работы DevOps-инженера.

### Как узнать, какую версию Node.js ожидает проект?
- [ ] По имени каталога
- [x] Посмотреть поле engines в package.json (или файл .nvmrc) и сравнить с node --version
- [ ] Выполнить npm run build
- [ ] Посмотреть /etc/os-release
> Нужную версию удобно поставить через nvm.
