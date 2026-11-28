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

## Лаборатория

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

### Пайплайн от линтера до проверки после деплоя

В `~/ci-deploy` — приложение (`app.py`, тесты `test_app.py`, `Dockerfile`), в `~/ci-target/compose.yaml` — описание «прод-сервера»: контейнер `ci-deploy-app` из образа `ci-deploy-app:${APP_TAG}` на порту **8188**. Напишите `.gitlab-ci.yml`, который выполняется через `gitlab-ci-local` (задачи — прямо на стенде, Docker доступен):

1. **lint** — проверка Dockerfile линтером hadolint (`docker run --rm -i hadolint/hadolint:v2.12.0 < Dockerfile`);
2. **test** — модульные тесты;
3. **build** — образ `ci-deploy-app` с тегом **короткого SHA коммита**; версию (тот же SHA) передать в образ аргументом сборки `APP_VERSION`;
4. **deploy** — запуск `~/ci-target/compose.yaml` с `APP_TAG` = SHA коммита;
5. **verify** — проверка `http://localhost:8188/health` с повторами; если приложение не ответило — пайплайн **падает**.

После пайплайна на `localhost:8188` работает версия, равная SHA последнего коммита.

```bash setup
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
lab_img python:3.12-slim hadolint/hadolint:v2.12.0
docker rm -f ci-deploy-app >/dev/null 2>&1
d=/home/student/ci-deploy
lab_ci_repo $d
cat > $d/app.py <<'EOF'
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

VERSION = os.environ.get("APP_VERSION", "dev")

def greeting(name):
    return f"hello, {name}"

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"ok" if self.path == "/health" else f"version {VERSION}".encode()
        self.send_response(200); self.end_headers(); self.wfile.write(body)

if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
EOF
cat > $d/test_app.py <<'EOF'
import unittest
from app import greeting
class TestGreeting(unittest.TestCase):
    def test_greeting(self):
        self.assertEqual(greeting("ci"), "hello, ci")
EOF
cat > $d/Dockerfile <<'EOF'
FROM python:3.12-slim
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
WORKDIR /app
COPY app.py .
USER 10001
EXPOSE 8000
CMD ["python3", "app.py"]
EOF
printf '.gitlab-ci-local/\n__pycache__/\n' > $d/.gitignore
lab_ci_commit $d
mkdir -p /home/student/ci-target
cat > /home/student/ci-target/compose.yaml <<'EOF'
services:
  app:
    image: ci-deploy-app:${APP_TAG:?нужна переменная APP_TAG}
    container_name: ci-deploy-app
    ports:
      - "8188:8000"
    restart: unless-stopped
EOF
chown -R student:student /home/student/ci-target
```

```bash check
d=/home/student/ci-deploy
[ -f $d/.gitlab-ci.yml ] || fail "Нет ~/ci-deploy/.gitlab-ci.yml"
p=$(lab_ci_preview $d); [ -n "$p" ] && [ "$p" != null ] || fail "gitlab-ci-local не может разобрать .gitlab-ci.yml"
st=$(echo "$p" | jq -r '[.stages[] | select(startswith(".") | not)] | join(" ")')
[ "$st" = "lint test build deploy verify" ] || fail "Этапы: «$st» — нужны lint, test, build, deploy, verify по порядку"
scripts=$(echo "$p" | jq -r '[to_entries[] | select(.value | type == "object" and has("script")) | .value.script[]] | join("\n")')
echo "$scripts" | grep -q hadolint || fail "В пайплайне нет проверки Dockerfile через hadolint"
echo "$scripts" | grep -qE 'CI_COMMIT_SHORT_SHA' || fail "Образ не тегируется SHA коммита"
docker rm -f ci-deploy-app >/dev/null 2>&1
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log)"
sha=$(su - student -c "cd $d && git rev-parse --short=8 HEAD")
img=$(docker inspect -f '{{.Config.Image}}' ci-deploy-app 2>/dev/null) || fail "После пайплайна контейнер ci-deploy-app не запущен"
[ "$img" = "ci-deploy-app:$sha" ] || fail "Запущен образ «$img», а нужен ci-deploy-app:$sha"
r=$(curl -s --max-time 3 localhost:8188/)
[ "$r" = "version $sha" ] || fail "localhost:8188 отвечает «$r» — версия в образ не передана"
# верификация должна ловить сломанный деплой
docker rm -f ci-deploy-app >/dev/null 2>&1
lab_ci_run $d verify && fail "Задача verify проходит, когда приложение не запущено, — она не проверяет деплой"
su - student -c "cd ~/ci-target && APP_TAG=$sha docker compose up -d" >/dev/null 2>&1
ok "пайплайн выкатил ci-deploy-app:$sha, verify ловит неработающее приложение"
```

```text hint
1. Пять этапов по порядку и по задаче в каждом.
2. Линтеру Dockerfile передаётся на стандартный ввод. Тесты — модуль unittest.
3. Сборка: тег образа и аргумент сборки из готовой переменной с коротким SHA коммита.
4. Деплой: переменная окружения с тегом и запуск compose-файла сервера в фоне.
5. Проверка: curl с флагом «падать при HTTP-ошибке», повторами и паузой между ними. Пока контейнер стартует, соединение то отклоняется, то сбрасывается — повторять нужно при любой ошибке, а не только при отказе.
```

```bash solution
cat > ~/ci-deploy/.gitlab-ci.yml <<'EOF'
stages: [lint, test, build, deploy, verify]

lint:
  stage: lint
  script:
    - docker run --rm -i hadolint/hadolint:v2.12.0 < Dockerfile

test:
  stage: test
  script:
    - python3 -m unittest -v test_app

build:
  stage: build
  script:
    - docker build -t ci-deploy-app:$CI_COMMIT_SHORT_SHA --build-arg APP_VERSION=$CI_COMMIT_SHORT_SHA .

deploy:
  stage: deploy
  script:
    - APP_TAG=$CI_COMMIT_SHORT_SHA docker compose -f $HOME/ci-target/compose.yaml up -d

verify:
  stage: verify
  script:
    - curl -fsS --retry 10 --retry-delay 1 --retry-all-errors http://localhost:8188/health
    - curl -fsS http://localhost:8188/
EOF
cd ~/ci-deploy && gitlab-ci-local
```

```text review
Эталон — в «Решении».

- Порядок — **fail fast**: дешёвые проверки (линтер, тесты) до дорогой сборки; деплой — только проверенного образа.
- Тег = SHA коммита: по запущенному контейнеру видно, какой код в проде, и откат — это деплой предыдущего SHA. `latest` так не умеет.
- **verify после деплоя** — без него «пайплайн зелёный, а прод лежит». `curl -f` превращает HTTP 4xx/5xx в ошибку, `--retry-all-errors` — повторяет и при сброшенном соединении (Docker-прокси принимает его раньше, чем готово приложение), `--retry-connrefused` ловит только отказ.
- На настоящем GitLab образ пушат в реестр (`$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA`), а деплой идёт на удалённый сервер по SSH с ключом из переменной типа File, или через `kubectl`/Helm/Argo CD.
- Следующий шаг — `environment: production` у deploy: в GitLab появится история деплоев и кнопка Re-deploy для отката.
```

```text notes
:latest\b => Образ тегировался latest — по нему не понять, какой код в проде, и не откатиться. Тег — SHA коммита.
```

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
