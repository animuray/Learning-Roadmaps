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
