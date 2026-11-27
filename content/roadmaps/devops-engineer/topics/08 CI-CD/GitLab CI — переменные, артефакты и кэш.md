---
title: GitLab CI — переменные, артефакты и кэш
slug: gitlab-ci-peremennye-artefakty-kesh
description: Переменные в YAML и в настройках проекта (masked, protected, file), приоритеты, before_script, артефакты и кэш и их отличия, сборка и пуш образа в GitLab Registry, environments и when manual.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: GitLab Docs — GitLab CI/CD variables
    url: https://docs.gitlab.com/ci/variables
    type: документация
  - title: GitLab Docs — Caching in GitLab CI/CD
    url: https://docs.gitlab.com/ci/caching/
    type: документация
  - title: GitLab Docs — CI/CD caching examples
    url: https://docs.gitlab.com/ci/caching/examples/
    type: документация
  - title: GitLab Docs — Deployments (when manual)
    url: https://docs.gitlab.com/ee/ci/environments/deployments/
    type: документация
  - title: GitLab Docs — Build and push container images
    url: https://docs.gitlab.com/user/packages/container_registry/build_and_push_images/
    type: документация
---

# GitLab CI — переменные, артефакты и кэш

## Переменные в YAML

```yaml
variables:
  APP_NAME: myapp
  IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA

build:
  variables:
    DOCKER_BUILDKIT: "1"
  script:
    - echo "Собираю $APP_NAME в $IMAGE"
```

Глобальные `variables` действуют для всех задач, переменные задачи их дополняют и переопределяют. В YAML хранят только **не секретные** значения.

## CI/CD Variables в настройках — для секретов

**Settings → CI/CD → Variables** (на уровне проекта, группы или инстанса):

| Опция | Что даёт |
| --- | --- |
| **Masked** | Значение заменяется на `[MASKED]` в логах задач. Есть ограничения на формат значения |
| **Masked and hidden** | Значение нельзя посмотреть даже в настройках после сохранения |
| **Protected** | Переменная доступна **только** в пайплайнах защищённых веток и тегов |
| **Type: File** | GitLab записывает значение во временный файл, а переменная содержит **путь** к нему — для SSH-ключей, kubeconfig, сертификатов |
| **Environment scope** | Переменная только для окружения, например `production` |

> [!warning] Маскирование — не защита от злого умысла
> `[MASKED]` спасает от случайной утечки в лог. Скрипт в merge request может отправить секрет куда угодно. Поэтому секреты прода делают **Protected**: пайплайн из обычной ветки их просто не получит.

### Приоритет (от высшего к низшему, упрощённо)

1. Переменные, заданные при ручном запуске, в расписании или триггере.
2. Переменные проекта, затем группы, затем инстанса (из настроек).
3. Переменные задачи в `.gitlab-ci.yml`.
4. Глобальные переменные в `.gitlab-ci.yml`.
5. Предопределённые переменные.

Переменная из настроек перекрывает одноимённую из YAML.

## before_script и default

```yaml
default:
  image: python:3.12-slim
  before_script:
    - pip install -r requirements.txt
  interruptible: true

lint:
  script: ruff check .

test:
  script: pytest
```

`default:` задаёт значения по умолчанию для всех задач (`image`, `before_script`, `cache`, `tags`, `retry`…). Если задача задаёт свой `before_script`, он **заменяет**, а не дополняет значение по умолчанию.

## Артефакты

```yaml
build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

test:
  stage: test
  script:
    - npm test -- --reporter=junit --outputFile=report.xml
  artifacts:
    when: always
    reports:
      junit: report.xml

deploy:
  stage: deploy
  script:
    - ls dist/
```

- Артефакты сохраняются **в GitLab** после задачи и автоматически скачиваются задачами **следующих этапов** того же пайплайна.
- `expire_in` — срок хранения (по умолчанию 30 дней; последние артефакты ветки могут храниться дольше).
- `when: always` — сохранить даже при падении (логи, отчёты).
- `reports: junit` — результаты тестов отображаются в merge request.
- `dependencies: [build]` или `needs` — управлять, чьи артефакты скачивать (`dependencies: []` — никаких).
- Пути — относительно каталога проекта.

## Кэш

```yaml
variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"

test:
  cache:
    key:
      files:
        - requirements.txt
    paths:
      - .cache/pip
    policy: pull-push
  script:
    - pip install -r requirements.txt
    - pytest
```

- Кэш хранится **на раннере** (или в S3 при распределённом кэше) и переиспользуется **между пайплайнами**.
- `key` — какой кэш брать: по ветке (`$CI_COMMIT_REF_SLUG`), по lock-файлу (`key: files:`), общий.
- `policy: pull` — только читать (для множества параллельных задач), `push` — только сохранять.
- Кэш — **оптимизация без гарантий**: задача должна работать и без него.
- Кэшировать можно только файлы **внутри каталога проекта** — поэтому `PIP_CACHE_DIR`, `npm_config_cache` перенаправляют туда.

### Кэш и артефакты — главное отличие

| | Кэш | Артефакты |
| --- | --- | --- |
| Для чего | Ускорить: зависимости, скачанные пакеты | Передать результат: сборку, отчёты, бинарники |
| Где хранится | На раннере / в S3 | В GitLab |
| Между пайплайнами | Да | Нет (только внутри пайплайна) |
| Гарантирован | Нет | Да |
| Можно скачать из интерфейса | Нет | Да |

## Сборка и пуш образа в GitLab Registry

```yaml
build-image:
  stage: build
  image: docker:27
  services:
    - docker:27-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login "$CI_REGISTRY" -u "$CI_REGISTRY_USER" --password-stdin
  script:
    - docker build --pull -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"
```

`docker:dind` (Docker-in-Docker) запускает отдельный демон Docker рядом с задачей. Альтернативы без привилегированного режима — **Kaniko**, **Buildah**, BuildKit rootless.

## Environments и when: manual

```yaml
deploy-staging:
  stage: deploy
  script: ./deploy.sh staging
  environment:
    name: staging
    url: https://staging.example.com
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy-prod:
  stage: deploy
  script: ./deploy.sh production
  environment:
    name: production
    url: https://example.com
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
```

- `environment` — GitLab ведёт историю деплоев: какой коммит и когда выкачен, ссылка на стенд, кнопка повторного деплоя предыдущей версии (**Operate → Environments**).
- `when: manual` — задача ждёт нажатия кнопки **Run** в интерфейсе.
- **Protected environments** (платные тарифы) — кто именно может деплоить в окружение и нужны ли согласования.
- `resource_group: production` — не дать двум деплоям в одно окружение идти одновременно.

## Практика

- [ ] Вынести общие настройки в `default:` и проверить, как задача со своим `before_script` его переопределяет
- [ ] Добавить в настройки проекта переменную `DEPLOY_TOKEN` с флагами Masked и Protected; убедиться, что в обычной ветке она пустая, а в main — замаскирована в логе
- [ ] Передать собранную статику из этапа build в этап deploy через артефакты
- [ ] Настроить кэш pip или npm с ключом по lock-файлу и сравнить время задачи с кэшем и без
- [ ] Собрать образ в CI и выгрузить в Container Registry проекта с тегом `$CI_COMMIT_SHORT_SHA`
- [ ] Описать окружения staging (автоматически) и production (`when: manual`) и найти историю деплоев в Operate → Environments

## Тест

### Что делает опция Protected у CI/CD-переменной?
- [ ] Скрывает значение в логах
- [x] Делает переменную доступной только в пайплайнах защищённых веток и тегов
- [ ] Шифрует переменную в Git
- [ ] Запрещает менять переменную
> Скрытие в логах — это Masked.

### Что произойдёт, если задача выведет в лог значение переменной с опцией Masked?
- [ ] Задача упадёт
- [x] Вместо значения в логе будет [MASKED]
- [ ] Значение будет выведено полностью
- [ ] GitLab удалит переменную
> Но маскирование не мешает злонамеренному скрипту отправить значение наружу.

### Зачем переменная типа File?
- [ ] Чтобы хранить большие файлы в Git
- [x] GitLab записывает значение во временный файл, а переменная содержит путь — удобно для SSH-ключей, kubeconfig и сертификатов
- [ ] Чтобы передать файл в артефакты
- [ ] Чтобы переменная была видна во всех проектах
> Многострочные ключи в файле не ломаются.

### Где правильно хранить пароль от прода для пайплайна?
- [ ] В variables в .gitlab-ci.yml
- [x] В CI/CD-переменных настроек с опциями Masked и Protected или во внешнем хранилище секретов
- [ ] В комментарии к коммиту
- [ ] В README
> Всё, что в .gitlab-ci.yml, видят все, у кого есть доступ к репозиторию.

### Одна и та же переменная задана в .gitlab-ci.yml и в настройках проекта. Какое значение получит задача?
- [ ] Из .gitlab-ci.yml
- [x] Из настроек проекта — они приоритетнее YAML
- [ ] Будет ошибка
- [ ] Случайное
> Ещё выше — переменные ручного запуска, расписания и триггера.

### Чем кэш отличается от артефактов?
- [x] Кэш ускоряет работу (зависимости) и переиспользуется между пайплайнами, но не гарантирован
- [x] Артефакты — гарантированный результат задачи, который передаётся следующим этапам и доступен для скачивания
- [ ] Артефакты хранятся только на раннере
- [ ] Кэш передаётся между этапами гарантированно
> Зависимости — в кэш, сборку и отчёты — в артефакты.

### Почему для кэша pip задают PIP_CACHE_DIR внутри $CI_PROJECT_DIR?
- [ ] Так быстрее работает pip
- [x] GitLab кэширует только файлы внутри каталога проекта
- [ ] Иначе pip не установит пакеты
- [ ] Это требование Python
> То же для npm, Go modules и других менеджеров.

### Как сделать, чтобы деплой в прод выполнялся только по кнопке?
- [ ] allow_failure: true
- [x] when: manual (например, в rules для ветки main)
- [ ] retry: 0
- [ ] stage: manual
> Кнопка Run появится в интерфейсе пайплайна и окружения.

### Что даёт ключ environment у задачи деплоя?
- [x] История деплоев: какой коммит и когда выкачен в окружение
- [x] Ссылку на стенд и возможность повторно задеплоить предыдущую версию
- [ ] Автоматическое создание сервера
- [ ] Шифрование переменных
> Смотрите раздел Operate → Environments.

### Какой срок хранения артефактов по умолчанию, если expire_in не задан?
- [ ] Навсегда
- [x] 30 дней
- [ ] 1 день
- [ ] До следующего пайплайна
> Последние артефакты ветки могут храниться дольше, если включена соответствующая настройка.

### Как сохранить отчёт тестов даже при падении задачи?
- [ ] cache: always
- [x] artifacts: when: always
- [ ] allow_failure: true
- [ ] after_script: save
> По умолчанию артефакты сохраняются только при успехе.

### Зачем в задаче сборки образа указывают services: docker:dind?
- [ ] Для доступа к реестру
- [x] Чтобы рядом с задачей запустился отдельный демон Docker, к которому обращается docker build
- [ ] Чтобы ускорить скачивание пакетов
- [ ] Для запуска тестов
> Альтернативы без привилегированного режима — Kaniko и Buildah.

### Задача задаёт свой before_script, а в default тоже есть before_script. Что выполнится?
- [ ] Оба, сначала default
- [x] Только before_script задачи — он заменяет значение по умолчанию
- [ ] Только default
- [ ] Ошибка конфигурации
> Ключи в задаче переопределяют default, а не объединяются с ним.
