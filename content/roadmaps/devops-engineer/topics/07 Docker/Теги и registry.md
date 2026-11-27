---
title: Теги и registry
slug: tegi-i-registry
description: Полное имя образа, теги и digest, стратегии версионирования, Docker Hub, GitLab Container Registry, docker login и push, приватные реестры и связка CI → registry → Kubernetes.
duration: 60
level: Основы
quizSize: 10
materials:
  - title: GitLab Docs — Build and push container images to the container registry
    url: https://docs.gitlab.com/user/packages/container_registry/build_and_push_images/
    type: документация
  - title: GitLab Docs — Authenticate with the container registry
    url: https://docs.gitlab.com/user/packages/container_registry/authenticate_with_container_registry/
    type: документация
  - title: Open Container Initiative — About (distribution-spec)
    url: https://opencontainers.org/about/overview/
    type: документация
  - title: Docker Docs — What is Docker? (registries)
    url: https://docs.docker.com/get-started/docker-overview/
    type: документация
---

# Теги и registry

**Registry** (реестр) — хранилище образов. Это связующее звено всей доставки:

```
 git push → CI собирает образ → docker push в registry → сервер / Kubernetes делает pull → запуск
```

## Полное имя образа

```
registry.gitlab.com/team/project/api:1.4.2
└──── реестр ─────┘└─ репозиторий ─┘└ тег ┘
```

- Если реестр не указан — подставляется **Docker Hub** (`docker.io`), а для официальных образов — ещё и `library/`: `nginx` = `docker.io/library/nginx:latest`.
- Если тег не указан — подставляется **`latest`**. Это просто имя тега, а не «самая свежая версия».

## Тег и digest

- **Тег** — изменяемая ссылка: `myapp:1.4` сегодня и завтра может указывать на разные образы.
- **Digest** — неизменяемый хеш содержимого: `myapp@sha256:3f1c...`. Один digest — всегда один и тот же образ.

```bash
docker images --digests
docker pull nginx@sha256:...
docker buildx imagetools inspect nginx:1.27   # мульти-архитектурный манифест: amd64, arm64...
```

## Стратегии тегирования

| Тег | Пример | Зачем |
| --- | --- | --- |
| Семантическая версия | `1.4.2`, `1.4`, `1` | Релизы; `1.4` двигается на последний патч |
| Коммит | `a1b2c3d` (`$CI_COMMIT_SHORT_SHA`) | Точная связь образа с кодом, неизменяемый |
| Ветка | `main`, `develop` | Последняя сборка ветки для dev-окружений |
| Окружение | `staging`, `prod` | Указатель, что сейчас развёрнуто (лучше хранить в GitOps-репозитории) |

Правило: **в прод деплойте неизменяемые теги** (версия или SHA коммита), а не `latest`. Иначе непонятно, что запущено, и откат превращается в угадайку. Многие реестры умеют запрещать перезапись тегов (tag immutability).

```bash
docker build -t registry.gitlab.com/team/app:$SHA .
docker tag registry.gitlab.com/team/app:$SHA registry.gitlab.com/team/app:1.4.2
docker push registry.gitlab.com/team/app:$SHA
docker push registry.gitlab.com/team/app:1.4.2
```

## docker login и push

```bash
docker login                                   # Docker Hub
docker login registry.gitlab.com               # GitLab: логин и Personal/Deploy/Job token
echo "$TOKEN" | docker login registry.example.com -u user --password-stdin
docker push registry.example.com/team/app:1.0
docker logout registry.example.com
```

- Учётные данные сохраняются в `~/.docker/config.json` — в base64, то есть **практически открытым текстом**. Используйте credential helper (`docker-credential-*`) и токены с минимальными правами.
- `--password-stdin` — чтобы пароль не попал в историю shell и в список процессов.

## GitLab Container Registry

У каждого проекта GitLab есть свой реестр. В CI доступны предопределённые переменные:

```yaml
build:
  image: docker:27
  services:
    - docker:27-dind
  script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login "$CI_REGISTRY" -u "$CI_REGISTRY_USER" --password-stdin
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"
```

- `$CI_REGISTRY` — адрес реестра, `$CI_REGISTRY_IMAGE` — путь образа проекта;
- `$CI_REGISTRY_USER` / `$CI_REGISTRY_PASSWORD` — временный job token на время задания;
- для pull с серверов и из Kubernetes — **deploy token** с правом `read_registry`.

## Какие бывают реестры

- **Docker Hub** — публичный, с лимитами на анонимный pull (поэтому в CI часто упираются в rate limit — используйте зеркало или авторизацию).
- **GitLab Container Registry**, **GitHub Container Registry** (`ghcr.io`).
- **Harbor** — свой реестр с RBAC, сканированием, репликацией. **Nexus**, **Artifactory**.
- Облачные: Amazon ECR, Google Artifact Registry, Yandex Container Registry.
- Простейший свой: `docker run -d -p 5000:5000 registry:2`.

Kubernetes берёт образы из приватного реестра через секрет `imagePullSecrets` типа `kubernetes.io/dockerconfigjson`.

## Практика

- [ ] Запустить локальный реестр `registry:2`, протегировать свой образ как `localhost:5000/myapp:0.1` и выполнить push и pull
- [ ] Создать проект в GitLab, войти в его Container Registry через Personal Access Token и выгрузить образ
- [ ] Протегировать один образ тремя тегами (SHA, версия, `latest`) и убедиться, что у них один IMAGE ID
- [ ] Посмотреть digest образа после push и выполнить pull по digest
- [ ] Посмотреть `~/.docker/config.json` после логина и раскодировать auth через `base64 -d` — убедиться, почему нужен credential helper

## Тест

### Какой образ скачает docker pull nginx?
- [ ] Самую последнюю версию nginx из исходников
- [x] docker.io/library/nginx:latest
- [ ] nginx из локального реестра
- [ ] Ошибку — не указан тег
> Реестр по умолчанию — Docker Hub, тег по умолчанию — latest.

### Чем тег отличается от digest?
- [ ] Ничем
- [x] Тег — изменяемая ссылка, которую можно перезаписать; digest — хеш содержимого, всегда указывает на один и тот же образ
- [ ] Digest можно менять, тег — нет
- [ ] Тег — это хеш
> Digest выглядит как `sha256:...`.

### Почему в прод не стоит деплоить тег latest?
- [x] Непонятно, какая версия запущена, а latest может перезаписаться следующей сборкой
- [x] Откат на предыдущую версию становится сложным
- [ ] latest запрещён в Kubernetes
- [ ] latest скачивается медленнее
> Используйте версию или SHA коммита.

### Какой тег лучше всего связывает образ с конкретным кодом?
- [ ] latest
- [ ] main
- [x] Короткий SHA коммита
- [ ] prod
> В GitLab — `$CI_COMMIT_SHORT_SHA`.

### Как безопасно передать пароль при docker login в скрипте?
- [ ] docker login -p пароль
- [x] echo "$TOKEN" | docker login реестр -u user --password-stdin
- [ ] Записать пароль в Dockerfile
- [ ] Передать через ARG
> Пароль в аргументах виден в истории shell и списке процессов.

### Где Docker сохраняет учётные данные после docker login (без credential helper)?
= ~/.docker/config.json
= config.json
> В base64 — это не шифрование.

### Какие переменные GitLab CI используют для входа в Container Registry проекта?
- [x] CI_REGISTRY
- [x] CI_REGISTRY_USER и CI_REGISTRY_PASSWORD
- [x] CI_REGISTRY_IMAGE — путь образа проекта
- [ ] CI_DOCKER_PASSWORD
> Пароль — временный job token, действующий во время задания.

### Что нужно, чтобы Kubernetes скачивал образ из приватного реестра?
- [ ] Ничего
- [x] Секрет типа kubernetes.io/dockerconfigjson, указанный в imagePullSecrets
- [ ] Перезапустить kubelet
- [ ] Указать тег latest
> Для GitLab — deploy token с правом read_registry.

### Какой образ используют, чтобы быстро поднять свой простой реестр?
= registry:2
= registry
> Для продакшена берут Harbor, Nexus или облачные реестры.

### Что делает docker push registry.example.com/team/app:1.0?
- [ ] Собирает образ
- [x] Выгружает в реестр слои образа, которых там ещё нет, и манифест с тегом 1.0
- [ ] Удаляет образ из реестра
- [ ] Создаёт новый тег локально
> Уже существующие слои не загружаются повторно.

### CI падает с ошибкой toomanyrequests при pull с Docker Hub. Что это и как решить?
- [ ] Закончилось место на диске
- [x] Превышен лимит анонимных скачиваний Docker Hub; решение — авторизация, зеркало (pull-through cache) или свой реестр
- [ ] Неверный тег
- [ ] Нет сети
> Docker Hub ограничивает число pull для анонимных и бесплатных пользователей.

### Как реестр помогает в цепочке доставки?
- [ ] Хранит исходный код
- [x] CI выгружает туда собранный образ, а серверы и Kubernetes скачивают оттуда тот же самый образ для запуска
- [ ] Запускает контейнеры
- [ ] Собирает образы
> Образ собирается один раз и продвигается по окружениям.
