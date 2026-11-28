---
title: Docker Compose
slug: docker-compose
description: compose.yaml — сервисы, сети, тома, переменные, depends_on с healthcheck, профили и override-файлы; команды docker compose up, logs, exec, down.
duration: 90
level: Основы
quizSize: 10
materials:
  - title: Docker Docs — Compose file reference — services
    url: https://docs.docker.com/reference/compose-file/services/
    type: документация
  - title: Docker Docs — Control startup order (depends_on)
    url: https://docs.docker.com/compose/how-tos/startup-order/
    type: документация
  - title: Docker Docs — Networking overview
    url: https://docs.docker.com/engine/network/
    type: документация
---

# Docker Compose

Запускать пять контейнеров длинными командами `docker run` с сетями, томами и переменными неудобно и невоспроизводимо. **Compose** описывает всё приложение в одном файле `compose.yaml` (раньше — `docker-compose.yml`) и поднимает его одной командой.

> [!note] docker compose и docker-compose
> Современный Compose v2 — плагин: `docker compose` (через пробел). Старый `docker-compose` на Python устарел. Поле `version:` в начале файла больше не нужно.

## Пример: приложение + база + кэш + nginx

```yaml
services:
  app:
    build: .
    image: registry.gitlab.com/team/app:${APP_TAG:-dev}
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD}@db:5432/app
      REDIS_URL: redis://cache:6379/0
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    restart: unless-stopped
    networks: [backend, frontend]

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped
    networks: [backend]

  cache:
    image: redis:7-alpine
    networks: [backend]

  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on: [app]
    networks: [frontend]

volumes:
  pgdata:

networks:
  frontend:
  backend:
```

Что здесь важно:

- **Имя сервиса = DNS-имя** в сети проекта: приложение ходит в `db:5432` и `cache:6379`.
- Наружу опубликован **только nginx**. База и Redis доступны лишь внутри сети `backend`.
- `nginx` и `db` в разных сетях и друг друга не видят.
- Секрет `DB_PASSWORD` берётся из окружения или файла `.env` рядом с compose.yaml (его — в `.gitignore`).

## depends_on и порядок запуска

- `depends_on: [db]` гарантирует только, что контейнер db **запущен** раньше, — но не что база **готова** принимать соединения.
- `condition: service_healthy` ждёт, пока healthcheck сервиса станет `healthy`.
- `condition: service_completed_successfully` — ждать успешного завершения, например контейнера с миграциями.
- Приложение всё равно должно уметь переподключаться: база может перезапуститься и во время работы.

## Переменные

- `${VAR}` и `${VAR:-default}` подставляются из окружения shell и файла **`.env`** в каталоге проекта.
- `environment:` — переменные для контейнера; `env_file: app.env` — из файла.
- Посмотреть итоговый конфиг после подстановок: `docker compose config`.

## Команды

```bash
docker compose up -d                 # создать и запустить всё в фоне
docker compose up -d --build         # пересобрать образы перед запуском
docker compose ps
docker compose logs -f app           # логи сервиса
docker compose exec db psql -U app   # команда в работающем контейнере
docker compose run --rm app python manage.py migrate   # одноразовый контейнер
docker compose restart app
docker compose pull                  # обновить образы
docker compose up -d app             # пересоздать только изменившийся сервис
docker compose stop
docker compose down                  # остановить и удалить контейнеры и сети
docker compose down -v               # ...и тома — ДАННЫЕ БУДУТ УДАЛЕНЫ
docker compose up -d --scale app=3   # несколько экземпляров (без фиксированных ports)
```

Имя проекта — по умолчанию имя каталога; от него зависят имена контейнеров, сетей и томов (`project_pgdata`). Задать явно: `-p name` или `name:` в файле.

## Несколько окружений

- **`compose.override.yaml`** автоматически накладывается поверх `compose.yaml` — удобно для разработки (bind mount исходников, отладочные порты).
- Явно: `docker compose -f compose.yaml -f compose.prod.yaml up -d`.
- **Профили** — сервисы, которые запускаются только по запросу:

```yaml
services:
  adminer:
    image: adminer
    profiles: [debug]
```

`docker compose --profile debug up -d`.

## Compose и прод

Compose отлично подходит для разработки, тестовых стендов и небольших продов на одном сервере. Чего у него нет: нескольких хостов, автоматического переноса при падении сервера, rolling update без простоя, автомасштабирования — для этого Kubernetes.

## Практика

- [ ] Описать в compose.yaml приложение и PostgreSQL с томом и healthcheck, запустить и проверить `docker compose ps`
- [ ] Убедиться, что без `condition: service_healthy` приложение иногда стартует раньше базы и падает, а с ним — нет
- [ ] Вынести пароль в `.env`, добавить `.env` в `.gitignore` и проверить подстановку через `docker compose config`
- [ ] Добавить Redis и nginx; опубликовать наружу только nginx; проверить, что порт базы не доступен с хоста
- [ ] Сделать `compose.override.yaml` для разработки с bind mount исходников
- [ ] Выполнить `docker compose down`, затем `up` — данные базы сохранились; понять, чем опасен `down -v`

## Лаборатория

В `~/compose-app` — приложение «счётчик посещений»: `app.py` и `Dockerfile`. Приложение слушает порт 8000, хранит счётчик в Redis и берёт настройки из переменных окружения `REDIS_HOST` и `REDIS_PASSWORD`.

```bash setup
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
# lab_visits_app каталог — приложение «счётчик посещений» (Python + Redis по сырому протоколу) и его Dockerfile
lab_visits_app() {
  mkdir -p "$1"
  cat > "$1/app.py" <<'EOF'
import os, socket
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = os.environ.get("REDIS_HOST", "localhost")
PASSWORD = os.environ.get("REDIS_PASSWORD", "")

def redis(*args):
    """Минимальный клиент Redis: одна команда — один ответ."""
    with socket.create_connection((HOST, 6379), timeout=3) as s:
        def cmd(*a):
            parts = [f"*{len(a)}\r\n".encode()]
            for x in a:
                b = str(x).encode()
                parts.append(b"$" + str(len(b)).encode() + b"\r\n" + b + b"\r\n")
            s.sendall(b"".join(parts))
            return s.recv(4096).decode().strip()
        if PASSWORD:
            cmd("AUTH", PASSWORD)
        return cmd(*args)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            r = redis("INCR", "visits")
            if not r.startswith(":"):
                raise RuntimeError(r)
            code, body = 200, f"visits: {r[1:]}"
        except Exception as e:
            code, body = 500, f"redis error: {e}"
        self.send_response(code)
        self.end_headers()
        self.wfile.write(body.encode())

HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
EOF
  cat > "$1/Dockerfile" <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY app.py .
USER 10001
EXPOSE 8000
CMD ["python3", "app.py"]
EOF
}
lab_img python:3.12-slim redis:7-alpine
lab_compose_reset() {
  [ -d /home/student/compose-app ] && (cd /home/student/compose-app && docker compose down -v --remove-orphans >/dev/null 2>&1)
  docker rm -f $(docker ps -aq --filter label=com.docker.compose.project=compose-app) >/dev/null 2>&1
  docker volume rm -f $(docker volume ls -q --filter label=com.docker.compose.project=compose-app) >/dev/null 2>&1
  rm -rf /home/student/compose-app
  lab_visits_app /home/student/compose-app
  chown -R student:student /home/student/compose-app
  true
}
```

### Приложение и Redis в Compose

Опишите стек в `~/compose-app/compose.yaml` и запустите его:

- **`cache`** — `redis:7-alpine` с паролем (`redis-server --requirepass ...`), данными в **именованном томе** (`/data`) и **healthcheck**;
- **`app`** — собирается из `Dockerfile` рядом, порт **8185** хоста → 8000, получает `REDIS_HOST=cache` и пароль, **стартует только после того, как cache стал healthy**;
- пароль Redis — **не в compose.yaml**, а в файле `.env` рядом (переменная `REDIS_PASSWORD`).

`curl localhost:8185` должен отвечать `visits: N`, и N растёт с каждым запросом.

```bash setup
lab_compose_reset
```

```bash check
d=/home/student/compose-app
[ -f $d/compose.yaml ] || [ -f $d/docker-compose.yml ] || fail "Нет ~/compose-app/compose.yaml"
[ -f $d/.env ] || fail "Нет ~/compose-app/.env"
pw=$(sed -n 's/^REDIS_PASSWORD=//p' $d/.env | tr -d '"'"'"' ')
[ -n "$pw" ] || fail "В .env нет непустой переменной REDIS_PASSWORD"
grep -qF -- "$pw" $d/compose.y*ml && fail "Пароль записан прямо в compose-файле"
cfg=$(su - student -c 'cd ~/compose-app && docker compose config --format json' 2>/dev/null) || fail "docker compose config находит ошибку в описании стека"
[ "$(echo "$cfg" | jq -r '.services.app.depends_on.cache.condition // empty')" = service_healthy ] || fail "app не ждёт, пока cache станет healthy"
echo "$cfg" | jq -e '.services.cache.healthcheck.test' >/dev/null || fail "У cache нет healthcheck"
echo "$cfg" | jq -e '.services.cache.volumes[]? | select(.type == "volume" and .target == "/data")' >/dev/null || fail "Данные cache (/data) не в именованном томе"
ps=$(su - student -c 'cd ~/compose-app && docker compose ps --format json' 2>/dev/null | jq -s 'if type == "array" and (.[0] | type) == "array" then .[0] else . end')
[ "$(echo "$ps" | jq -r '.[] | select(.Service == "cache") | .Health')" = healthy ] || fail "Сервис cache не запущен или не healthy"
[ "$(echo "$ps" | jq -r '.[] | select(.Service == "app") | .State')" = running ] || fail "Сервис app не запущен"
r1=$(curl -s --max-time 3 localhost:8185); r2=$(curl -s --max-time 3 localhost:8185)
n1=${r1#visits: }; n2=${r2#visits: }
[[ "$n1" =~ ^[0-9]+$ ]] && [ "$n2" -gt "$n1" ] 2>/dev/null || fail "localhost:8185 отвечает «$r2»"
ok "стек работает: $r2"
```

```text hint
1. В compose-файле два сервиса. У кэша: образ, команда запуска с паролем из переменной, том для данных, проверка здоровья (утилита redis-cli внутри образа умеет ping с паролем).
2. У приложения: сборка из текущего каталога, публикация порта, переменные окружения, зависимость от кэша с условием «здоров».
3. Именованный том объявляется в отдельном разделе верхнего уровня. Переменные вида ${ИМЯ} Compose подставляет из файла .env рядом.
4. Проверить итоговую конфигурацию с подставленными значениями и поднять стек в фоне со сборкой.
```

```bash solution
cd ~/compose-app
echo "REDIS_PASSWORD=$(tr -dc a-zA-Z0-9 </dev/urandom | head -c 20)" > .env
cat > compose.yaml <<'EOF'
services:
  app:
    build: .
    ports:
      - "8185:8000"
    environment:
      REDIS_HOST: cache
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    depends_on:
      cache:
        condition: service_healthy

  cache:
    image: redis:7-alpine
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"]
    volumes:
      - cache-data:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$$REDIS_PASSWORD\" --no-auth-warning ping | grep -q PONG"]
      interval: 3s
      timeout: 3s
      retries: 10
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}

volumes:
  cache-data:
EOF
docker compose config --quiet && docker compose up -d --build --wait
curl -s localhost:8185; echo; curl -s localhost:8185; echo
```

```text review
Эталон — в «Решении».

- `depends_on` без условия ждёт только **запуска** контейнера, а не готовности сервиса — приложение стартует раньше базы и падает. `condition: service_healthy` + healthcheck решают это.
- `.env` рядом с compose-файлом подставляется в `${...}` автоматически. Сам `.env` — в `.gitignore`, в репозиторий кладут `.env.example`. Проверить подстановку: `docker compose config`.
- `$$` в healthcheck — экранирование: переменную раскроет оболочка в контейнере, а не Compose при чтении файла.
- `docker compose up -d --build --wait` — собрать, запустить и дождаться healthy; `logs -f app`, `ps`, `exec cache sh` — повседневные команды.
- Порт Redis не публикуется: приложение ходит к нему по внутренней сети проекта по имени `cache`.
```

```text notes
ports:\s*\n\s*-\s*["']?6379 => Порт Redis публиковался наружу — приложению он доступен по внутренней сети и так.
```

### Пересоздать стек и не потерять данные

Стек в `~/compose-app` запущен, счётчик посещений уже набежал. Пересоздайте стек **полностью** — остановите и удалите контейнеры и сеть проекта, затем поднимите заново, — так, чтобы **счётчик не обнулился**.

```bash setup
lab_compose_reset
cd /home/student/compose-app
echo "REDIS_PASSWORD=lab-$(tr -dc a-z0-9 </dev/urandom | head -c 12)" > .env
cat > compose.yaml <<'EOF'
services:
  app:
    build: .
    ports:
      - "8185:8000"
    environment:
      REDIS_HOST: cache
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    depends_on:
      cache:
        condition: service_healthy
  cache:
    image: redis:7-alpine
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"]
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    volumes:
      - cache-data:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$$REDIS_PASSWORD\" --no-auth-warning ping | grep -q PONG"]
      interval: 3s
      retries: 10
volumes:
  cache-data:
EOF
chown -R student:student /home/student/compose-app
su - student -c 'cd ~/compose-app && docker compose up -d --build --wait' >/dev/null 2>&1
for i in $(seq 41); do curl -s localhost:8185 >/dev/null; done
docker ps -q --no-trunc --filter label=com.docker.compose.project=compose-app | sort > /var/lib/lab/compose-ids
```

```bash check
r=$(curl -s --max-time 3 localhost:8185); n=${r#visits: }
[[ "$n" =~ ^[0-9]+$ ]] || fail "Стек не отвечает на localhost:8185 («$r»)"
now=$(docker ps -q --no-trunc --filter label=com.docker.compose.project=compose-app | sort)
[ -z "$(comm -12 /var/lib/lab/compose-ids <(echo "$now"))" ] || fail "Контейнеры стека не пересоздавались"
[ "$n" -gt 41 ] || fail "Счётчик обнулился: $r — данные Redis потеряны"
ok "после пересоздания: $r"
```

```text hint
1. У Compose есть команда, которая останавливает и удаляет контейнеры и сети проекта, и команда, которая поднимает его снова.
2. У команды удаления есть ключ, который удаляет ещё и тома, — именно его использовать нельзя.
```

```bash solution
cd ~/compose-app
docker compose down
docker volume ls | grep cache-data
docker compose up -d --wait
curl -s localhost:8185
```

```text review
Эталон: `docker compose down` → `docker compose up -d`.

- `down` удаляет контейнеры и сети, **тома остаются**. `down -v` удаляет и именованные тома проекта — минус база. Это одна из самых частых катастроф с Compose.
- `docker compose restart` перезапускает контейнеры, не пересоздавая; `up -d` после правки compose-файла пересоздаёт только изменённые сервисы.
- Имя проекта (по умолчанию — имя каталога) входит в имена томов: `compose-app_cache-data`. Переименовали каталог — Compose создаст новый пустой том, а старый останется «потерянным».
```

```text notes
down\s+[^\n]*(-v\b|--volumes) => Использовался down -v — он удаляет тома с данными.
```

## Тест

### Как запустить все сервисы из compose.yaml в фоне?
= docker compose up -d
> С пересборкой образов — `--build`.

### По какому имени сервис app подключается к сервису db в той же сети Compose?
- [ ] По IP-адресу, который нужно узнать через inspect
- [x] По имени сервиса db
- [ ] localhost
- [ ] host.docker.internal
> Compose создаёт сеть проекта со встроенным DNS.

### Что гарантирует depends_on без условий?
- [ ] Что зависимый сервис полностью готов принимать соединения
- [x] Только порядок запуска: контейнер зависимости будет запущен раньше
- [ ] Что сервисы будут на одном хосте
- [ ] Что сервис перезапустится при падении зависимости
> Для ожидания готовности — `condition: service_healthy` и healthcheck.

### Как заставить приложение ждать, пока база реально будет готова?
- [ ] sleep 30 в CMD
- [x] Добавить базе healthcheck (например, pg_isready) и в depends_on указать condition: service_healthy
- [ ] restart: always
- [ ] links: db
> Приложение всё равно должно уметь переподключаться к базе.

### Откуда Compose по умолчанию берёт значения для подстановки ${DB_PASSWORD}?
- [x] Из переменных окружения shell
- [x] Из файла .env в каталоге проекта
- [ ] Из Dockerfile
- [ ] Из /etc/environment контейнера
> Итоговый конфиг показывает `docker compose config`.

### Чем опасна команда docker compose down -v?
- [ ] Она удаляет образы
- [x] Она удаляет тома проекта — например, данные базы данных
- [ ] Она удаляет compose.yaml
- [ ] Ничем
> Без `-v` тома сохраняются.

### Как выполнить команду psql в работающем контейнере сервиса db?
- [ ] docker compose run db psql
- [x] docker compose exec db psql -U app
- [ ] docker exec db psql (всегда)
- [ ] docker compose up db psql
> `run` создаёт новый одноразовый контейнер, `exec` — заходит в работающий.

### Для чего нужен файл compose.override.yaml?
- [ ] Он заменяет compose.yaml полностью
- [x] Он автоматически накладывается поверх compose.yaml — удобно для настроек разработки
- [ ] Это резервная копия
- [ ] Он нужен только для Kubernetes
> Явный набор файлов задают через `-f`.

### Как запустить сервис, помеченный profiles: [debug]?
- [ ] Он запускается всегда
- [x] docker compose --profile debug up -d
- [ ] docker compose up debug --force
- [ ] Только через docker run
> Профили удобны для вспомогательных инструментов: adminer, тестов, нагрузочных утилит.

### Почему в примере наружу опубликован только порт nginx?
- [ ] Compose не умеет публиковать больше одного порта
- [x] Остальные сервисы доступны друг другу по внутренней сети, а публикация базы и кэша без нужды открывает их снаружи
- [ ] База не работает с опубликованным портом
- [ ] Так быстрее
> Помните, что опубликованные порты обходят ufw.

### Как посмотреть итоговую конфигурацию Compose после подстановки переменных и слияния файлов?
= docker compose config
> Удобно для отладки .env и override-файлов.

### Чего не умеет Docker Compose по сравнению с Kubernetes?
- [x] Распределять контейнеры по нескольким серверам и переносить их при падении сервера
- [x] Делать rolling update без простоя и автомасштабирование
- [ ] Запускать несколько контейнеров
- [ ] Создавать сети и тома
> Для одного сервера Compose часто достаточно.

### От чего зависят имена контейнеров, сетей и томов, создаваемых Compose?
- [ ] От имени образа
- [x] От имени проекта — по умолчанию это имя каталога, его можно задать флагом -p или полем name
- [ ] От случайного числа
- [ ] От имени пользователя
> Например, том `pgdata` станет `myproject_pgdata`.
