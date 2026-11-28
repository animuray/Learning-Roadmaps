---
title: Dockerfile
slug: dockerfile
description: Инструкции Dockerfile — FROM, RUN, COPY, ADD, WORKDIR, ENV, ARG, EXPOSE, CMD, ENTRYPOINT, USER, HEALTHCHECK — и как из них собирается образ.
duration: 120
level: Основы
quizSize: 10
materials:
  - title: Docker Docs — Dockerfile reference
    url: https://docs.docker.com/reference/dockerfile/
    type: документация
  - title: Docker Docs — Building best practices
    url: https://docs.docker.com/build/building/best-practices/
    type: документация
  - title: Docker Blog — Intro Guide to Dockerfile Best Practices
    url: https://www.docker.com/blog/intro-guide-to-dockerfile-best-practices/
    type: статья
---

# Dockerfile

**Dockerfile** — текстовый рецепт образа: базовый образ, команды установки, файлы приложения и команда запуска. Собирается командой `docker build -t имя:тег .` — точка здесь — это **контекст сборки** (каталог, файлы из которого можно копировать в образ).

## Пример: приложение на Python

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8000"]
CMD ["app:app"]
```

## Инструкции

| Инструкция | Что делает |
| --- | --- |
| `FROM образ:тег` | Базовый образ. Первая инструкция (до неё может стоять только `ARG`). `FROM scratch` — пустой образ |
| `RUN команда` | Выполнить команду при **сборке** и сохранить результат как новый слой |
| `COPY src dst` | Скопировать файлы из контекста сборки (или из другого этапа: `--from=build`) |
| `ADD src dst` | Как COPY, но умеет распаковывать локальные tar-архивы и скачивать по URL |
| `WORKDIR /app` | Рабочий каталог для следующих инструкций и для контейнера. Создаётся, если его нет |
| `ENV KEY=value` | Переменная окружения — есть и при сборке, и в запущенном контейнере |
| `ARG NAME=default` | Переменная **только для сборки**: `docker build --build-arg NAME=...`. В контейнере её нет |
| `EXPOSE 8000` | Документирует порт. Сам порт **не публикует** — это делает `-p` при запуске |
| `CMD` | Команда (или аргументы) по умолчанию при запуске. Легко переопределяется: `docker run образ другая-команда` |
| `ENTRYPOINT` | Основная исполняемая программа контейнера. Аргументы `docker run` дописываются к ней |
| `USER app` | От какого пользователя выполнять следующие `RUN` и сам контейнер |
| `HEALTHCHECK` | Команда проверки здоровья: статус `healthy`/`unhealthy` в `docker ps` |
| `LABEL` | Метаданные: автор, версия, ссылка на репозиторий |
| `VOLUME` | Объявить каталог для данных — Docker создаст анонимный том |
| `STOPSIGNAL` | Сигнал для остановки (по умолчанию SIGTERM) |

## Shell-форма и exec-форма

```dockerfile
CMD ["python", "app.py"]      # exec-форма (JSON-массив) — процесс запускается напрямую, PID 1
CMD python app.py             # shell-форма — запускается через /bin/sh -c
```

В shell-форме PID 1 — это `sh`, и он **не передаёт сигналы** приложению: `docker stop` ждёт 10 секунд и убивает контейнер через SIGKILL, приложение не завершается корректно. Для `CMD` и `ENTRYPOINT` используйте **exec-форму**. Для `RUN` shell-форма нормальна: там нужны `&&`, пайпы и переменные.

## CMD и ENTRYPOINT

| Dockerfile | `docker run образ` | `docker run образ --version` |
| --- | --- | --- |
| `CMD ["nginx", "-g", "daemon off;"]` | `nginx -g daemon off;` | `--version` (CMD заменена целиком — ошибка) |
| `ENTRYPOINT ["nginx"]` + `CMD ["-g", "daemon off;"]` | `nginx -g daemon off;` | `nginx --version` |

- **CMD** — «что запустить по умолчанию», целиком заменяется аргументами `docker run`.
- **ENTRYPOINT** — «какая программа это контейнер», аргументы дописываются к ней. Переопределить — `docker run --entrypoint`.
- Вместе: ENTRYPOINT — программа, CMD — её аргументы по умолчанию.

Частый приём — скрипт-обёртка `docker-entrypoint.sh`, который готовит конфиг и в конце делает `exec "$@"`, чтобы приложение стало PID 1 и получало сигналы.

## COPY и ADD

- **COPY** — просто копирует файлы. Используйте по умолчанию.
- **ADD** — дополнительно распаковывает локальные `.tar`/`.tar.gz` и умеет скачивать по URL. Это неявное поведение, поэтому ADD применяют, только когда нужна именно распаковка.
- `COPY --chown=app:app . .` — сразу задать владельца, без отдельного `RUN chown` (он удваивает размер слоя).

## ARG и ENV

```dockerfile
ARG PYTHON_VERSION=3.12
FROM python:${PYTHON_VERSION}-slim
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
```

> [!warning] Секреты
> Не передавайте пароли и токены через `ARG` и `ENV`: они остаются в метаданных образа и видны в `docker history` и `docker inspect`. Для секретов при сборке — `RUN --mount=type=secret`, в рантайме — переменные окружения или секреты оркестратора.

## Практика

- [ ] Написать Dockerfile для простого веб-приложения (Python/Flask или Node.js) и собрать образ `docker build -t myapp:0.1 .`
- [ ] Запустить контейнер, опубликовать порт, проверить приложение через curl
- [ ] Сравнить CMD в shell-форме и exec-форме: замерить, сколько длится `docker stop` в обоих случаях
- [ ] Сделать ENTRYPOINT + CMD и переопределить аргументы при `docker run`
- [ ] Передать версию через `--build-arg` и вывести её в приложении через ENV
- [ ] Добавить HEALTHCHECK и увидеть статус `healthy` в `docker ps`
- [ ] Запустить контейнер и выполнить `docker exec myapp id` — убедиться, что процесс не от root

## Лаборатория

В `~/app/app.py` — маленькое веб-приложение на Python (только стандартная библиотека): слушает порт 8000, на `/` отвечает `hello from <APP_VERSION>`, на `/health` — `ok`.

```bash setup
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
lab_img python:3.12-slim
mkdir -p /home/student/app
cat > /home/student/app/app.py <<'EOF'
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

VERSION = os.environ.get("APP_VERSION", "dev")

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"ok" if self.path == "/health" else f"hello from {VERSION}".encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body)

HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
EOF
chown -R student:student /home/student/app
# базовый Dockerfile — для задач, где он уже «написан»
lab_base_dockerfile() {
  cat > /home/student/app/Dockerfile <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY app.py .
RUN useradd -r -u 10001 app
USER app
EXPOSE 8000
CMD ["python3", "app.py"]
EOF
  chown student:student /home/student/app/Dockerfile
}
```

### Первый образ

Напишите `~/app/Dockerfile` для этого приложения и соберите образ **`myapp:0.1`**:

- основа — `python:3.12-slim`;
- процесс в контейнере работает **не от root**;
- команда запуска — в **exec-форме** (JSON-массив).

Запустите из образа контейнер **`myapp`** в фоне с портом **8170** хоста → 8000 контейнера.

```bash setup
lab_drm myapp
docker rmi -f myapp:0.1 >/dev/null 2>&1
rm -f /home/student/app/Dockerfile
true
```

```bash check
docker image inspect myapp:0.1 >/dev/null 2>&1 || fail "Образа myapp:0.1 нет"
[ "$(docker inspect -f '{{.State.Running}}' myapp 2>/dev/null)" = true ] || fail "Контейнер myapp не запущен"
[ "$(docker inspect -f '{{.Config.Image}}' myapp)" = myapp:0.1 ] || fail "Контейнер myapp запущен не из myapp:0.1"
cmd=$(docker image inspect -f '{{json .Config.Cmd}} {{json .Config.Entrypoint}}' myapp:0.1)
echo "$cmd" | grep -q '"/bin/sh","-c"' && fail "Команда запуска в shell-форме: $cmd — процесс приложения не будет PID 1 и не получит SIGTERM"
uid=$(docker exec myapp id -u 2>/dev/null)
[ -n "$uid" ] && [ "$uid" != 0 ] || fail "Процесс в контейнере работает от root"
r=$(curl -s --max-time 3 http://127.0.0.1:8170/)
[ "$r" = "hello from dev" ] || fail "localhost:8170 отвечает «$r»"
ok "myapp:0.1 — uid $uid, CMD $(docker image inspect -f '{{json .Config.Cmd}}' myapp:0.1)"
```

```text hint
1. Инструкции по порядку: базовый образ, рабочий каталог, копирование файла, создание системного пользователя (утилита useradd есть в образе), переключение на него, документирование порта, команда запуска массивом строк.
2. Собрать образ с тегом из каталога приложения.
3. Запустить контейнер в фоне с именем и публикацией порта, проверить curl.
```

```bash solution
cat > ~/app/Dockerfile <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY app.py .
RUN useradd -r -u 10001 app
USER app
EXPOSE 8000
CMD ["python3", "app.py"]
EOF
docker build -q -t myapp:0.1 ~/app
docker run -d --name myapp -p 8170:8000 myapp:0.1
sleep 1
curl -s localhost:8170
```

```text review
Эталон — в «Решении».

- `CMD ["python3", "app.py"]` (exec-форма) — приложение становится PID 1 и получает сигналы напрямую. Shell-форма `CMD python3 app.py` запускает `/bin/sh -c`, и SIGTERM от `docker stop` достаётся оболочке, а не приложению: остановка ждёт 10 секунд и заканчивается SIGKILL.
- `USER` с числовым UID (`10001`) удобен в Kubernetes: `runAsNonRoot` проверяет UID, а не имя.
- `EXPOSE` ничего не публикует — это документация для людей и инструментов. Публикует `-p`.
- `WORKDIR` вместо `RUN cd`: каждый `RUN` — отдельный процесс, `cd` в нём не влияет на следующие инструкции.
```

```text notes
CMD\s+python => Команда запуска записана в shell-форме — используйте JSON-массив.
```

### Версия при сборке

Сделайте так, чтобы версия приложения задавалась **при сборке**: Dockerfile принимает аргумент сборки `APP_VERSION` и передаёт его приложению через переменную окружения с тем же именем. Соберите образ **`myapp:0.2`** с версией `0.2` и запустите контейнер **`myapp2`** с портом **8172** хоста → 8000 контейнера. Приложение должно отвечать `hello from 0.2`.

```bash setup
lab_drm myapp2
docker rmi -f myapp:0.2 >/dev/null 2>&1
lab_base_dockerfile
```

```bash check
docker image inspect myapp:0.2 >/dev/null 2>&1 || fail "Образа myapp:0.2 нет"
docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' myapp:0.2 | grep -qx 'APP_VERSION=0.2' || fail "В образе myapp:0.2 нет переменной окружения APP_VERSION=0.2"
grep -qE '^\s*ARG\s+APP_VERSION' /home/student/app/Dockerfile || fail "В Dockerfile версия не принимается аргументом сборки"
[ "$(docker inspect -f '{{.State.Running}}' myapp2 2>/dev/null)" = true ] || fail "Контейнер myapp2 не запущен"
r=$(curl -s --max-time 3 http://127.0.0.1:8172/)
[ "$r" = "hello from 0.2" ] || fail "localhost:8172 отвечает «$r»"
ok "myapp:0.2 → $r"
```

```text hint
1. В Dockerfile объявить аргумент сборки, а затем переменную окружения, значение которой берётся из этого аргумента. Аргументы сборки не попадают в работающий контейнер сами по себе.
2. При сборке передать значение аргумента ключом сборки.
```

```bash solution
sed -i 's/^WORKDIR \/app$/WORKDIR \/app\nARG APP_VERSION=dev\nENV APP_VERSION=$APP_VERSION/' ~/app/Dockerfile
cat ~/app/Dockerfile
docker build -q --build-arg APP_VERSION=0.2 -t myapp:0.2 ~/app
docker run -d --name myapp2 -p 8172:8000 myapp:0.2
sleep 1
curl -s localhost:8172
```

```text review
Эталон: `ARG APP_VERSION=dev` + `ENV APP_VERSION=$APP_VERSION`, сборка `--build-arg APP_VERSION=0.2`.

- `ARG` живёт только во время сборки, `ENV` — и при сборке, и в контейнере. Чтобы значение дошло до приложения, его перекладывают из ARG в ENV.
- **Секреты через ARG/ENV не передают**: они видны в `docker history` и `docker inspect`. Для секретов при сборке — `RUN --mount=type=secret`, в рантайме — переменные окружения при запуске или файлы-секреты.
- В CI версию обычно берут из тега или SHA коммита: `--build-arg APP_VERSION=$CI_COMMIT_SHORT_SHA`, а образ тегируют тем же значением.
```

### Проверка здоровья

Добавьте в образ **HEALTHCHECK**, который проверяет `http://localhost:8000/health` (в образе нет curl — подойдёт сам Python). Соберите образ **`myapp:0.3`** и запустите контейнер **`myapp3`** (порт публиковать не обязательно). Контейнер должен перейти в состояние **healthy**.

```bash setup
lab_drm myapp3
docker rmi -f myapp:0.3 >/dev/null 2>&1
lab_base_dockerfile
```

```bash check
docker image inspect myapp:0.3 >/dev/null 2>&1 || fail "Образа myapp:0.3 нет"
[ -n "$(docker image inspect -f '{{if .Config.Healthcheck}}yes{{end}}' myapp:0.3)" ] || fail "В образе myapp:0.3 нет HEALTHCHECK"
[ "$(docker inspect -f '{{.State.Running}}' myapp3 2>/dev/null)" = true ] || fail "Контейнер myapp3 не запущен"
for i in $(seq 40); do s=$(docker inspect -f '{{.State.Health.Status}}' myapp3); [ "$s" = healthy ] && break; [ "$s" = unhealthy ] && break; sleep 1; done
[ "$s" = healthy ] || fail "Состояние myapp3 — $s. Последняя проверка: $(docker inspect -f '{{range .State.Health.Log}}{{.Output}}{{end}}' myapp3 | tail -2 | tr '\n' ' ' | head -c 200)"
ok "myapp3: healthy"
```

```text hint
1. Инструкция проверки здоровья в Dockerfile: интервал, тайм-аут, число попыток и команда. Команда должна завершаться с кодом 0, если всё хорошо, и с ненулевым — если нет.
2. Однострочник на Python может открыть URL из стандартной библиотеки — при ошибке он выбросит исключение и завершится с ошибкой.
3. Собрать, запустить и посмотреть статус в списке контейнеров (появится через интервал проверки).
```

```bash solution
cat >> ~/app/Dockerfile <<'EOF'
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"]
EOF
docker build -q -t myapp:0.3 ~/app
docker run -d --name myapp3 myapp:0.3
sleep 8
docker ps --filter name=myapp3
```

```text review
Эталон: `HEALTHCHECK --interval=5s --timeout=3s --retries=3 CMD ["python3", "-c", "import urllib.request; ..."]`.

- Статусы: `starting` → `healthy` или `unhealthy` (после `retries` неудач подряд). Сам Docker больной контейнер **не перезапускает** — но им пользуются Compose (`depends_on: condition: service_healthy`) и Swarm.
- В Kubernetes HEALTHCHECK из образа игнорируется — там свои `livenessProbe`/`readinessProbe` в манифесте.
- Проверка должна быть лёгкой и проверять сам сервис, а не внешние зависимости: упала база — перезапуск приложения не поможет.
- Ставить в образ curl только ради healthcheck — лишний вес и поверхность атаки; хватает средств самого языка или маленького бинарника.
```

## Тест

### Какая инструкция задаёт базовый образ?
= FROM
> Это первая инструкция Dockerfile; до неё может стоять только ARG.

### Чем RUN отличается от CMD?
- [ ] Ничем
- [x] RUN выполняется при сборке образа и создаёт слой, CMD — команда по умолчанию при запуске контейнера
- [ ] RUN выполняется при каждом запуске контейнера
- [ ] CMD выполняется при сборке
> RUN ставит пакеты, CMD запускает приложение.

### Чем CMD отличается от ENTRYPOINT?
- [x] CMD целиком заменяется аргументами docker run
- [x] Аргументы docker run дописываются к ENTRYPOINT
- [x] Вместе ENTRYPOINT задаёт программу, а CMD — её аргументы по умолчанию
- [ ] ENTRYPOINT выполняется при сборке образа
> ENTRYPOINT переопределяют флагом `--entrypoint`.

### Чем ADD отличается от COPY?
- [ ] ADD быстрее
- [x] ADD умеет распаковывать локальные tar-архивы и скачивать файлы по URL, COPY только копирует
- [ ] COPY умеет распаковывать архивы
- [ ] ADD копирует только каталоги
> По умолчанию используйте COPY — его поведение предсказуемо.

### Что делает EXPOSE 8080?
- [ ] Публикует порт 8080 на хосте
- [x] Только документирует, какой порт слушает приложение; публикация делается флагом -p при запуске
- [ ] Открывает порт в файрволе
- [ ] Запрещает другие порты
> `docker run -P` публикует все EXPOSE-порты на случайные порты хоста.

### Чем ARG отличается от ENV?
- [ ] Ничем
- [x] ARG доступна только во время сборки, ENV — и при сборке, и в запущенном контейнере
- [ ] ENV доступна только при сборке
- [ ] ARG сохраняется в контейнере
> ARG передаётся через `--build-arg`.

### Почему CMD и ENTRYPOINT лучше писать в exec-форме (JSON-массив)?
- [ ] Так короче
- [x] В shell-форме PID 1 становится sh, который не передаёт сигналы приложению, и оно не завершается корректно при docker stop
- [ ] Shell-форма не поддерживается
- [ ] Exec-форма включает кэш
> Exec-форма: `CMD ["python", "app.py"]`.

### Как правильно хранить пароль, нужный только при сборке (например, токен к приватному репозиторию пакетов)?
- [ ] В ENV
- [ ] В ARG
- [x] Через RUN --mount=type=secret — секрет не попадает в слои и метаданные образа
- [ ] Прописать в Dockerfile
> ARG и ENV видны в `docker history` и `docker inspect`.

### Что делает WORKDIR /app?
- [x] Задаёт рабочий каталог для следующих инструкций RUN, COPY, CMD и для запущенного контейнера
- [x] Создаёт каталог, если его нет
- [ ] Монтирует том /app
- [ ] Копирует файлы в /app
> Лучше, чем `RUN cd /app && ...` — cd действует только внутри одной команды.

### Какая инструкция задаёт пользователя, от которого работает контейнер?
= USER
> Пользователя нужно сначала создать, например через `useradd`.

### Что делает строка exec "$@" в конце docker-entrypoint.sh?
- [ ] Перезапускает контейнер
- [x] Заменяет процесс скрипта на команду из аргументов (CMD), чтобы приложение стало PID 1 и получало сигналы
- [ ] Выводит аргументы
- [ ] Запускает команду в фоне
> Без exec приложение будет дочерним процессом оболочки.

### Что получит контейнер с ENTRYPOINT ["nginx"] и CMD ["-g", "daemon off;"] при запуске docker run образ -t?
- [ ] nginx -g daemon off; -t
- [x] nginx -t
- [ ] -t
- [ ] Ошибку
> Аргументы `docker run` заменяют CMD и дописываются к ENTRYPOINT.

### Как задать владельца файлов при копировании без лишнего слоя?
- [ ] RUN chown -R app:app /app после COPY
- [x] COPY --chown=app:app . .
- [ ] USER app перед COPY
- [ ] ENV OWNER=app
> Отдельный `RUN chown` копирует все файлы в новый слой и раздувает образ.

### Как узнать статус HEALTHCHECK контейнера?
- [x] В столбце STATUS команды docker ps (healthy или unhealthy)
- [x] Через docker inspect в поле State.Health
- [ ] Через docker history
- [ ] Только в Kubernetes
> Docker Compose умеет ждать healthy через `depends_on: condition: service_healthy`.
