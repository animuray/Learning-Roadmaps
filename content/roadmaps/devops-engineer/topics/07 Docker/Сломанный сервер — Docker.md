---
title: Сломанный сервер — Docker
slug: slomannyj-server-docker
description: Аварии с контейнерами без подсказок в условии — порт опубликован, а соединение рвётся; база перезапускается по кругу; воркер не может писать в том. Алгоритм — ps, logs, inspect, exec.
duration: 60
level: Практика
quizSize: 10
---

# Сломанный сервер — Docker

Контейнер — это процесс с изоляцией. Поэтому диагностика та же, что у службы, только смотреть нужно с двух сторон: снаружи (хост, порты, тома) и изнутри (что видит процесс).

## Алгоритм «контейнер не работает»

1. `docker ps -a` — статус: `Up`, `Exited (1)`, `Restarting`. Код выхода говорит многое: `0` — процесс просто закончил работу, `1` — ошибка приложения, `137` — убит SIGKILL (часто OOM), `126/127` — не запустилась команда.
2. `docker logs --tail 50 имя` — что приложение сказало перед смертью. Для compose: `docker compose logs сервис`.
3. `docker inspect имя` — итог: команда, переменные (`Config.Env`), пользователь (`Config.User`), тома (`Mounts`), порты, `RestartCount`, `State.OOMKilled`.
4. Изнутри: `docker exec -it имя sh` — какие порты слушает процесс (`ss -ltn` или `cat /proc/net/tcp`), видны ли файлы, кто владелец.
5. Починить **в источнике** — `compose.yaml`, `.env`, Dockerfile — и пересоздать: `docker compose up -d`. Правка «руками внутри контейнера» исчезнет при следующем пересоздании.

## Частые поломки

| Симптом | Частая причина |
| --- | --- |
| `curl: (56) Connection reset` / `Empty reply` на опубликованном порту | приложение слушает `127.0.0.1` внутри контейнера или другой порт, чем в `ports:` |
| `Restarting` по кругу | ошибка конфигурации: нет переменной, не тот пароль, нет файла |
| `Permission denied` в томе | процесс в контейнере работает не от root, а каталог на хосте принадлежит root |
| `Exited (137)`, `OOMKilled: true` | лимит памяти |
| Изменения в compose не применились | не пересоздали контейнер (`up -d`), `restart` берёт старую конфигурацию |

## Практика

- [ ] Пройти задачи лаборатории, первые 10 минут без подсказки
- [ ] Для каждой записать: симптом → команды → причина → решение
- [ ] В своём проекте специально запустить бэкенд на `127.0.0.1` внутри контейнера и посмотреть, как это выглядит снаружи

## Лаборатория

```bash lib
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
# lab_project имя каталог — убрать compose-проект вместе с томами и создать каталог заново
lab_project() {
  [ -f "$2/compose.yaml" ] && docker compose -p "$1" -f "$2/compose.yaml" down -v --remove-orphans >/dev/null 2>&1
  docker ps -aq --filter "label=com.docker.compose.project=$1" | xargs -r docker rm -f >/dev/null 2>&1
  docker volume ls -q --filter "label=com.docker.compose.project=$1" | xargs -r docker volume rm >/dev/null 2>&1
  rm -rf "$2"; mkdir -p "$2"
}
# lab_cid проект сервис — ID контейнера сервиса
lab_cid() { docker ps -q --filter "label=com.docker.compose.project=$1" --filter "label=com.docker.compose.service=$2" | head -1; }
```

### Порт опубликован, а сайт не отвечает

Сайт магазина запускается через compose из каталога **`/srv/bs-shop`** и должен открываться на `http://127.0.0.1:8160/`. Контейнер в статусе `Up`, но запрос обрывается без ответа.

Почините так, чтобы сайт открывался, и исправление пережило пересоздание контейнера.

```bash setup
lab_img python:3.12-slim
lab_project bs-shop /srv/bs-shop
mkdir -p /srv/bs-shop/site
echo '<h1>bs-shop</h1>' > /srv/bs-shop/site/index.html
cat > /srv/bs-shop/compose.yaml <<'EOF'
name: bs-shop
services:
  web:
    image: python:3.12-slim
    command: ["python", "-m", "http.server", "8000", "--bind", "127.0.0.1", "--directory", "/site"]
    volumes:
      - ./site:/site:ro
    ports:
      - "8160:8080"
    restart: unless-stopped
EOF
chown -R student:student /srv/bs-shop
docker compose -f /srv/bs-shop/compose.yaml up -d --quiet-pull >/dev/null 2>&1
```

```bash check
id=$(lab_cid bs-shop web)
[ -n "$id" ] || fail "Контейнер сервиса web проекта bs-shop не запущен"
r=$(curl -s --max-time 3 http://127.0.0.1:8160/)
echo "$r" | grep -q 'bs-shop' || fail "http://127.0.0.1:8160/ не отдаёт сайт"
docker inspect -f '{{json .Config.Cmd}}' "$id" | grep -q '127\.0\.0\.1' && fail "Сайт отвечает, но контейнер запущен не из исправленной конфигурации"
grep -q '127\.0\.0\.1' /srv/bs-shop/compose.yaml && ! grep -qE '"?127\.0\.0\.1:8160:' /srv/bs-shop/compose.yaml && fail "В /srv/bs-shop/compose.yaml осталась старая конфигурация — после пересоздания сайт снова пропадёт"
ok "сайт bs-shop открывается на 8160: $r"
```

```text hint
1. Сравнить, на какой порт контейнера ведёт публикация, и какой порт на самом деле слушает процесс внутри контейнера — и на каком адресе.
2. Адрес «только для себя» внутри контейнера недоступен даже с хоста: трафик приходит на сетевой интерфейс контейнера, а не на его loopback.
3. Исправить конфигурацию compose и пересоздать контейнер, затем проверить запрос.
```

```bash solution
cd /srv/bs-shop
docker compose ps
docker compose port web 8080
docker compose exec -T web cat /proc/net/tcp </dev/null
sed -i 's/"--bind", "127.0.0.1"/"--bind", "0.0.0.0"/; s/"8160:8080"/"8160:8000"/' compose.yaml
docker compose up -d
sleep 2
curl -s http://127.0.0.1:8160/
```

```text review
Две поломки сразу:

1. `ports: "8160:8080"` — публикация ведёт на порт 8080 контейнера, а приложение слушает 8000.
2. `--bind 127.0.0.1` — приложение слушает loopback **внутри** контейнера. Docker пробрасывает трафик на интерфейс `eth0` контейнера, и там никто не слушает: `Connection reset` / `Empty reply`.

- Внутри контейнера сервер должен слушать `0.0.0.0`. Ограничивать доступ снаружи — задача публикации: `"127.0.0.1:8160:8000"` открывает порт только для хоста.
- Порядок в `ports`: `ХОСТ:КОНТЕЙНЕР`. `docker compose port web 8000` показывает, куда опубликован порт контейнера.
- Слушающие сокеты внутри минимального образа без `ss` можно посмотреть в `/proc/net/tcp` (адреса в hex: `0100007F` — 127.0.0.1, `00000000` — 0.0.0.0).
- После правки `compose.yaml` нужен `docker compose up -d` — он пересоздаёт изменившиеся сервисы. `docker compose restart` перезапускает контейнер со старой конфигурацией.
```

```text notes
compose\s+restart => compose restart не применяет изменения compose.yaml — контейнер нужно пересоздать (up -d).
docker\s+run\b => Контейнер запускали вручную через docker run — такой запуск не переживёт следующий деплой из compose.
```

### База перезапускается по кругу

База для магазина поднимается через compose из каталога **`/srv/bs-db`** и должна принимать подключения на `127.0.0.1:8161` (база `shop`, пользователь `postgres`, пароль — в файле настроек проекта). Контейнер постоянно перезапускается.

Почините так, чтобы база работала, данные хранились в томе проекта, а войти можно было только с паролем.

```bash setup
lab_img postgres:16-alpine
lab_project bs-db /srv/bs-db
cat > /srv/bs-db/compose.yaml <<'EOF'
name: bs-db
services:
  db:
    image: postgres:16-alpine
    env_file: db.env
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:8161:5432"
    restart: unless-stopped
volumes:
  pgdata:
EOF
printf 'POSTGRES_DB=shop\nPOSTGRES_PASWORD=Shop-2026-secret\n' > /srv/bs-db/db.env
chown -R student:student /srv/bs-db
docker compose -f /srv/bs-db/compose.yaml up -d --quiet-pull >/dev/null 2>&1
```

```bash check
id=$(lab_cid bs-db db)
[ -n "$id" ] || fail "Контейнер сервиса db проекта bs-db не запущен"
for i in $(seq 40); do
  PGPASSWORD=Shop-2026-secret psql -h 127.0.0.1 -p 8161 -U postgres -d shop -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done
st=$(docker inspect -f '{{.State.Status}}' "$id")
PGPASSWORD=Shop-2026-secret psql -h 127.0.0.1 -p 8161 -U postgres -d shop -tAc 'select 1' >/dev/null 2>&1 \
  || fail "К базе shop на 127.0.0.1:8161 не подключиться с паролем из настроек проекта (контейнер: $st)"
PGPASSWORD=wrong-password psql -h 127.0.0.1 -p 8161 -U postgres -d shop -tAc 'select 1' >/dev/null 2>&1 \
  && fail "База пускает с неверным паролем"
docker inspect -f '{{range .Mounts}}{{.Type}}:{{.Destination}} {{end}}' "$id" | grep -q 'volume:/var/lib/postgresql/data' \
  || fail "Данные базы хранятся не в томе"
docker volume ls -q --filter label=com.docker.compose.project=bs-db | grep -q pgdata || fail "Нет тома pgdata проекта bs-db"
ok "база shop принимает подключения на 8161 по паролю, данные — в томе"
```

```text hint
1. Статус контейнера и его журнал: последнее, что пишет образ перед выходом.
2. Сравнить, что образ ожидает получить (в журнале названа нужная настройка), с тем, что реально попало в окружение контейнера.
3. Исправить файл настроек проекта и пересоздать сервис; первая инициализация базы занимает несколько секунд.
```

```bash solution
cd /srv/bs-db
docker compose ps -a
docker compose logs --tail 5 db
docker compose exec -T db env </dev/null 2>/dev/null | grep POSTGRES || docker inspect -f '{{json .Config.Env}}' "$(docker compose ps -aq db)"
sed -i 's/^POSTGRES_PASWORD=/POSTGRES_PASSWORD=/' db.env
docker compose up -d
for i in $(seq 30); do docker compose exec -T db pg_isready -q </dev/null 2>/dev/null && break; sleep 1; done
PGPASSWORD=Shop-2026-secret psql -h 127.0.0.1 -p 8161 -U postgres -d shop -c 'select version()'
```

```text review
Причина: опечатка в `db.env` — `POSTGRES_PASWORD`. Образ postgres при первом запуске на пустом томе требует `POSTGRES_PASSWORD` и без него завершается с ошибкой «superuser password is not specified»; `restart: unless-stopped` запускает его снова — бесконечный цикл.

- Переменные `POSTGRES_*` действуют **только при инициализации пустого тома**. Если том уже создан, смена пароля в `env` ничего не изменит — меняют `ALTER ROLE ... PASSWORD` внутри базы. Поэтому `down -v` «для надёжности» на проде — это удаление всех данных.
- `POSTGRES_HOST_AUTH_METHOD=trust` «тоже чинит» — и открывает базу без пароля. Не делайте так даже временно.
- Что реально получил контейнер — `docker inspect -f '{{json .Config.Env}}'`, а итоговую конфигурацию compose со всеми подстановками — `docker compose config`.
- Публикация на `127.0.0.1:8161` — база доступна только с хоста; наружу её не открывают.
```

```text notes
HOST_AUTH_METHOD => Пробовали POSTGRES_HOST_AUTH_METHOD — с trust база пускает без пароля.
down\s+[^\n]*-v\b => Использовался down -v — он удаляет тома проекта вместе с данными базы.
```

### Воркер не может писать

Фоновый воркер из **`/srv/bs-worker`** (compose) каждую секунду обновляет файл `data/heartbeat` в каталоге проекта. Контейнер в статусе `Up`, а файла нет.

Почините так, чтобы воркер работал и писал heartbeat. Воркер по требованиям безопасности должен работать **не от root** — пользователя в конфигурации не меняйте.

```bash setup
lab_img python:3.12-slim
lab_project bs-worker /srv/bs-worker
cat > /srv/bs-worker/worker.py <<'EOF'
import time, datetime
while True:
    try:
        with open("/data/heartbeat", "w") as f:
            f.write(datetime.datetime.now().isoformat() + "\n")
    except OSError as e:
        print("heartbeat write failed:", e, flush=True)
    time.sleep(1)
EOF
cat > /srv/bs-worker/compose.yaml <<'EOF'
name: bs-worker
services:
  worker:
    image: python:3.12-slim
    user: "1000:1000"
    command: ["python", "-u", "/app/worker.py"]
    volumes:
      - ./worker.py:/app/worker.py:ro
      - ./data:/data
    restart: unless-stopped
EOF
chown -R student:student /srv/bs-worker
mkdir -p /srv/bs-worker/data && chown root:root /srv/bs-worker/data && chmod 755 /srv/bs-worker/data
docker compose -f /srv/bs-worker/compose.yaml up -d --quiet-pull >/dev/null 2>&1
```

```bash check
id=$(lab_cid bs-worker worker)
[ -n "$id" ] || fail "Контейнер воркера не запущен"
u=$(docker inspect -f '{{.Config.User}}' "$id")
case "$u" in ""|0|0:*|root|root:*) fail "Воркер работает от root";; esac
grep -qE 'user:\s*"?1000:1000' /srv/bs-worker/compose.yaml || fail "Пользователь воркера в compose.yaml изменён"
d=/srv/bs-worker/data
[ -d "$d" ] || fail "Нет каталога $d"
[ $(( 0$(stat -c %a "$d") & 2 )) -ne 0 ] && fail "Каталог $d доступен на запись всем пользователям"
f=$d/heartbeat
for i in $(seq 10); do [ -f "$f" ] && [ $(( $(date +%s) - $(stat -c %Y "$f") )) -le 3 ] && break; sleep 0.5; done
[ -f "$f" ] || fail "Файла $f нет"
[ $(( $(date +%s) - $(stat -c %Y "$f") )) -le 3 ] || fail "Файл $f не обновляется"
[ "$(docker inspect -f '{{.State.Status}}' "$id")" = running ] || fail "Контейнер воркера не в состоянии running"
ok "воркер от $u пишет heartbeat: $(cat "$f")"
```

```text hint
1. Журнал контейнера покажет, какая операция не удалась и с каким файлом.
2. Сравнить, от какого пользователя работает процесс в контейнере, и кому на хосте принадлежит подключённый каталог (по числовым идентификаторам).
3. Отдать каталог данных этому пользователю на хосте, не открывая его на запись всем; воркер повторяет запись каждую секунду и подхватит изменение сам.
```

```bash solution
cd /srv/bs-worker
docker compose ps -a
docker compose logs --tail 5 worker
docker inspect -f '{{.Config.User}}' "$(docker compose ps -aq worker)"
ls -ln .
sudo chown 1000:1000 data
sleep 3
cat data/heartbeat
```

```text review
Причина: воркер работает от `1000:1000`, а каталог `data` на хосте — `root:root 755`. Bind mount передаёт права как есть: в контейнере тот же владелец и те же биты, сопоставление идёт по **числовым** UID/GID, а не по именам.

- Правильное решение — владелец каталога = UID процесса в контейнере (`chown 1000:1000`), либо группа с правом записи. `chmod 777` «работает», но открывает каталог всем пользователям хоста.
- Запуск от root «тоже чинит» — и отменяет смысл `user:` в конфиге: уязвимость в приложении сразу даёт root внутри контейнера.
- С именованными томами (`volumes:` без `./`) Docker при первом подключении копирует владельца из образа — поэтому в образах заранее делают `chown` каталога данных. С bind mount этого не происходит.
- `ls -ln` показывает числовые UID/GID — то, что видит контейнер.
```

```text notes
chmod\s+[^\n]*(777|o\+w|a\+w) => Каталог открывали на запись всем — достаточно отдать его UID процесса воркера.
```

## Тест

### Контейнер в статусе Up, порт опубликован, а curl получает «Empty reply from server». Частая причина?
- [ ] Docker не запущен
- [x] Приложение внутри контейнера слушает 127.0.0.1 или другой порт, чем в публикации
- [ ] На хосте закончилось место
- [ ] Неверный тег образа
> Трафик приходит на интерфейс контейнера; если там никто не слушает нужный порт, соединение обрывается.

### В ports: "8160:8000" — что из чисел что?
- [ ] 8160 — порт в контейнере, 8000 — на хосте
- [x] 8160 — порт на хосте, 8000 — порт в контейнере
- [ ] Оба — порты в контейнере
- [ ] Это диапазон портов 8000–8160
> Формат `ХОСТ:КОНТЕЙНЕР`, можно с адресом хоста: `127.0.0.1:8160:8000`.

### Как открыть порт контейнера только для самого хоста, а не для всей сети?
- [ ] Запустить приложение на 127.0.0.1 внутри контейнера
- [x] Публиковать с адресом: "127.0.0.1:8160:8000"
- [ ] Не публиковать порт и обращаться по localhost
- [ ] Включить ufw
> Внутри контейнер слушает `0.0.0.0`, а ограничение задаётся при публикации.

### Вы поменяли environment в compose.yaml. Какая команда применит изменения?
- [ ] docker compose restart
- [x] docker compose up -d
- [ ] docker restart имя
- [ ] docker compose start
> `up -d` пересоздаёт сервисы с изменившейся конфигурацией; restart перезапускает старый контейнер.

### Контейнер постоянно в статусе Restarting. Что смотреть первым?
= docker logs
= docker compose logs
= docker logs имя
> Журнал покажет ошибку, после которой процесс завершается и перезапускается политикой restart.

### Сменили POSTGRES_PASSWORD в compose и пересоздали контейнер — старый пароль всё ещё работает. Почему?
- [ ] Docker кеширует переменные
- [x] Переменные POSTGRES_* применяются только при инициализации пустого тома; база уже существует
- [ ] Нужно перезагрузить хост
- [ ] Пароль хранится в образе
> Пароль меняют в самой базе (`ALTER ROLE`), а переменная — для первого запуска.

### Чем опасна команда docker compose down -v на сервере с базой?
- [ ] Ничем, это обычная остановка
- [x] Она удаляет тома проекта вместе с данными
- [ ] Она удаляет образы
- [ ] Она удаляет compose.yaml
> `-v` — удалить именованные тома; без бэкапа данные пропадут.

### Процесс в контейнере работает от UID 1000 и получает Permission denied в bind mount. Правильное решение?
- [ ] chmod 777 на каталог
- [ ] Запустить контейнер от root
- [x] Сделать владельцем каталога на хосте UID 1000 (или дать группе право записи)
- [ ] Перейти на tmpfs
> Права в bind mount — права хоста, сопоставление по числовому UID.

### Как увидеть, какие переменные окружения реально получил контейнер?
- [ ] cat compose.yaml
- [x] docker inspect -f '{{json .Config.Env}}' имя
- [ ] docker images
- [ ] docker compose ls
> Файл может содержать опечатку или подстановку; inspect показывает итог.

### Код выхода контейнера 137 и OOMKilled: true. Что произошло?
- [ ] Приложение завершилось успешно
- [x] Процесс убит ядром за превышение лимита памяти
- [ ] Не найден образ
- [ ] Ошибка в Dockerfile
> 137 = 128 + 9 (SIGKILL); флаг OOMKilled подтверждает причину.

### Какая команда покажет итоговую конфигурацию compose со всеми подстановками переменных и env-файлов?
= docker compose config
> `config` раскрывает `${VAR}`, `.env`, `extends` — удобно искать опечатки.

### Вы починили контейнер командой docker exec … (поправили файл внутри). Что будет после следующего деплоя?
- [ ] Исправление сохранится навсегда
- [x] Исправление пропадёт: новый контейнер создаётся из образа и конфигурации
- [ ] Docker перенесёт изменения в образ
- [ ] Деплой не запустится
> Файловая система контейнера временная; чинить нужно в Dockerfile, compose или томе.
