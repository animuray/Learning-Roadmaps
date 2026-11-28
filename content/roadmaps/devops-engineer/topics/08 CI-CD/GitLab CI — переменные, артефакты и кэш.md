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

## Лаборатория

Пайплайны выполняются локально через `gitlab-ci-local` (см. тему «GitLab CI — основы»).

```bash lib
# Пайплайны GitLab CI выполняются локально утилитой gitlab-ci-local (shell executor — задачи идут прямо на стенде)
# lab_ci_repo каталог — новый репозиторий ученика с одним коммитом (файлы кладёт вызывающий до коммита)
lab_ci_repo() { rm -rf "$1"; mkdir -p "$1"; }
lab_ci_commit() { chown -R student:student "$1"; su - student -c "cd $1 && git init -q -b main 2>/dev/null; git add -A && git commit -qm 'Initial commit'"; }
# lab_ci_run каталог [ключи] — пайплайн от имени ученика; вывод — в /tmp/lab-ci.log, код возврата — код пайплайна
lab_ci_run() { su - student -c "cd $1 && timeout 300 gitlab-ci-local $2" > /tmp/lab-ci.log 2>&1; }
# lab_ci_preview каталог — итоговый YAML после include, extends и default (JSON)
lab_ci_preview() { su - student -c "cd $1 && gitlab-ci-local --preview" 2>/dev/null | sed -n '/^---$/,$p' | python3 -c 'import sys,yaml,json; print(json.dumps(yaml.safe_load(sys.stdin)))'; }
# lab_ci_jobs каталог [ветка] — список задач (JSON); с веткой — во временной копии репозитория на этой ветке
lab_ci_jobs() {
  if [ -n "$2" ]; then
    rm -rf /tmp/lab-ci-branch; su - student -c "git clone -q $1 /tmp/lab-ci-branch && cd /tmp/lab-ci-branch && cp $1/.gitlab-ci*.yml . 2>/dev/null; [ -d $1/ci ] && mkdir -p ci && cp -r $1/ci/. ci/; git switch -qc $2 && gitlab-ci-local --list-json" 2>/dev/null
  else
    su - student -c "cd $1 && gitlab-ci-local --list-json" 2>/dev/null
  fi
}
lab_ci_log() { sed 's/\x1b\[[0-9;]*m//g' /tmp/lab-ci.log | grep -vE '^\s*$' | tail -n "${1:-4}" | tr '\n' ' ' | cut -c1-300; }
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
```

```bash setup
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
```

### Передать сборку в деплой

В `~/ci-site` — статический сайт: шаблон `index.html` с меткой `__VERSION__`. Напишите пайплайн из двух этапов:

- **build** — задача `build` собирает сайт в `public/`: копирует `index.html`, заменив `__VERSION__` на **короткий SHA коммита** (готовая переменная GitLab), и сохраняет `public/` как **артефакт**;
- **deploy** — задача `deploy` **без пересборки** берёт `public/` из артефакта и копирует его содержимое в `~/ci-www/` (это «сервер»).

После запуска пайплайна `~/ci-www/index.html` должен содержать SHA текущего коммита.

```bash setup
d=/home/student/ci-site
lab_ci_repo $d
rm -rf /home/student/ci-www
echo '<h1>Сайт, версия __VERSION__</h1>' > $d/index.html
printf '.gitlab-ci-local/\npublic/\n' > $d/.gitignore
lab_ci_commit $d
```

```bash check
d=/home/student/ci-site
[ -f $d/.gitlab-ci.yml ] || fail "Нет ~/ci-site/.gitlab-ci.yml"
rm -rf /home/student/ci-www $d/public
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log)"
sha=$(su - student -c "cd $d && git rev-parse --short=8 HEAD")
[ -f /home/student/ci-www/index.html ] || fail "После пайплайна нет ~/ci-www/index.html"
grep -q "$sha" /home/student/ci-www/index.html || fail "~/ci-www/index.html не содержит SHA коммита $sha: $(head -c 100 /home/student/ci-www/index.html)"
p=$(lab_ci_preview $d)
echo "$p" | jq -e '.build.artifacts.paths | map(test("^public/?$")) | any' >/dev/null || fail "Задача build не сохраняет public/ как артефакт"
[ "$(echo "$p" | jq -r '.deploy.script | join(" ")' | grep -cE 'sed|__VERSION__')" = 0 ] || fail "Задача deploy пересобирает сайт сама, а должна брать готовый из артефакта"
ok "сборка $sha доехала до ~/ci-www через артефакт"
```

```text hint
1. В задаче сборки: создать каталог, подставить переменную с коротким SHA в шаблон потоковым редактором, описать артефакт с путём к каталогу.
2. Задача следующего этапа получает артефакты предыдущих этапов автоматически — в ней остаётся только скопировать файлы.
3. Короткий SHA — переменная с «SHORT_SHA» в имени.
```

```bash solution
cat > ~/ci-site/.gitlab-ci.yml <<'EOF'
stages: [build, deploy]

build:
  stage: build
  script:
    - mkdir -p public
    - sed "s/__VERSION__/$CI_COMMIT_SHORT_SHA/" index.html > public/index.html
  artifacts:
    paths: [public/]
    expire_in: 1 day

deploy:
  stage: deploy
  script:
    - mkdir -p "$HOME/ci-www"
    - cp -r public/. "$HOME/ci-www/"
EOF
cd ~/ci-site && gitlab-ci-local && cat ~/ci-www/index.html
```

```text review
Эталон: `artifacts: paths: [public/]` в build, в deploy — только копирование.

- **Артефакт** — результат задачи для следующих этапов и людей: собранные файлы, отчёты тестов (`artifacts: reports: junit:`), образы не кладут — для них реестр.
- **Кэш** — ускоритель (зависимости между запусками пайплайнов), его может и не быть. Путать их — частая ошибка: собранное приложение через кэш передавать нельзя.
- Принцип «build once, deploy many»: собрали один раз, тот же артефакт уходит на staging и prod. Пересборка в deploy = на прод уходит не то, что тестировали.
- `needs: [build]` у deploy — запуск сразу после build, не дожидаясь всего этапа; `dependencies: []` — не скачивать артефакты вовсе.
```

```text notes
\bcache: => Сборка передавалась через cache — кэш может не доехать (другой раннер, очищен). Результат сборки передают артефактами.
```

### Секрет вне репозитория

Задача `deploy` в `~/ci-secret` использует токен `$DEPLOY_TOKEN` и падает, если его нет. В GitLab секреты хранят в настройках проекта (Settings → CI/CD → Variables), **а не в `.gitlab-ci.yml`**. У `gitlab-ci-local` аналог настроек проекта — файл **`.gitlab-ci-local-variables.yml`** в корне проекта.

Задайте `DEPLOY_TOKEN` со значением `tok-9f3a7c21` **там**, а не в `.gitlab-ci.yml`, и сделайте так, чтобы этот файл **никогда не попал в Git**. Пайплайн должен проходить.

```bash setup
d=/home/student/ci-secret
lab_ci_repo $d
cat > $d/.gitlab-ci.yml <<'EOF'
stages: [deploy]

deploy:
  stage: deploy
  script:
    - test -n "$DEPLOY_TOKEN" || { echo "DEPLOY_TOKEN не задан"; exit 1; }
    - echo "deploying with token of length ${#DEPLOY_TOKEN}"
    - test "$(echo -n "$DEPLOY_TOKEN" | sha256sum | cut -c1-8)" = "f85a86e4" || { echo "токен неверный"; exit 1; }
EOF
printf '.gitlab-ci-local/\n' > $d/.gitignore
lab_ci_commit $d
```

```bash check
d=/home/student/ci-secret
grep -q 'tok-9f3a7c21' $d/.gitlab-ci.yml && fail "Токен записан прямо в .gitlab-ci.yml — он попадёт в историю Git"
[ -f $d/.gitlab-ci-local-variables.yml ] || fail "Нет файла .gitlab-ci-local-variables.yml"
su - student -c "cd $d && git check-ignore -q .gitlab-ci-local-variables.yml" || fail ".gitlab-ci-local-variables.yml не игнорируется Git"
su - student -c "cd $d && git log --all --format=%H -- .gitlab-ci-local-variables.yml" | grep -q . && fail "Файл с секретом уже попал в историю Git"
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log 3)"
ok "секрет — вне репозитория, пайплайн проходит"
```

```text hint
1. Файл переменных — обычный YAML: имя переменной и значение.
2. Добавить его имя в файл исключений Git и убедиться, что Git его не видит.
3. Запустить пайплайн.
```

```bash solution
cd ~/ci-secret
echo 'DEPLOY_TOKEN: tok-9f3a7c21' > .gitlab-ci-local-variables.yml
echo '.gitlab-ci-local-variables.yml' >> .gitignore
git status --short
gitlab-ci-local
```

```text review
Эталон: значение — в «настройках проекта» (здесь `.gitlab-ci-local-variables.yml`), файл — в `.gitignore`.

- В GitLab: Settings → CI/CD → Variables. Флаги: **Masked** — значение заменяется `[MASKED]` в логах, **Protected** — доступно только пайплайнам защищённых веток и тегов (feature-ветка не украдёт прод-токен), **Type: File** — значение пишется во временный файл (SSH-ключи, kubeconfig).
- Секрет в `.gitlab-ci.yml` = секрет навсегда в истории Git и у всех, у кого есть доступ к репозиторию.
- Masked не спасает от `echo $TOKEN | base64` — защита от случайной утечки, не от злого умысла.
- Ещё лучше — не хранить долгоживущие токены вообще: OIDC (`id_tokens`) для облаков и Vault (тема «HashiCorp Vault»).
```

### Кэш зависимостей

Задача `install` в `~/ci-cache` ставит зависимости через pip. Настройте для неё **кэш** pip: каталог кэша — внутри проекта (`.cache/pip`, через переменную `PIP_CACHE_DIR`), а **ключ** кэша зависит от содержимого `requirements.txt` — изменились зависимости, кэш создаётся заново.

```bash setup
d=/home/student/ci-cache
lab_ci_repo $d
echo '# зависимости (для учебного примера список пуст)' > $d/requirements.txt
cat > $d/.gitlab-ci.yml <<'EOF'
stages: [install]

install:
  stage: install
  script:
    - python3 -m venv .venv
    - .venv/bin/pip install -r requirements.txt
EOF
printf '.gitlab-ci-local/\n.venv/\n.cache/\n' > $d/.gitignore
lab_ci_commit $d
```

```bash check
d=/home/student/ci-cache
p=$(lab_ci_preview $d); [ -n "$p" ] && [ "$p" != null ] || fail "gitlab-ci-local не может разобрать .gitlab-ci.yml"
echo "$p" | jq -e '.install.cache' >/dev/null || echo "$p" | jq -e '.default.cache' >/dev/null || fail "У задачи install нет кэша"
c=$(echo "$p" | jq -c '.install.cache // .default.cache | if type == "array" then .[0] else . end')
echo "$c" | jq -e '.paths | map(test("^\\.cache/pip/?$")) | any' >/dev/null || fail "Кэшируется не каталог .cache/pip: $c"
echo "$c" | jq -e '.key.files | index("requirements.txt")' >/dev/null || fail "Ключ кэша не зависит от requirements.txt: $(echo "$c" | jq -c .key)"
v=$(echo "$p" | jq -r '.install.variables.PIP_CACHE_DIR // .variables.PIP_CACHE_DIR // empty')
echo "$v" | grep -qE '^\$\{?CI_PROJECT_DIR\}?/\.cache/pip/?$' || fail "PIP_CACHE_DIR не указывает на .cache/pip в каталоге проекта: «$v»"
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log)"
ok "кэш: $(echo "$c" | jq -c '{key, paths}')"
```

```text hint
1. Переменная окружения для pip задаётся в разделе переменных — глобально или у задачи; путь к проекту в раннере — готовая переменная GitLab.
2. У кэша: список путей и ключ. Ключ можно вычислять из содержимого файлов — для этого у ключа есть вложенный параметр со списком файлов.
```

```bash solution
cat > ~/ci-cache/.gitlab-ci.yml <<'EOF'
stages: [install]

variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"

install:
  stage: install
  cache:
    key:
      files: [requirements.txt]
    paths: [.cache/pip/]
  script:
    - python3 -m venv .venv
    - .venv/bin/pip install -r requirements.txt
EOF
cd ~/ci-cache && gitlab-ci-local
```

```text review
Эталон: `variables: PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"` + `cache: key: files: [requirements.txt], paths: [.cache/pip/]`.

- Кэшировать можно только каталоги **внутри** проекта — поэтому pip/npm/maven перенаправляют туда переменными (`npm_config_cache`, `MAVEN_OPTS=-Dmaven.repo.local=...`).
- `key: files:` — ключ = хеш lock-файла: пока зависимости те же, кэш общий для всех веток и пайплайнов; изменили `requirements.txt` / `package-lock.json` — кэш новый.
- `policy: pull` у задач, которые только читают кэш, — экономит время на загрузку обратно.
- Кэш — ускоритель, не гарантия: задача должна работать и без него.
```

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
