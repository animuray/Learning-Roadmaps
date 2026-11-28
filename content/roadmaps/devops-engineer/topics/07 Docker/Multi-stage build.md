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

## Лаборатория

В `~/goapp` — веб-сервер на Go (`main.go`, только стандартная библиотека): на порту 8080 отвечает `hello from go`. Образ для сборки — `golang:1.23-alpine` (уже скачан).

```bash setup
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
lab_img golang:1.23-alpine alpine:3.20
rm -rf /home/student/goapp && mkdir -p /home/student/goapp
cat > /home/student/goapp/main.go <<'EOF'
package main

import (
	"fmt"
	"net/http"
)

func hello() string { return "hello from go" }

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, hello()) })
	http.ListenAndServe(":8080", nil)
}
EOF
cat > /home/student/goapp/main_test.go <<'EOF'
package main

import "testing"

func TestHello(t *testing.T) {
	if hello() != "hello from go" {
		t.Fatal("unexpected greeting")
	}
}
EOF
printf 'module goapp\n\ngo 1.23\n' > /home/student/goapp/go.mod
chown -R student:student /home/student/goapp
```

### Маленький образ из двух этапов

Одноэтапный образ на `golang:1.23-alpine` весит ~250 МБ — в нём весь компилятор. Напишите **multi-stage** `~/goapp/Dockerfile`: первый этап собирает бинарник, итоговый содержит **только** его. Соберите образ **`goapp:1.0`** размером **меньше 30 МБ** и запустите контейнер **`goapp`** с портом **8180** хоста → 8080.

```bash setup
lab_drm goapp
docker rmi -f goapp:1.0 >/dev/null 2>&1
rm -f /home/student/goapp/Dockerfile
true
```

```bash check
docker image inspect goapp:1.0 >/dev/null 2>&1 || fail "Образа goapp:1.0 нет"
s=$(( $(docker image inspect -f '{{.Size}}' goapp:1.0) / 1024 / 1024 ))
[ $s -lt 30 ] || fail "goapp:1.0 весит $s МБ"
[ "$(grep -ciE '^\s*FROM\s' /home/student/goapp/Dockerfile)" -ge 2 ] || fail "В Dockerfile один этап"
docker run --rm --entrypoint sh goapp:1.0 -c 'command -v go' >/dev/null 2>&1 && fail "В итоговом образе есть компилятор go"
[ "$(docker inspect -f '{{.State.Running}}' goapp 2>/dev/null)" = true ] || fail "Контейнер goapp не запущен"
r=$(curl -s --max-time 3 http://127.0.0.1:8180/)
[ "$r" = "hello from go" ] || fail "localhost:8180 отвечает «$r»"
ok "goapp:1.0 — $s МБ, отвечает: $r"
```

```text hint
1. Первый этап — образ с компилятором, у этапа есть имя. В нём скопировать исходники и собрать статический бинарник (без зависимости от системной библиотеки C — переменная окружения для компилятора Go).
2. Второй этап — минимальный образ (alpine или вообще пустой). В него скопировать готовый бинарник из первого этапа по его имени.
3. Указать команду запуска, собрать, запустить, проверить.
```

```bash solution
cat > ~/goapp/Dockerfile <<'EOF'
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod .
COPY *.go .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/app .

FROM alpine:3.20
COPY --from=build /out/app /usr/local/bin/app
USER 10001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/app"]
EOF
docker build -q -t goapp:1.0 ~/goapp
docker run -d --name goapp -p 8180:8080 goapp:1.0
sleep 1
curl -s localhost:8180; echo
docker images goapp
```

```text review
Эталон: `FROM golang AS build` → `go build` → `FROM alpine` + `COPY --from=build`.

- В итоговый образ попадает только то, что скопировано явно. Компилятор, исходники, кэш модулей остаются в промежуточном этапе.
- `CGO_ENABLED=0` — статический бинарник, работает хоть в `FROM scratch` (0 МБ сверху), но тогда нет оболочки, сертификатов (`/etc/ssl/certs` придётся копировать) и часовых поясов. Компромисс — `gcr.io/distroless/static`.
- Меньше образ — быстрее скачивание при деплое и меньше уязвимостей у сканеров (trivy).
- Так же для фронтенда: этап `node` собирает статику, итоговый `nginx` её раздаёт.
```

### Этап с тестами

Добавьте в `~/goapp/Dockerfile` отдельный этап **`test`**, который запускает тесты (`go test ./...`), и соберите **только этот этап** в образ **`goapp:test`**. Итоговый образ при обычной сборке должен по-прежнему собираться.

```bash setup
docker rmi -f goapp:test >/dev/null 2>&1
cat > /home/student/goapp/Dockerfile <<'EOF'
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod .
COPY *.go .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/app .

FROM alpine:3.20
COPY --from=build /out/app /usr/local/bin/app
USER 10001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/app"]
EOF
chown student:student /home/student/goapp/Dockerfile
```

```bash check
f=/home/student/goapp/Dockerfile
grep -qiE '^\s*FROM\s+\S+\s+AS\s+test\s*$' $f || fail "В Dockerfile нет этапа с именем test"
docker image inspect goapp:test >/dev/null 2>&1 || fail "Образа goapp:test нет"
docker history --no-trunc goapp:test 2>/dev/null | grep -q 'go test' || fail "Образ goapp:test собран не из этапа с тестами"
su - student -c 'docker build -q -t lab-goapp-final ~/goapp' >/dev/null 2>&1 || fail "Обычная сборка Dockerfile сломалась"
docker run --rm --entrypoint sh lab-goapp-final -c 'command -v go' >/dev/null 2>&1 && fail "Итоговый образ теперь собирается из этапа с компилятором — этап test должен идти не последним"
docker rmi -f lab-goapp-final >/dev/null 2>&1
ok "goapp:test собран из этапа test"
```

```text hint
1. Новый этап можно унаследовать от этапа сборки по его имени и выполнить в нём запуск тестов.
2. Порядок этапов важен: обычная сборка без указания цели собирает последний этап — итоговый образ должен остаться последним.
3. У команды сборки есть ключ «собрать до указанного этапа».
```

```bash solution
cd ~/goapp
awk '/^FROM alpine/ && !done {print "FROM build AS test\nRUN go test -v ./...\n"; done=1} {print}' Dockerfile > Dockerfile.new && mv Dockerfile.new Dockerfile
cat Dockerfile
docker build -q --target test -t goapp:test .
```

```text review
Эталон: `FROM build AS test` + `RUN go test ./...`, сборка `docker build --target test -t goapp:test .`.

- `--target` собирает этапы до указанного включительно — в CI так запускают линтеры и тесты в том же окружении, что и сборка, а потом собирают итоговый образ (BuildKit пропускает этапы, от которых итоговый не зависит).
- Если этап test поставить последним, обычный `docker build` начнёт выпускать в прод образ с компилятором и тестами.
- Ещё приёмы: этап `deps` с загрузкой зависимостей (кэшируется отдельно), `RUN --mount=type=cache,target=/root/.cache/go-build` — кэш компиляции между сборками.
```

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
