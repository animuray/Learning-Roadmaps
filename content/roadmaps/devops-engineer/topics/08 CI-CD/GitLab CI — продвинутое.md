---
title: GitLab CI — продвинутое
slug: gitlab-ci-prodvinutoe
description: needs и DAG, extends, YAML-якоря и !reference, include шаблонов из других файлов и проектов, parent-child и multi-project пайплайны через trigger, parallel matrix и resource_group.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: GitLab Docs — Optimize GitLab CI/CD configuration files
    url: https://docs.gitlab.com/ci/yaml/yaml_optimization/
    type: документация
  - title: GitLab Docs — Make jobs start earlier with needs
    url: https://docs.gitlab.com/ee/ci/directed_acyclic_graph
    type: документация
  - title: GitLab Docs — Downstream pipelines
    url: https://docs.gitlab.com/ci/pipelines/downstream_pipelines
    type: документация
  - title: GitLab Docs — CI/CD YAML syntax reference
    url: https://docs.gitlab.com/ci/yaml
    type: документация
---

# GitLab CI — продвинутое

Когда проектов десятки, а пайплайны растут до сотен строк, нужны две вещи: **скорость** (не ждать лишнего) и **переиспользование** (не копировать одно и то же).

## needs — направленный граф вместо этапов

По умолчанию задача ждёт **все** задачи предыдущего этапа. С `needs` она стартует, как только завершились **конкретные** задачи:

```yaml
stages: [build, test, deploy]

build-frontend:
  stage: build
  script: npm run build

build-backend:
  stage: build
  script: go build ./...

test-frontend:
  stage: test
  needs: [build-frontend]
  script: npm test

test-backend:
  stage: test
  needs: [build-backend]
  script: go test ./...

lint:
  stage: test
  needs: []
  script: golangci-lint run
```

- `test-frontend` не ждёт медленную сборку бэкенда.
- `needs: []` — стартовать сразу, в начале пайплайна.
- `needs` также определяет, чьи **артефакты** скачивать (`needs: [{job: build, artifacts: false}]` — не скачивать).
- Можно смешивать: часть задач по этапам, часть по `needs`.

## extends — наследование конфигурации

```yaml
.python-base:
  image: python:3.12-slim
  before_script:
    - pip install -r requirements.txt
  tags: [docker]

.tests:
  extends: .python-base
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

unit:
  extends: .tests
  script: pytest tests/unit

integration:
  extends: .tests
  script: pytest tests/integration
```

- Сливаются **словари** (глубокое слияние), а **списки заменяются целиком**: `script` задачи полностью заменяет `script` шаблона.
- Можно наследоваться от нескольких: `extends: [.a, .b]`.
- Поддерживается многоуровневое наследование (не увлекайтесь — больше 3 уровней читать тяжело).
- Работает **между файлами** через `include` — в отличие от якорей.

## YAML-якоря и !reference

```yaml
.default_scripts: &default_scripts
  - ./prepare.sh
  - ./check-env.sh

job1:
  script:
    - *default_scripts
    - ./job.sh
```

Якоря — стандартный YAML, работают только в пределах одного файла и умеют вставлять фрагменты списков.

`!reference` — расширение GitLab: взять конкретный ключ другой задачи, в том числе из подключённого файла:

```yaml
include:
  - local: ci/setup.yml

test:
  script:
    - !reference [.setup, script]
    - pytest
```

## include — подключение конфигурации

```yaml
include:
  - local: ci/build.yml
  - project: devops/ci-templates
    ref: v1.4.0
    file:
      - templates/docker-build.yml
      - templates/deploy.yml
  - remote: https://example.com/ci/lint.yml
  - template: Jobs/SAST.gitlab-ci.yml
  - component: $CI_SERVER_FQDN/devops/components/python-test@1.2.0
    inputs:
      python_version: "3.12"
```

| Вид | Откуда |
| --- | --- |
| `local` | Файл из этого же репозитория |
| `project` | Файл из другого проекта GitLab, с `ref` (ветка, тег, SHA) |
| `remote` | По URL |
| `template` | Встроенные шаблоны GitLab |
| `component` | Компоненты CI/CD из каталога — шаблоны с явными параметрами `inputs` |

Типичный паттерн компании: отдельный репозиторий `ci-templates` с проверенными шаблонами сборки, сканирования и деплоя, а в проектах — 5–10 строк `include` + `extends`. **Фиксируйте `ref` на тег**, иначе изменение шаблона сломает пайплайны всех проектов одновременно.

Подключённую конфигурацию можно переопределить: задача с тем же именем в локальном файле сливается с подключённой.

## trigger — пайплайны, запускающие пайплайны

**Parent-child** — дочерний пайплайн в том же проекте (монорепозиторий: отдельный пайплайн на каждый сервис):

```yaml
frontend:
  trigger:
    include: frontend/.gitlab-ci.yml
    strategy: depend
  rules:
    - changes: [frontend/**/*]
```

**Multi-project** — запустить пайплайн другого проекта (например, деплой-репозиторий после сборки):

```yaml
deploy:
  stage: deploy
  trigger:
    project: devops/infra-deploy
    branch: main
    strategy: depend
  variables:
    APP_VERSION: $CI_COMMIT_SHORT_SHA
```

- `strategy: depend` — статус задачи-триггера отражает статус дочернего пайплайна (иначе триггер «успешен», как только пайплайн создан).
- Динамические дочерние пайплайны: задача генерирует YAML и сохраняет как артефакт, триггер запускает его (`include: artifact:`).

## Ещё полезное

```yaml
test:
  parallel:
    matrix:
      - PYTHON: ["3.11", "3.12", "3.13"]
        DB: [postgres, mysql]
  image: python:$PYTHON
  script: pytest

deploy-prod:
  resource_group: production
  interruptible: false
  script: ./deploy.sh
```

- `parallel: matrix` — одна задача размножается на все комбинации переменных (здесь 6 задач).
- `resource_group` — задачи с одной группой выполняются по одной (не будет двух одновременных деплоев).
- `interruptible: true` — задачу можно отменить, если в ветку пришёл более новый коммит (экономит раннеры); для деплоев — `false`.
- **Merge request pipelines** и **merged results pipelines** — проверка результата слияния до мержа.
- **Расписания** (Build → Pipeline schedules) — ночные тесты, очистка, бэкапы; в rules — `$CI_PIPELINE_SOURCE == "schedule"`.

## Практика

- [ ] Перевести пайплайн с этапами на `needs` и сравнить общее время в графе пайплайна
- [ ] Вынести общий шаблон `.python-base` и подключить его в нескольких задачах через `extends`
- [ ] Проверить на практике, что `extends` сливает словари `variables`, но заменяет `script`
- [ ] Создать отдельный проект `ci-templates`, вынести туда шаблон сборки Docker-образа и подключить его через `include: project` с `ref` на тег
- [ ] Сделать монорепозиторий с двумя сервисами и запускать дочерний пайплайн каждого только при изменениях в его каталоге
- [ ] Запустить тесты на трёх версиях Python через `parallel: matrix`

## Тест

### Что даёт ключ needs?
- [ ] Задача выполняется только вручную
- [x] Задача стартует сразу после завершения перечисленных задач, не дожидаясь окончания всего предыдущего этапа
- [ ] Задача выполняется на определённом раннере
- [ ] Задача копирует кэш
> Так строится направленный ациклический граф (DAG) задач.

### Что означает needs: [] у задачи на этапе test?
- [ ] Задача не зависит ни от чего и поэтому никогда не запускается
- [x] Задача стартует сразу в начале пайплайна, не дожидаясь предыдущих этапов
- [ ] Задача ждёт все задачи всех этапов
- [ ] Задача получает артефакты всех задач
> Удобно для линтеров, которым не нужны результаты сборки.

### Как extends объединяет конфигурацию шаблона и задачи?
- [x] Словари сливаются глубоко, значения задачи перекрывают значения шаблона
- [x] Списки, например script, не сливаются — список задачи заменяет список шаблона
- [ ] Списки склеиваются
- [ ] Шаблон всегда перекрывает задачу
> Чтобы склеить списки команд, используют якоря или !reference.

### Можно ли использовать YAML-якорь, определённый в файле, подключённом через include?
- [ ] Да, всегда
- [x] Нет: якоря работают только внутри файла; между файлами используют extends или !reference
- [ ] Только для include: local
- [ ] Только в платной версии
> Это стандартное ограничение YAML.

### Какие виды include существуют?
- [x] local — файл из этого же репозитория
- [x] project — файл из другого проекта GitLab
- [x] remote и template — по URL и встроенные шаблоны GitLab
- [ ] docker — файл из образа
> Также есть component — компоненты CI/CD из каталога.

### Почему при include: project стоит указывать ref на тег?
- [ ] Иначе include не работает
- [x] Иначе изменение шаблона в основной ветке сразу затронет пайплайны всех проектов и может их сломать
- [ ] Теги быстрее скачиваются
- [ ] Так требует Runner
> Обновление шаблонов — осознанный переход на новую версию.

### Чем parent-child пайплайн отличается от multi-project?
- [ ] Ничем
- [x] Дочерний пайплайн запускается в том же проекте, а multi-project — в другом проекте
- [ ] Multi-project нельзя запустить из .gitlab-ci.yml
- [ ] Дочерний пайплайн всегда запускается вручную
> Оба запускаются ключом trigger.

### Зачем у задачи с trigger указывают strategy: depend?
- [ ] Чтобы запустить пайплайн вручную
- [x] Чтобы статус задачи-триггера ждал и отражал результат запущенного пайплайна
- [ ] Чтобы передать артефакты
- [ ] Чтобы отключить дочерний пайплайн
> Без этого триггер считается успешным сразу после создания пайплайна.

### Сколько задач создаст parallel: matrix с PYTHON из трёх значений и DB из двух значений?
= 6
= шесть
> Все комбинации значений переменных.

### Для чего нужен resource_group: production?
- [ ] Для выбора раннера
- [x] Чтобы задачи с этой группой выполнялись строго по одной — например, не было двух одновременных деплоев в прод
- [ ] Для хранения переменных прода
- [ ] Для ограничения памяти раннера
> Остальные ждут, пока текущая задача группы не закончится.

### Что делает interruptible: true?
- [ ] Задачу нельзя отменить
- [x] Задачу можно автоматически отменить, если в ветку пришёл более новый коммит и запустился новый пайплайн
- [ ] Задача перезапускается при сбое
- [ ] Задача выполняется в фоне
> Для деплоев лучше оставить false.

### Для чего используют тег !reference?
- [ ] Для ссылок на документацию
- [x] Чтобы вставить конкретный ключ (например, script) из другой задачи, в том числе из подключённого файла
- [ ] Для подключения переменных из настроек
- [ ] Для указания ветки
> Пример: `- !reference [.setup, script]`.
