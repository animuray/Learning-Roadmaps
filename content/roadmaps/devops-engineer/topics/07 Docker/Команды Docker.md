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
