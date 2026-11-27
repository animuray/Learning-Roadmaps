---
title: GitLab CI — основы
slug: gitlab-ci-osnovy
description: Файл .gitlab-ci.yml, pipeline, stages и jobs, image и services, script, rules и workflow, предопределённые переменные, статусы задач и CI Lint.
duration: 90
level: Основы
quizSize: 10
materials:
  - title: GitLab Docs — CI/CD YAML syntax reference
    url: https://docs.gitlab.com/ci/yaml
    type: документация
  - title: GitLab Docs — Job control (rules)
    url: https://docs.gitlab.com/16.11/ee/ci/jobs/job_control.html
    type: документация
  - title: GitLab Docs — Predefined CI/CD variables reference
    url: https://docs.gitlab.com/ci/variables/predefined_variables
    type: документация
---

# GitLab CI — основы

GitLab CI запускает пайплайн, описанный в файле **`.gitlab-ci.yml`** в корне репозитория. Задачи выполняет **GitLab Runner** — отдельная программа на сервере (на GitLab.com есть общие раннеры).

## Термины

- **Pipeline** — один запуск всего конвейера (на push, merge request, тег, по расписанию, вручную).
- **Stage** — этап. Этапы идут **последовательно**; следующий начинается, когда все задачи предыдущего успешно завершились.
- **Job** — задача внутри этапа. Задачи одного этапа идут **параллельно** (если хватает раннеров).
- **Runner** — исполнитель задач.

```
 Pipeline #1234
 ┌── build ──┐   ┌──── test ────┐   ┌── deploy ──┐
 │ build-img │ → │ unit-tests   │ → │ deploy-dev │
 └───────────┘   │ lint         │   └────────────┘
                 └──────────────┘
```

## Минимальный .gitlab-ci.yml

```yaml
stages:
  - build
  - test
  - deploy

build-job:
  stage: build
  image: python:3.12-slim
  script:
    - pip install -r requirements.txt
    - python -m compileall .

lint:
  stage: test
  image: python:3.12-slim
  script:
    - pip install ruff
    - ruff check .

unit-tests:
  stage: test
  image: python:3.12-slim
  services:
    - name: postgres:16
      alias: db
  variables:
    POSTGRES_PASSWORD: test
    DATABASE_URL: postgresql://postgres:test@db:5432/postgres
  script:
    - pip install -r requirements.txt
    - pytest

deploy-dev:
  stage: deploy
  script:
    - echo "Деплой коммита $CI_COMMIT_SHORT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Ключевые слова задачи:

| Ключ | Смысл |
| --- | --- |
| `stage` | Этап. По умолчанию — `test` |
| `image` | Docker-образ, в котором выполняется задача (для Docker/Kubernetes executor) |
| `services` | Дополнительные контейнеры рядом с задачей: база, Redis, `docker:dind` |
| `script` | **Обязательно.** Команды shell; ненулевой код возврата любой строки — задача упала |
| `before_script` / `after_script` | Команды до и после `script`. `after_script` выполняется даже при падении |
| `variables` | Переменные задачи |
| `tags` | Выбрать раннер с этими тегами |
| `rules` | Когда задача попадает в пайплайн |
| `allow_failure` | Падение задачи не роняет пайплайн |
| `retry`, `timeout` | Повторы при сбое и ограничение времени |

Встроенные служебные этапы `.pre` и `.post` выполняются в самом начале и в самом конце. Задача, имя которой начинается с точки (`.template`), — **скрытая**: она не выполняется и служит шаблоном.

## rules — когда запускать задачу

Правила проверяются **сверху вниз до первого совпадения**:

```yaml
deploy-prod:
  script: ./deploy.sh prod
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: never
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
      when: manual
    - when: never

test-docs:
  script: make docs
  rules:
    - changes:
        - docs/**/*
```

- `if:` — условие по переменным (`==`, `!=`, `=~` для регулярных выражений, `&&`, `||`);
- `changes:` — изменились ли файлы;
- `exists:` — есть ли файл в репозитории;
- `when:` — `on_success` (по умолчанию), `manual`, `always`, `never`, `delayed`.

Если ни одно правило не сработало — задача **не добавляется**.

> [!note] only/except
> Старые ключи `only:` и `except:` ещё встречаются в чужих конфигах, но больше не развиваются. Пишите новые пайплайны на `rules:`; смешивать их в одной задаче нельзя.

### workflow:rules — когда создавать пайплайн вообще

```yaml
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG
```

Так не будет дублирующихся пайплайнов (для ветки и для merge request одновременно).

## Полезные предопределённые переменные

| Переменная | Значение |
| --- | --- |
| `CI_COMMIT_SHA` / `CI_COMMIT_SHORT_SHA` | Полный хеш коммита / первые 8 символов |
| `CI_COMMIT_BRANCH` | Ветка (нет в пайплайнах тегов и MR) |
| `CI_COMMIT_TAG` | Тег (только в пайплайнах тегов) |
| `CI_COMMIT_REF_SLUG` | Имя ветки/тега, пригодное для URL и имён |
| `CI_DEFAULT_BRANCH` | Ветка по умолчанию (обычно main) |
| `CI_PIPELINE_SOURCE` | Источник: `push`, `merge_request_event`, `schedule`, `web`, `trigger`… |
| `CI_PROJECT_DIR` | Каталог с клоном репозитория |
| `CI_REGISTRY_IMAGE` | Путь образа проекта в Container Registry |
| `CI_JOB_TOKEN` | Временный токен задачи |

## Статусы и отладка

- Статусы: `created`, `pending` (ждёт раннер), `running`, `passed`, `failed`, `canceled`, `skipped`, `manual`.
- `pending` долго — нет свободного раннера с нужными `tags`.
- Проверка синтаксиса: **Build → Pipeline editor** и встроенная проверка (CI Lint) до коммита.
- Отладка: `echo`, `env | sort` в script (осторожно — секреты!), повторный запуск задачи (Retry).

## Практика

- [ ] Создать проект на GitLab, добавить `.gitlab-ci.yml` с тремя этапами и убедиться, что пайплайн запускается на push
- [ ] Добавить в этап test две задачи и увидеть, что они выполняются параллельно
- [ ] Сломать тест и посмотреть, как падение задачи останавливает следующие этапы; затем пометить задачу `allow_failure: true`
- [ ] Запустить тесты с базой PostgreSQL через `services`
- [ ] Настроить `rules`: деплой только из main, документация — только при изменениях в `docs/`
- [ ] Добавить `workflow:rules`, чтобы не было дублирующихся пайплайнов для ветки и merge request
- [ ] Вывести в задаче `CI_COMMIT_SHORT_SHA`, `CI_COMMIT_REF_SLUG` и `CI_PIPELINE_SOURCE`

## Тест

### Как называется файл конфигурации пайплайна GitLab CI?
= .gitlab-ci.yml
= gitlab-ci.yml
> Он лежит в корне репозитория (путь можно изменить в настройках проекта).

### Как выполняются задачи внутри одного этапа (stage)?
- [ ] Строго по очереди в порядке описания
- [x] Параллельно, если хватает раннеров
- [ ] Только одна задача на этап
- [ ] В случайном порядке по одной
> А сами этапы идут последовательно.

### Что произойдёт, если задача на этапе test упала (без allow_failure)?
- [ ] Следующие этапы всё равно выполнятся
- [x] Задачи следующих этапов по умолчанию не запустятся, пайплайн будет failed
- [ ] Задача автоматически перезапустится бесконечно
- [ ] GitLab удалит коммит
> Задачи с `when: on_failure` или `always` всё же могут выполниться.

### Какой ключ задачи обязателен?
= script
> Исключение — задачи с trigger, они запускают другой пайплайн.

### Для чего нужен ключ services?
- [ ] Для деплоя в Kubernetes
- [x] Чтобы запустить рядом с задачей дополнительные контейнеры, например базу данных для интеграционных тестов
- [ ] Для выбора раннера
- [ ] Для хранения секретов
> Сервис доступен по имени образа или по alias.

### Как работают rules у задачи?
- [x] Правила проверяются сверху вниз, применяется первое совпавшее
- [x] Если ни одно правило не совпало, задача не попадёт в пайплайн
- [ ] Применяются все совпавшие правила одновременно
- [ ] rules работают только для тегов
> `when: never` позволяет явно исключать случаи.

### Какое условие запустит задачу только в ветке по умолчанию?
- [ ] if: $CI_COMMIT_TAG
- [x] if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
- [ ] if: $CI_PIPELINE_SOURCE == "schedule"
- [ ] changes: main
> CI_DEFAULT_BRANCH обычно равна main.

### Чем workflow:rules отличается от rules задачи?
- [ ] Ничем
- [x] workflow:rules решает, создавать ли пайплайн целиком, а rules задачи — попадёт ли конкретная задача в пайплайн
- [ ] workflow:rules работает только в Jenkins
- [ ] rules задачи нельзя использовать с workflow
> Классическое применение — избежать двойных пайплайнов для ветки и MR.

### Что означает задача, имя которой начинается с точки, например .template?
- [ ] Она выполняется первой
- [x] Это скрытая задача: она не выполняется и используется как шаблон для других
- [ ] Это ошибка синтаксиса
- [ ] Она выполняется только вручную
> Её подключают через extends или якоря.

### Что содержит переменная CI_COMMIT_SHORT_SHA?
- [ ] Имя ветки
- [x] Первые 8 символов хеша коммита
- [ ] Номер пайплайна
- [ ] Имя автора коммита
> Удобный тег для образов.

### Задача долго висит в статусе pending. Наиболее вероятная причина?
- [ ] Ошибка в script
- [x] Нет свободного или подходящего раннера, например не совпадают tags
- [ ] Неверный образ
- [ ] Слишком длинный пайплайн
> Ошибка в script приведёт к failed, а не к pending.

### Чем after_script отличается от script?
- [ ] Ничем
- [x] after_script выполняется после script, в том числе если задача упала, — удобно для очистки и сбора логов
- [ ] after_script выполняется перед script
- [ ] after_script выполняется только при успехе
> Ошибки в after_script не меняют статус задачи.

### Почему для новых пайплайнов рекомендуют rules, а не only и except?
- [ ] only и except работают быстрее
- [x] only и except больше не развиваются, а rules гибче: условия по переменным, изменённым файлам и наличию файлов, when для каждого случая
- [ ] rules работают только в платной версии
- [ ] only и except нельзя использовать с тегами
> В одной задаче смешивать rules и only/except нельзя.
