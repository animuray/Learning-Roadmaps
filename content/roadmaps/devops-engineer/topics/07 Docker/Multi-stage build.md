---
title: Multi-stage build
slug: multi-stage-build
description: Сборка образа в несколько этапов — компиляция в одном, итоговый маленький образ в другом. Примеры для Go, Node.js и Python, distroless и scratch, --target.
duration: 60
level: Средний
quizSize: 10
materials:
  - title: Docker Docs — Multi-stage builds
    url: https://docs.docker.com/build/building/multi-stage/
    type: документация
  - title: Docker Docs — Building best practices
    url: https://docs.docker.com/build/building/best-practices/
    type: документация
  - title: Docker Docs — Dockerfile reference (FROM ... AS, COPY --from)
    url: https://docs.docker.com/reference/dockerfile/
    type: документация
---

# Multi-stage build

Для **сборки** приложения нужны компилятор, SDK, dev-зависимости, исходники — сотни мегабайт. Для **запуска** — только бинарник или собранные файлы. Multi-stage позволяет использовать несколько `FROM` в одном Dockerfile и перенести в итоговый образ **только результат** сборки.

## Как это работает

```dockerfile
FROM golang:1.23 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app ./cmd/app

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/app /app
USER nonroot
ENTRYPOINT ["/app"]
```

- Каждый `FROM` начинает **новый этап**; `AS имя` даёт ему имя.
- `COPY --from=build` копирует файлы из другого этапа (или из любого образа: `COPY --from=nginx:alpine /etc/nginx/nginx.conf .`).
- Итоговый образ — **последний этап**. Всё из промежуточных этапов (компилятор, исходники, кэш) в него не попадает.
- Результат: вместо ~800 МБ с golang — 5–20 МБ.

## Node.js: сборка фронтенда и nginx

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

В итоговом образе нет ни Node.js, ни `node_modules` — только nginx и статика.

## Python: зависимости отдельно

```dockerfile
FROM python:3.12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
COPY --from=build /install /usr/local
WORKDIR /app
COPY . .
USER 10001
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]
```

Компилятор нужен, чтобы собрать пакеты с C-расширениями, но в итоговом образе его нет.

## Базовые образы для итогового этапа

| Образ | Что внутри | Когда |
| --- | --- | --- |
| `scratch` | Ничего — пустая ФС | Статические бинарники Go/Rust. Нет оболочки, сертификатов, часовых поясов |
| `distroless` | Только runtime, CA-сертификаты, tzdata, пользователь nonroot. Нет оболочки и пакетного менеджера | Go, Java, Python, Node.js в проде |
| `alpine` | Минимальный дистрибутив на musl, ~5 МБ, есть sh и apk | Когда нужна оболочка для отладки |
| `*-slim` | Урезанный Debian | Python и приложения, которым нужна glibc |

> [!tip] Отладка образа без оболочки
> В distroless и scratch нельзя сделать `docker exec ... sh`. Для отладки есть варианты `:debug` у distroless и `docker debug`, либо отладочный контейнер в том же PID namespace: `docker run -it --pid=container:app --network=container:app busybox`.

## Другие приёмы

```bash
docker build --target build -t myapp:build .   # собрать только до этапа build (например, для тестов в CI)
```

```dockerfile
FROM build AS test
RUN go test ./...
```

- Этапы, от которых не зависит цель, BuildKit **пропускает** и собирает независимые этапы **параллельно**.
- Этап тестов можно собирать в CI через `--target test`, а в прод отдавать итоговый.

## Практика

- [ ] Написать multi-stage Dockerfile для программы на Go (hello world с HTTP-сервером) и сравнить размер с одноэтапным образом на `golang`
- [ ] Перенести итоговый этап на `scratch`, затем на `distroless/static` — сравнить размер и проверить, есть ли оболочка
- [ ] Собрать фронтенд (например, `npm create vite@latest`) в node и раздать его через nginx в итоговом этапе
- [ ] Добавить этап `test` и собрать его отдельно через `--target test`
- [ ] Посмотреть `docker history` итогового образа и убедиться, что слоёв этапа build там нет

## Тест

### Зачем нужен multi-stage build?
- [ ] Чтобы запускать несколько контейнеров из одного образа
- [x] Чтобы собирать приложение в одном этапе с инструментами сборки, а в итоговый образ переносить только результат — образ получается меньше и безопаснее
- [ ] Чтобы ускорить запуск контейнера
- [ ] Чтобы собирать образы для нескольких архитектур
> Для нескольких архитектур нужен `docker buildx build --platform`.

### Как скопировать файл из этапа с именем build?
- [ ] COPY build:/out/app /app
- [x] COPY --from=build /out/app /app
- [ ] ADD --stage=build /out/app /app
- [ ] FROM build COPY /out/app
> `--from` принимает имя этапа, его номер или имя любого образа.

### Какой этап становится итоговым образом?
- [ ] Первый
- [x] Последний (если не указан --target)
- [ ] Самый маленький
- [ ] Все этапы объединяются
> `--target имя` позволяет остановиться на нужном этапе.

### Попадает ли компилятор из этапа сборки в итоговый образ?
- [ ] Да, всегда
- [x] Нет: в итоговый образ попадает только то, что явно скопировано через COPY --from
- [ ] Только если он меньше 100 МБ
- [ ] Да, но в скрытом слое
> Поэтому итоговый образ не содержит исходников и инструментов.

### Что такое образ scratch?
- [ ] Образ Alpine
- [x] Полностью пустой образ — для статических бинарников
- [ ] Образ с оболочкой busybox
- [ ] Образ для отладки
> В нём нет даже CA-сертификатов и часовых поясов — их копируют отдельно при необходимости.

### Чем distroless-образы отличаются от alpine?
- [ ] Distroless больше
- [x] В distroless нет оболочки и пакетного менеджера — только runtime и необходимые файлы, а в alpine есть sh и apk
- [ ] Alpine не поддерживает Docker
- [ ] Distroless только для Windows
> Меньше утилит в образе — меньше поверхность атаки.

### Как собрать только этап test из многоэтапного Dockerfile?
= docker build --target test .
= --target test
> Удобно для запуска тестов в CI.

### Как отладить контейнер на distroless, где нет оболочки?
- [x] Использовать вариант образа с тегом debug
- [x] Запустить отладочный контейнер в том же PID и сетевом namespace: --pid=container:app --network=container:app
- [x] Использовать docker debug
- [ ] Выполнить docker exec -it app bash
> В образе без оболочки `exec ... bash` не сработает.

### Что делает BuildKit с этапами, от которых итоговый этап не зависит?
- [ ] Всегда собирает их последовательно
- [x] Пропускает их, а независимые нужные этапы собирает параллельно
- [ ] Выдаёт ошибку
- [ ] Включает их в образ
> Это ускоряет сборку.

### Зачем в примере с Go указывают CGO_ENABLED=0?
- [ ] Чтобы ускорить компиляцию
- [x] Чтобы получить статический бинарник без зависимости от libc, который запустится в scratch или distroless/static
- [ ] Чтобы включить отладку
- [ ] Это обязательно для Docker
> Динамический бинарник в scratch не найдёт libc и не запустится.

### Как отдать фронтенд, собранный в Node.js, без Node.js в итоговом образе?
- [ ] Запустить npm start в итоговом образе
- [x] Собрать статику в этапе node, а в итоговом этапе на nginx скопировать её через COPY --from
- [ ] Использовать образ node:alpine
- [ ] Это невозможно
> Итоговый образ — nginx и собранные файлы, без node_modules.

### Можно ли через COPY --from копировать файлы из обычного образа, а не из этапа?
- [x] Да, например COPY --from=nginx:alpine /etc/nginx/nginx.conf .
- [ ] Нет, только из этапов
- [ ] Только из образов в том же реестре
- [ ] Только через ADD
> Удобно для копирования бинарников, например `COPY --from=busybox /bin/wget`.
