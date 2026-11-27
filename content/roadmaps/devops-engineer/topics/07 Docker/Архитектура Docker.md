---
title: Архитектура Docker
slug: arhitektura-docker
description: Docker Daemon, Docker CLI и Docker API, containerd и runc, реестры, объекты Docker и что происходит при docker run.
duration: 45
level: Основы
quizSize: 10
materials:
  - title: Docker Docs — Docker architecture
    url: https://docs.docker.com/get-started/docker-overview/
    type: документация
  - title: Docker Docs — Docker Engine
    url: https://docs.docker.com/engine/
    type: документация
---

# Архитектура Docker

Docker устроен как **клиент-сервер**. Команда `docker`, которую вы набираете, ничего не делает сама — она отправляет запрос **демону**, а тот уже собирает образы, запускает контейнеры и скачивает образы из реестров.

```
  docker CLI ──REST API──► dockerd ──► containerd ──► runc ──► процесс контейнера
  (клиент)    (/var/run/   (демон)      (жизненный    (создаёт namespaces,
               docker.sock)              цикл)         cgroups, запускает)
                              │
                              └──► Registry (Docker Hub, GitLab Registry…) — pull/push образов
```

## Компоненты

| Компонент | Роль |
| --- | --- |
| **Docker CLI** (`docker`) | Клиент: принимает команды и отправляет их демону через API |
| **Docker API** | REST API демона. По умолчанию — Unix-сокет `/var/run/docker.sock`. Через этот же API работают Docker Compose, IDE и CI-системы |
| **Docker Daemon** (`dockerd`) | Сервер: управляет объектами — образами, контейнерами, сетями, томами; собирает образы (BuildKit) |
| **containerd** | Управляет жизненным циклом контейнеров и хранением образов. Используется и самим Kubernetes |
| **runc** | Низкоуровневый runtime OCI: создаёт namespaces и cgroups и запускает процесс |
| **Registry** | Хранилище образов: Docker Hub, GitLab Container Registry, Harbor, облачные реестры |

## Объекты Docker

- **Образы** — `docker images`
- **Контейнеры** — `docker ps -a`
- **Сети** — `docker network ls`
- **Тома** — `docker volume ls`

Всё это хранится в `/var/lib/docker/` — **не трогайте этот каталог руками**, управляйте только через команды Docker.

```bash
docker version       # версии клиента и сервера — видно, что это два разных компонента
docker info          # драйвер хранения, cgroup, количество контейнеров и образов, каталог данных
docker system df     # сколько места занимают образы, контейнеры, тома, кэш сборки
```

## Что происходит при docker run nginx

1. CLI отправляет запрос демону через `/var/run/docker.sock`.
2. Демон ищет образ `nginx:latest` локально. Если его нет — **pull** из реестра (по умолчанию Docker Hub, `docker.io/library/nginx:latest`).
3. Создаётся контейнер: слой для записи поверх слоёв образа, сетевой интерфейс в сети bridge, IP-адрес.
4. containerd и runc создают namespaces и cgroups и запускают процесс из `ENTRYPOINT`/`CMD` образа.
5. Вывод процесса (stdout/stderr) собирается в лог контейнера (`docker logs`).

## Удалённый демон и контексты

Клиент может управлять демоном на другой машине:

```bash
DOCKER_HOST=ssh://deploy@server docker ps
docker context create prod --docker "host=ssh://deploy@server"
docker context use prod
```

## Безопасность: docker.sock и группа docker

> [!warning] Доступ к Docker = root
> Кто может обращаться к `/var/run/docker.sock` (в том числе пользователи группы `docker`), тот фактически root на хосте. Например, можно запустить контейнер, смонтировав в него `/` хоста. Поэтому:
> - не добавляйте в группу `docker` кого попало;
> - не монтируйте `docker.sock` в контейнеры без крайней необходимости;
> - не открывайте Docker API по TCP без TLS.
>
> Альтернативы — **rootless Docker** и **Podman** без root.

## Docker Desktop и Docker Engine

- **Docker Engine** — демон и CLI для Linux, ставится на серверы.
- **Docker Desktop** — приложение для macOS и Windows (и Linux): внутри скрытая ВМ с Linux, Docker Engine, Compose, Kubernetes. Для коммерческого использования в крупных компаниях требуется платная подписка.

## Практика

- [ ] Выполнить `docker version` и найти отдельные блоки Client и Server
- [ ] Выполнить `docker info` и найти Storage Driver, Cgroup Version, Docker Root Dir
- [ ] Посмотреть дерево процессов `pstree -p` и найти dockerd, containerd и процессы контейнеров (containerd-shim)
- [ ] Обратиться к Docker API напрямую: `curl --unix-socket /var/run/docker.sock http://localhost/containers/json`
- [ ] Настроить `docker context` для подключения к Docker на второй ВМ по SSH

## Тест

### По какой архитектуре устроен Docker?
- [ ] Peer-to-peer
- [x] Клиент-сервер: CLI отправляет запросы демону dockerd через API
- [ ] Монолит без демона
- [ ] Клиент работает напрямую с ядром
> Поэтому `docker version` показывает отдельно Client и Server.

### Через что по умолчанию Docker CLI общается с демоном?
- [ ] Через TCP-порт 80
- [x] Через Unix-сокет /var/run/docker.sock
- [ ] Через SSH
- [ ] Через файл /etc/docker/daemon.json
> Можно настроить TCP с TLS или SSH, но по умолчанию — сокет.

### Как называется демон Docker?
= dockerd
> Он управляет образами, контейнерами, сетями и томами.

### Какой компонент отвечает за жизненный цикл контейнеров и используется также в Kubernetes?
- [ ] Docker CLI
- [x] containerd
- [ ] Docker Hub
- [ ] Compose
> Ниже containerd работает runc.

### Что произойдёт при docker run nginx, если образа nginx нет локально?
- [ ] Ошибка «образ не найден»
- [x] Docker скачает образ nginx:latest из реестра по умолчанию (Docker Hub) и затем запустит контейнер
- [ ] Docker соберёт образ из исходников
- [ ] Docker запустит пустой контейнер
> Тег latest подставляется, если тег не указан.

### Почему членство в группе docker опасно?
- [ ] Это замедляет Docker
- [x] Доступ к демону Docker позволяет запустить контейнер с монтированием файловой системы хоста, то есть фактически даёт права root
- [ ] Пользователь не сможет пользоваться sudo
- [ ] Группа docker удаляет образы
> Альтернатива — rootless-режим или Podman.

### Какие объекты управляются Docker?
- [x] Образы
- [x] Контейнеры
- [x] Сети и тома
- [ ] Пользователи Linux
> Посмотреть занятое место: `docker system df`.

### Можно ли вручную чистить каталог /var/lib/docker, чтобы освободить место?
- [ ] Да, это безопасно
- [x] Нет: это сломает Docker; чистить нужно командами docker system prune, docker image rm и т. п.
- [ ] Да, но только overlay2
- [ ] Да, после остановки контейнеров
> Состояние в каталоге и в метаданных демона должно совпадать.

### Как управлять Docker на удалённом сервере со своей машины?
- [x] Через переменную DOCKER_HOST=ssh://user@server
- [x] Через docker context с подключением по SSH
- [ ] Через docker login server
- [ ] Только заходя на сервер по SSH и запуская команды там
> Клиент и демон могут быть на разных машинах.

### Какая команда покажет версии клиента и сервера Docker?
= docker version
> `docker info` покажет подробности о демоне и хранилище.

### Куда попадает вывод stdout и stderr процесса в контейнере?
- [ ] В /var/log/syslog хоста
- [x] В лог контейнера, который читается через docker logs
- [ ] Никуда
- [ ] В файл /dev/null
> Поэтому приложения в контейнерах пишут логи в stdout, а не в файлы.
