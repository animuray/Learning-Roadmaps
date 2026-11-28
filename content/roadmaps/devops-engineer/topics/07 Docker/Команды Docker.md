---
title: Команды Docker
slug: komandy-docker
description: Повседневные команды Docker — run и его флаги, ps, logs, exec, stop, rm, images, pull, push, tag, history, inspect, а также уборка места.
duration: 90
level: Основы
quizSize: 10
materials:
  - title: Docker Docs — What is Docker?
    url: https://docs.docker.com/get-started/docker-overview/
    type: документация
  - title: Docker Docs — Image-building best practices (docker image history)
    url: https://docs.docker.com/get-started/workshop/09_image_best/
    type: документация
  - title: Docker Docs — Docker Engine
    url: https://docs.docker.com/engine/
    type: документация
---

# Команды Docker

## Запуск контейнеров: docker run

```bash
docker run nginx                              # на переднем плане (Ctrl+C — остановить)
docker run -d --name web -p 8080:80 nginx     # в фоне, с именем, порт хоста 8080 → 80 контейнера
docker run --rm -it ubuntu bash               # интерактивно, удалить контейнер после выхода
docker run -d -e POSTGRES_PASSWORD=secret postgres:16   # переменная окружения
docker run -d --env-file .env myapp           # переменные из файла
docker run -d -v pgdata:/var/lib/postgresql/data postgres:16   # именованный том
docker run -d -v "$(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro" nginx   # bind mount только для чтения
docker run -d --restart unless-stopped myapp  # политика перезапуска
docker run -d --memory 512m --cpus 1 myapp    # лимиты ресурсов (cgroups)
docker run -d --network mynet myapp           # подключить к сети
```

| Флаг | Смысл |
| --- | --- |
| `-d` | В фоне (detached) |
| `--name` | Имя контейнера |
| `-p хост:контейнер` | Опубликовать порт. `-p 127.0.0.1:8080:80` — только на localhost |
| `-e`, `--env-file` | Переменные окружения |
| `-v`, `--mount` | Тома и bind mounts |
| `--rm` | Удалить контейнер после остановки |
| `-it` | Интерактивный режим с терминалом |
| `--restart` | `no`, `on-failure`, `always`, `unless-stopped` |
| `--memory`, `--cpus` | Лимиты ресурсов |

## Наблюдение

```bash
docker ps                         # запущенные контейнеры
docker ps -a                      # все, включая остановленные (видно Exit code)
docker logs web                   # логи
docker logs -f --tail 100 web     # следить, последние 100 строк
docker logs --since 10m web
docker stats                      # CPU, память, сеть, диск в реальном времени
docker top web                    # процессы контейнера
docker inspect web                # всё о контейнере в JSON
docker inspect -f '{{.NetworkSettings.IPAddress}}' web
docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' web   # почему упал
docker port web                   # опубликованные порты
docker events                     # поток событий демона
```

## Работа внутри контейнера

```bash
docker exec -it web bash          # оболочка в работающем контейнере (в минимальных образах — sh)
docker exec web nginx -t          # выполнить команду
docker cp web:/etc/nginx/nginx.conf ./   # скопировать файл из контейнера
docker cp ./index.html web:/usr/share/nginx/html/
```

`exec` работает только с **запущенным** контейнером. Изменения внутри контейнера пропадут при его удалении — нужное фиксируйте в Dockerfile, а данные храните в томах.

## Жизненный цикл

```bash
docker stop web          # SIGTERM, через 10 секунд — SIGKILL
docker stop -t 30 web    # дать 30 секунд на корректное завершение
docker start web
docker restart web
docker kill web          # сразу SIGKILL (или -s другой сигнал)
docker rm web            # удалить остановленный контейнер
docker rm -f web         # остановить и удалить
```

## Образы

```bash
docker images                         # список образов (docker image ls)
docker pull nginx:1.27-alpine         # скачать
docker build -t myapp:1.0 .           # собрать из Dockerfile в текущем каталоге
docker tag myapp:1.0 registry.example.com/team/myapp:1.0   # ещё одно имя для образа
docker push registry.example.com/team/myapp:1.0            # выгрузить в реестр
docker history myapp:1.0              # слои образа и команды, которые их создали
docker image inspect myapp:1.0        # метаданные: CMD, ENV, порты, слои
docker rmi myapp:1.0                  # удалить образ
docker save -o myapp.tar myapp:1.0    # образ в файл (перенос без реестра)
docker load -i myapp.tar
```

## Уборка места

```bash
docker system df                      # кто сколько занимает
docker container prune                # удалить остановленные контейнеры
docker image prune                    # удалить «висячие» образы (без тега)
docker image prune -a                 # удалить все неиспользуемые образы
docker builder prune                  # кэш сборки
docker volume prune                   # неиспользуемые тома — ОСТОРОЖНО, это данные!
docker system prune                   # контейнеры, сети, висячие образы, кэш
```

## Коды выхода — почему упал контейнер

| Код | Значение |
| --- | --- |
| 0 | Нормальное завершение |
| 1 | Ошибка в приложении |
| 125 | Ошибка самого Docker (неверный флаг) |
| 126 | Команда не может быть выполнена (нет прав) |
| 127 | Команда не найдена |
| 137 | SIGKILL (128 + 9): OOM Killer или `docker kill` / таймаут `docker stop` |
| 143 | SIGTERM (128 + 15): корректная остановка |

## Практика

- [ ] Запустить nginx с публикацией порта, открыть страницу в браузере, посмотреть логи и `docker stats`
- [ ] Зайти в контейнер через `exec`, поменять `index.html`, проверить в браузере; затем удалить и пересоздать контейнер — убедиться, что изменение пропало
- [ ] Запустить PostgreSQL с томом, создать таблицу, удалить контейнер, запустить новый с тем же томом — данные на месте
- [ ] Запустить контейнер с `--memory 50m` и программой, которая потребляет больше, и найти `OOMKilled: true` и код 137 в `docker inspect`
- [ ] Посмотреть `docker history` любого официального образа и разобраться, какие слои самые большие
- [ ] Посмотреть `docker system df` и почистить ненужное через prune

## Лаборатория

```bash setup
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
lab_img nginx:1.27-alpine python:3.12-slim alpine:3.20
```

### Запустить веб-сервер

Запустите контейнер с именем **`web`** из образа `nginx:1.27-alpine`:

- в фоне;
- порт **8181** хоста ведёт на порт 80 контейнера;
- контейнер сам поднимается после перезапуска Docker или сервера, **если его не остановили вручную**.

```bash setup
lab_drm web
```

```bash check
[ "$(docker inspect -f '{{.State.Running}}' web 2>/dev/null)" = true ] || fail "Контейнер web не запущен"
[ "$(docker inspect -f '{{.Config.Image}}' web)" = nginx:1.27-alpine ] || fail "web запущен из образа $(docker inspect -f '{{.Config.Image}}' web)"
p=$(docker port web 80/tcp 2>/dev/null | head -1)
[ "${p##*:}" = 8181 ] || fail "Порт 80 контейнера опубликован как «${p:-никак}»"
[ "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' web)" = unless-stopped ] || fail "Политика перезапуска — «$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' web)»"
curl -s --max-time 3 http://127.0.0.1:8181/ | grep -q 'Welcome to nginx' || fail "localhost:8181 не отдаёт страницу nginx"
ok "web: 8181 → 80, restart=unless-stopped"
```

```text hint
1. Запуск контейнера: ключи «в фоне», «имя», «опубликовать порт хост:контейнер» и «политика перезапуска».
2. Из политик нужна та, что перезапускает всегда, кроме случая ручной остановки.
3. Проверить страницу через curl, посмотреть журнал контейнера.
```

```bash solution
docker run -d --name web -p 8181:80 --restart unless-stopped nginx:1.27-alpine
sleep 1
curl -s localhost:8181 | head -5
docker logs web | tail -3
```

```text review
Эталон: `docker run -d --name web -p 8181:80 --restart unless-stopped nginx:1.27-alpine`.

- Политики: `no` (по умолчанию), `on-failure[:N]` — при ненулевом коде, `always` — всегда (даже остановленный вручную поднимется после перезапуска демона), `unless-stopped` — всегда, кроме ручного `docker stop`.
- `-p 8181:80` слушает на **всех** интерфейсах хоста и обходит ufw. Только для себя — `-p 127.0.0.1:8181:80`.
- Повседневные команды: `docker ps -a`, `docker logs -f web`, `docker exec -it web sh`, `docker stats`, `docker stop/start/rm web`.
```

### Поправить страницу внутри контейнера

Работает контейнер **`web2`** (nginx, порт 8183). Не пересоздавая его, замените главную страницу (`/usr/share/nginx/html/index.html` внутри контейнера) на текст `Hello from container`.

```bash setup
lab_drm web2
docker run -d --name web2 -p 8183:80 nginx:1.27-alpine >/dev/null
docker inspect -f '{{.Id}}' web2 > /var/lib/lab/web2-id
lab_wait_http http://127.0.0.1:8183/ nginx
```

```bash check
[ "$(docker inspect -f '{{.Id}}' web2 2>/dev/null)" = "$(cat /var/lib/lab/web2-id)" ] || fail "Контейнер web2 пересоздан — по условию нужно было менять работающий"
r=$(curl -s --max-time 3 http://127.0.0.1:8183/)
[ "$(echo "$r" | tr -d '\r' | sed '/^$/d')" = "Hello from container" ] || fail "localhost:8183 отдаёт: «$(echo "$r" | head -c 60)»"
ok "web2 отдаёт новую страницу"
```

```text hint
1. Выполнить команду внутри работающего контейнера можно отдельной командой docker — без входа по SSH и без пересоздания.
2. Записать текст в файл внутри контейнера (оболочка там есть — sh). Либо скопировать файл с хоста в контейнер командой копирования.
```

```bash solution
docker exec web2 sh -c 'echo "Hello from container" > /usr/share/nginx/html/index.html'
curl -s localhost:8183
```

```text review
Эталон: `docker exec web2 sh -c 'echo ... > /usr/share/nginx/html/index.html'` (или `docker cp index.html web2:/usr/share/nginx/html/`).

- Изменения живут в верхнем слое **этого** контейнера: `docker rm web2` — и правка исчезла, а новый контейнер из образа будет с исходной страницей. Так чинят только для отладки.
- Правильно: менять образ (Dockerfile) или подключать файлы томом/bind mount.
- `docker exec -it web2 sh` — интерактивная оболочка; `docker diff web2` — какие файлы контейнер изменил относительно образа.
```

### Почему упал контейнер

Контейнер **`lab-hog`** завершился сам. Выясните **код выхода** и **был ли он убит из-за нехватки памяти**. Запишите в `~/hog.txt` одну строку: `код true|false` (например, `1 false`).

```bash setup
lab_drm lab-hog
rm -f /home/student/hog.txt
docker run --name lab-hog --memory 50m --memory-swap 50m python:3.12-slim python -c "a = b'x' * 300_000_000" >/dev/null 2>&1; true
```

```bash check
want="$(docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' lab-hog)"
[ -f /home/student/hog.txt ] || fail "Нет ~/hog.txt"
got=$(tr -s ' \t' ' ' < /home/student/hog.txt | head -1 | sed 's/^ //; s/ $//' | tr 'A-Z' 'a-z')
[ "$got" = "$want" ] || fail "В ~/hog.txt «$got» — не совпадает с состоянием контейнера"
ok "lab-hog: код $want — убит OOM killer из-за лимита --memory"
```

```text hint
1. В списке всех контейнеров (включая остановленные) видно состояние и код выхода.
2. Подробная информация о контейнере содержит раздел состояния: код выхода и признак убийства из-за памяти. Попросите эти поля шаблоном формата.
```

```bash solution
docker ps -a --filter name=lab-hog
docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' lab-hog > ~/hog.txt
cat ~/hog.txt
```

```text review
Эталон: `docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' lab-hog` → `137 true`.

- Код 137 = 128 + 9: процесс убит SIGKILL. В паре с `OOMKilled: true` — превышен лимит памяти контейнера (`--memory`, `limits.memory` в Kubernetes). 143 = 128 + 15 — завершён SIGTERM (обычная остановка).
- Логов от убитого процесса не будет — он не успевает ничего записать. В Kubernetes то же самое видно как `Last State: Terminated, Reason: OOMKilled`.
- Что делать: смотреть реальное потребление (`docker stats`), поднимать лимит или чинить утечку. JVM и Node.js нужно явно говорить про лимит (`-XX:MaxRAMPercentage`, `--max-old-space-size`).
```

### Уборка без последствий

На сервере кончается место: накопились **остановленные контейнеры** и **кэш сборки** образов. Удалите и то, и другое. Образы и **работающие** контейнеры должны остаться — они нужны.

```bash setup
for n in 1 2 3; do lab_drm lab-old$n; docker run --name lab-old$n alpine:3.20 true >/dev/null; done
for v in 1 2; do printf 'FROM alpine:3.20
RUN echo build-%s-%s > /build.txt
' "$v" "$RANDOM" | docker build -q -t lab-cache-demo:$v - >/dev/null; done
docker images --format '{{.Repository}}:{{.Tag}}' | sort > /var/lib/lab/images-before
docker ps -q --no-trunc | sort > /var/lib/lab/running-before
```

```bash check
n=$(docker ps -aq --filter status=exited --filter status=created | wc -l)
[ "$n" = 0 ] || fail "Остановленных контейнеров осталось: $n"
bc=$(docker system df --format '{{.Type}} {{.Size}}' | awk '$1 == "Build" {print $3}')
[ "$bc" = 0B ] || fail "Кэш сборки занимает $bc"
missing=$(comm -23 /var/lib/lab/images-before <(docker images --format '{{.Repository}}:{{.Tag}}' | sort) | tr '
' ' ')
[ -z "$missing" ] || fail "Вместе с мусором удалены образы: $missing"
gone=$(comm -23 /var/lib/lab/running-before <(docker ps -q --no-trunc | sort) | wc -l)
[ "$gone" = 0 ] || fail "Остановлены или удалены работающие контейнеры: $gone"
ok "остановленных контейнеров и кэша сборки нет; образы и работающие контейнеры на месте"
```

```text hint
1. Посмотреть, сколько места занимают образы, контейнеры, тома и кэш сборки, — команда «система» у docker.
2. Для контейнеров и для кэша сборщика есть отдельные команды очистки. Кэш по умолчанию чистится не весь — у команды есть ключ «всё».
3. Общая команда очистки системы с ключом «всё» удалит и неиспользуемые образы — она здесь не подходит.
```

```bash solution
docker system df
docker container prune -f
docker builder prune -af
docker system df
```

```text review
Эталон: `docker container prune` + `docker builder prune -a`.

- `docker system prune` удаляет остановленные контейнеры, неиспользуемые сети, висячие образы и кэш; с `-a` — **все** образы без контейнеров (на сервере это скачивание заново при следующем деплое или откате), с `--volumes` — ещё и тома с данными баз.
- Кэш сборки быстро растёт на CI-раннерах: чистят по расписанию с фильтром — `docker builder prune -af --filter "until=168h"`.
- Ещё одно место, которое съедает диск, — логи контейнеров. Лимит в `/etc/docker/daemon.json`: `"log-opts": {"max-size": "10m", "max-file": "3"}`.
```

```text notes
system\s+prune\b.*\s(-a|--all)\b => Использовался system prune -a — он удаляет и все неиспользуемые образы.
```

## Тест

### Как запустить nginx в фоне с именем web и пробросить порт 8080 хоста на порт 80 контейнера?
- [ ] docker run nginx -p 80:8080 --name web
- [x] docker run -d --name web -p 8080:80 nginx
- [ ] docker start -d web 8080:80 nginx
- [ ] docker run -d web nginx 8080
> Формат `-p хост:контейнер`. Флаги пишутся до имени образа.

### Как посмотреть все контейнеры, включая остановленные?
= docker ps -a
> Без `-a` показываются только запущенные.

### Как следить за логами контейнера web в реальном времени?
= docker logs -f web
> Добавьте `--tail 100`, чтобы не выводить всю историю.

### Как открыть оболочку внутри работающего контейнера web?
- [ ] docker run -it web bash
- [x] docker exec -it web bash (или sh, если bash нет)
- [ ] docker attach web bash
- [ ] docker ssh web
> `docker run` создаст новый контейнер, а не войдёт в существующий.

### Что делает docker stop?
- [ ] Сразу убивает процесс SIGKILL
- [x] Отправляет SIGTERM, ждёт 10 секунд (по умолчанию), затем отправляет SIGKILL
- [ ] Удаляет контейнер
- [ ] Ставит контейнер на паузу
> Мгновенное убийство — `docker kill`.

### Контейнер завершился с кодом 137, а в docker inspect OOMKilled: true. Что произошло?
- [ ] Ошибка в Dockerfile
- [x] Контейнер превысил лимит памяти и был убит OOM Killer
- [ ] Не найден образ
- [ ] Неверные права на файлы
> 137 = 128 + 9 (SIGKILL).

### Как посмотреть слои образа и команды, которыми они созданы?
= docker history myapp:1.0
= docker history
> Удобно, чтобы найти, какой шаг раздул образ.

### Что делает docker tag myapp:1.0 registry.example.com/team/myapp:1.0?
- [ ] Копирует образ в реестр
- [x] Добавляет образу ещё одно имя (ссылку) — сам образ не копируется
- [ ] Переименовывает контейнер
- [ ] Собирает новый образ
> Выгрузка в реестр — отдельной командой `docker push`.

### Чем опасна команда docker volume prune?
- [ ] Она удаляет образы
- [x] Она удаляет неиспользуемые тома — то есть данные, например базы данных остановленных или удалённых контейнеров
- [ ] Она останавливает все контейнеры
- [ ] Ничем
> Перед prune смотрите `docker volume ls` и понимайте, что удаляете.

### Какой флаг удалит контейнер автоматически после его остановки?
= --rm
> Удобно для одноразовых команд.

### Как ограничить контейнеру память 512 МБ и один процессор?
- [ ] docker run --limit 512m,1 myapp
- [x] docker run --memory 512m --cpus 1 myapp
- [ ] docker run -m 1 --cpu 512m myapp
- [ ] Это делается только в Kubernetes
> Лимиты применяются через cgroups.

### Вы изменили файл внутри контейнера через exec, а потом пересоздали контейнер. Что с изменением?
- [ ] Оно сохранится в образе
- [x] Оно пропадёт: изменения живут в слое контейнера и удаляются вместе с ним
- [ ] Оно попадёт в реестр
- [ ] Оно сохранится в томе автоматически
> Конфигурацию фиксируйте в Dockerfile, данные — в томах.

### Как узнать, сколько места занимают образы, контейнеры, тома и кэш сборки?
= docker system df
> Подробнее — `docker system df -v`.

### Как опубликовать порт контейнера только на localhost хоста?
- [ ] -p 8080:80 --local
- [x] -p 127.0.0.1:8080:80
- [ ] --expose 127.0.0.1
- [ ] -p localhost
> Так порт не будет доступен снаружи даже в обход файрвола.
