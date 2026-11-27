---
title: Практика — пайплайн build, test, deploy
slug: praktika-pajplajn-build-test-deploy
description: Собрать на GitLab CI полный пайплайн для своего приложения — линтеры, сборка Docker-образа и пуш в Registry, деплой по SSH на сервер с обновлением контейнера и проверкой.
duration: 240
level: Средний
quizSize: 10
materials:
  - title: GitLab Docs — Using SSH keys with GitLab CI/CD
    url: https://docs.gitlab.com/ci/jobs/ssh_keys
    type: документация
  - title: GitLab Docs — Build and push container images
    url: https://docs.gitlab.com/user/packages/container_registry/build_and_push_images/
    type: документация
  - title: GitLab Docs — CI/CD YAML syntax reference
    url: https://docs.gitlab.com/ci/yaml
    type: документация
  - title: GitLab Docs — GitLab CI/CD variables
    url: https://docs.gitlab.com/ci/variables
    type: документация
---

# Практика — пайплайн build, test, deploy

Берём приложение из практики Docker (app + PostgreSQL + Redis + nginx в Compose) и автоматизируем его доставку на сервер. После этой практики каждый `git push` в main сам обновляет приложение.

## Схема

```
 push ─► lint (ruff/flake8, hadolint, yamllint) ─► build (docker build + push :SHA) ─► deploy (ssh → docker compose up -d) ─► verify (curl /health)
```

## Подготовка сервера

1. Пользователь `deploy` без sudo, состоит в группе `docker` (осознаём, что это почти root, — сервер выделен под приложение).
2. В `/opt/app` лежат `compose.yaml`, `.env`, `nginx/default.conf`. Образ приложения в compose задан как `image: ${APP_IMAGE}`.
3. Новая пара SSH-ключей **только для CI**: `ssh-keygen -t ed25519 -f ci_deploy -N ""`. Публичный ключ — в `~deploy/.ssh/authorized_keys`.
4. На сервере — `docker login` в GitLab Registry **deploy token** с правом `read_registry`.

## Переменные проекта (Settings → CI/CD → Variables)

| Переменная | Тип | Флаги |
| --- | --- | --- |
| `SSH_PRIVATE_KEY` | File | Protected |
| `SSH_KNOWN_HOSTS` | File (вывод `ssh-keyscan сервер`) | Protected |
| `DEPLOY_HOST` | Variable (`deploy@203.0.113.10`) | Protected |

`known_hosts` из переменной вместо `StrictHostKeyChecking=no` — защита от подмены сервера (MITM). Если ключ сервера сменится, задача упадёт, и вы это заметите.

## .gitlab-ci.yml

```yaml
stages: [lint, build, deploy, verify]

variables:
  IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA

workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

lint-python:
  stage: lint
  image: python:3.12-slim
  script:
    - pip install ruff
    - ruff check .

lint-dockerfile:
  stage: lint
  image: hadolint/hadolint:latest-debian
  script:
    - hadolint Dockerfile

build:
  stage: build
  image: docker:27
  services: [docker:27-dind]
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login "$CI_REGISTRY" -u "$CI_REGISTRY_USER" --password-stdin
  script:
    - docker pull "$CI_REGISTRY_IMAGE:latest" || true
    - docker build --cache-from "$CI_REGISTRY_IMAGE:latest" -t "$IMAGE" -t "$CI_REGISTRY_IMAGE:latest" .
    - docker push "$IMAGE"
    - docker push "$CI_REGISTRY_IMAGE:latest"

deploy:
  stage: deploy
  image: alpine:3.20
  environment:
    name: production
    url: https://app.example.com
  resource_group: production
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - chmod 400 "$SSH_PRIVATE_KEY"
    - ssh-add "$SSH_PRIVATE_KEY"
    - mkdir -p ~/.ssh
    - cp "$SSH_KNOWN_HOSTS" ~/.ssh/known_hosts
  script:
    - ssh "$DEPLOY_HOST" "cd /opt/app && APP_IMAGE=$IMAGE docker compose pull app && APP_IMAGE=$IMAGE docker compose up -d app"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

verify:
  stage: verify
  image: curlimages/curl:latest
  script:
    - curl --fail --retry 10 --retry-delay 3 --retry-all-errors https://app.example.com/health
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Что здесь важно:

- в merge request выполняются только lint и build — деплой лишь из main;
- образ тегируется **SHA коммита**, `latest` используется только как источник кэша;
- секреты прода — **Protected**: пайплайн из чужой ветки их не получит;
- `resource_group` — два деплоя не пойдут одновременно;
- `verify` проверяет, что приложение действительно поднялось.

## Откат

В **Operate → Environments → production** нажать **Re-deploy** у предыдущего успешного деплоя — задача deploy выполнится с тем `IMAGE`, который был тогда. Это работает, потому что каждый образ имеет неизменяемый тег.

## Задания на усложнение

- Тесты с PostgreSQL в `services` перед сборкой.
- Сканирование образа: `trivy image --exit-code 1 --severity CRITICAL "$IMAGE"`.
- Уведомление о падении деплоя в Telegram или Slack через webhook.
- Тот же пайплайн на Jenkins с Jenkinsfile.

## Практика

- [ ] Подготовить сервер: пользователь deploy, каталог `/opt/app` с compose.yaml, отдельный SSH-ключ для CI, deploy token для pull образов
- [ ] Добавить переменные `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS` и `DEPLOY_HOST` с правильными типами и флагами
- [ ] Написать этап lint с проверкой кода и Dockerfile и убедиться, что ошибка линтера останавливает пайплайн
- [ ] Написать этап build со сборкой и пушем образа с тегом SHA коммита
- [ ] Написать этап deploy по SSH с обновлением только контейнера приложения
- [ ] Добавить этап verify с проверкой `/health` и убедиться, что сломанный деплой делает пайплайн красным
- [ ] Выполнить откат через Re-deploy предыдущего деплоя в Environments
- [ ] Повторить пайплайн на Jenkins (по желанию)

## Тест

### Почему для CI создают отдельный SSH-ключ, а не используют личный?
- [x] Его можно отозвать, не затрагивая личный доступ
- [x] У него можно ограничить права — отдельный пользователь deploy без sudo
- [ ] Личный ключ не работает в Docker
- [ ] GitLab не принимает личные ключи
> Ключи CI регулярно ротируют.

### Зачем передавать known_hosts через переменную вместо StrictHostKeyChecking=no?
- [ ] Так быстрее подключение
- [x] Чтобы проверять ключ сервера и не подключиться к подменённому серверу (атака посредника)
- [ ] Иначе ssh не запустится
- [ ] Так требует GitLab
> Если ключ сервера изменится, задача упадёт, и это заметят.

### Почему переменная SSH_PRIVATE_KEY должна быть Protected?
- [ ] Иначе она не сохранится
- [x] Чтобы ключ от прода был доступен только пайплайнам защищённых веток, а код из произвольной ветки или MR не мог его получить
- [ ] Чтобы ключ маскировался в логах
- [ ] Protected ускоряет деплой
> Маскирование — отдельная опция.

### Зачем переменной SSH_PRIVATE_KEY тип File?
- [ ] Так ключ шифруется
- [x] GitLab запишет ключ во временный файл с сохранением переводов строк, а переменная будет содержать путь к нему — его можно передать в ssh-add
- [ ] Так ключ попадёт в артефакты
- [ ] Это ускоряет загрузку
> Многострочные значения в обычных переменных легко испортить.

### Чем помогает тег образа $CI_COMMIT_SHORT_SHA при деплое?
- [x] Видно, какой коммит развёрнут
- [x] Откат — это повторный деплой с предыдущим тегом
- [ ] Образ получается меньше
- [ ] Не нужен docker login
> latest здесь используется только как источник кэша сборки.

### Почему деплой запускается только из ветки main, а в merge request — только lint и build?
- [ ] GitLab не умеет деплоить из MR
- [x] Непроверенный код не должен попадать в прод; MR проверяется, а выкатывается только влитый в main код
- [ ] Так экономится место в реестре
- [ ] Иначе не работает кэш
> Для MR можно сделать отдельные review-окружения.

### Что даёт resource_group: production у задачи deploy?
- [ ] Выбор раннера
- [x] Два деплоя в production не выполнятся одновременно
- [ ] Ограничение памяти
- [ ] Шифрование переменных
> Иначе два быстрых merge могут перемешать версии.

### Зачем этап verify после деплоя?
- [ ] Для красоты пайплайна
- [x] Убедиться, что приложение действительно поднялось и отвечает; иначе пайплайн станет красным и проблему заметят сразу
- [ ] Для сборки образа
- [ ] Для очистки раннера
> Успешный docker compose up не гарантирует рабочее приложение.

### Как быстро откатить неудачный деплой в этой схеме?
- [ ] Пересобрать старый коммит вручную
- [x] В Operate → Environments выполнить Re-deploy предыдущего успешного деплоя — он развернёт образ с прежним тегом
- [ ] Удалить контейнер на сервере
- [ ] Удалить последний коммит из Git
> Именно поэтому теги образов должны быть неизменяемыми.

### Что нужно серверу, чтобы скачать образ из приватного GitLab Registry?
- [ ] Ничего
- [x] Выполненный docker login с deploy token, у которого есть право read_registry
- [ ] Root-доступ к GitLab
- [ ] Установленный GitLab Runner
> Токен с минимальными правами — только чтение реестра.

### Что делает команда docker compose up -d app на сервере в этой схеме?
- [ ] Пересоздаёт все сервисы проекта
- [x] Пересоздаёт только сервис app, если изменился его образ или конфигурация, не трогая базу и nginx
- [ ] Удаляет тома
- [ ] Собирает образ на сервере
> Сборка на сервере не нужна — образ уже в реестре.
