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

## Лаборатория

GitLab-сервера на стенде нет, но есть **`gitlab-ci-local`** — он выполняет `.gitlab-ci.yml` прямо в репозитории, как раннер с shell executor: этапы, `needs`, `rules`, артефакты. Запуск всего пайплайна — `gitlab-ci-local`, одной задачи — `gitlab-ci-local <задача>`, список задач — `gitlab-ci-local --list`.

В `~/ci-basics` — проект: `app.py` (утилита с функцией `add` и ключом `--version`) и тесты `test_app.py` (`python3 -m unittest test_app`).

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
d=/home/student/ci-basics
lab_ci_base() {
  lab_ci_repo $d
  cat > $d/app.py <<'EOF'
import sys
VERSION = "1.0.0"
def add(a, b):
    return a + b
if __name__ == "__main__":
    if "--version" in sys.argv:
        print(VERSION)
    else:
        print(add(2, 3))
EOF
  cat > $d/test_app.py <<'EOF'
import unittest
from app import add
class TestAdd(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(2, 3), 5)
EOF
  printf '.gitlab-ci-local/\n__pycache__/\ndist/\n' > $d/.gitignore
}
lab_ci_base_pipeline() {
  cat > $d/.gitlab-ci.yml <<'EOF'
stages: [lint, test, build]

lint:
  stage: lint
  script:
    - python3 -m py_compile app.py

unit:
  stage: test
  script:
    - python3 -m unittest -v test_app

smoke:
  stage: test
  script:
    - python3 app.py --version

build:
  stage: build
  script:
    - mkdir -p dist
    - tar -czf dist/app.tar.gz app.py
  artifacts:
    paths: [dist/]
EOF
}
```

```bash setup
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
```

### Первый пайплайн

Напишите `~/ci-basics/.gitlab-ci.yml` из трёх этапов по порядку — **lint**, **test**, **build**:

- в **lint** — задача, проверяющая, что `app.py` компилируется (`python3 -m py_compile app.py`);
- в **test** — **две** задачи, которые выполняются параллельно: модульные тесты и проверка запуска `python3 app.py --version`;
- в **build** — задача, которая упаковывает `app.py` в `dist/app.tar.gz` и сохраняет каталог `dist/` как **артефакт**.

Пайплайн должен проходить: `gitlab-ci-local` в каталоге проекта.

```bash setup
lab_ci_base
lab_ci_commit $d
```

```bash check
[ -f $d/.gitlab-ci.yml ] || fail "Нет ~/ci-basics/.gitlab-ci.yml"
p=$(lab_ci_preview $d) && [ -n "$p" ] && [ "$p" != null ] || fail "gitlab-ci-local не может разобрать .gitlab-ci.yml"
echo "$p" | python3 -c '
import json, sys
p = json.load(sys.stdin)
st = [s for s in p.get("stages", []) if not s.startswith(".")]
def fail(m): print("✗ " + m); sys.exit(1)
if [s for s in st if s in ("lint", "test", "build")] != ["lint", "test", "build"]: fail(f"Этапы не lint → test → build: {st}")
jobs = {k: v for k, v in p.items() if isinstance(v, dict) and "script" in v and not k.startswith(".")}
by = {}
for k, v in jobs.items(): by.setdefault(v.get("stage", "test"), []).append(k)
if not by.get("lint"): fail("В этапе lint нет задач")
n_test = len(by.get("test", []))
if n_test < 2: fail(f"В этапе test задач: {n_test}")
b = [jobs[k] for k in by.get("build", [])]
if not b: fail("В этапе build нет задач")
if not any("dist" in str(j.get("artifacts", {}).get("paths", [])) for j in b): fail("Задача сборки не сохраняет dist/ как артефакт")
' || exit 1
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log)"
f=$(find $d/.gitlab-ci-local/artifacts -path '*dist/app.tar.gz' 2>/dev/null | head -1)
[ -n "$f" ] && tar -tzf "$f" | grep -qx app.py || fail "Пайплайн прошёл, но артефакта dist/app.tar.gz с app.py нет"
ok "пайплайн прошёл: $(sed 's/\x1b\[[0-9;]*m//g' /tmp/lab-ci.log | grep -E '^ *PASS' | awk '{print $2}' | xargs)"
```

```text hint
1. В начале файла — список этапов по порядку.
2. Каждая задача — ключ верхнего уровня с именем, внутри — этап и список команд. Задачи одного этапа выполняются параллельно, этапы — по очереди.
3. У задачи сборки — раздел артефактов со списком путей.
4. Запустить пайплайн локально и посмотреть итог по задачам.
```

```bash solution
cat > ~/ci-basics/.gitlab-ci.yml <<'EOF'
stages: [lint, test, build]

lint:
  stage: lint
  script:
    - python3 -m py_compile app.py

unit:
  stage: test
  script:
    - python3 -m unittest -v test_app

smoke:
  stage: test
  script:
    - python3 app.py --version

build:
  stage: build
  script:
    - mkdir -p dist
    - tar -czf dist/app.tar.gz app.py
  artifacts:
    paths: [dist/]
    expire_in: 1 week
EOF
cd ~/ci-basics && gitlab-ci-local
```

```text review
Эталон — в «Решении».

- Этапы идут по очереди, задачи одного этапа — параллельно (если хватает раннеров). Упала задача — следующие этапы не запускаются: **fail fast** — быстрые проверки (lint) ставят первыми.
- Артефакты — файлы, которые GitLab сохраняет после задачи и отдаёт задачам следующих этапов (и для скачивания в интерфейсе). `expire_in` — чтобы не копить их вечно.
- На настоящем GitLab тот же файл в корне репозитория запускает пайплайн на каждый push. Проверить синтаксис до коммита — CI Lint в интерфейсе (Build → Pipeline editor) или `gitlab-ci-local --preview`.
- В задачах без `image:` раннер с docker executor берёт образ по умолчанию; хорошая практика — явно указывать `image: python:3.12-slim`.
```

### Деплой только из main

В `~/ci-basics` уже есть пайплайн lint → test → build. Добавьте этап **deploy** с двумя задачами:

- **`deploy-staging`** — выполняется **автоматически**, но **только** в ветке `main`;
- **`deploy-production`** — тоже только в `main`, но запускается **вручную**.

В любой другой ветке этих задач в пайплайне быть не должно. Скрипты деплоя — просто `echo` с названием окружения.

```bash setup
lab_ci_base
lab_ci_base_pipeline
lab_ci_commit $d
```

```bash check
m=$(lab_ci_jobs $d) || true
[ -n "$m" ] || fail "gitlab-ci-local не может разобрать .gitlab-ci.yml"
w() { echo "$1" | jq -r --arg n "$2" '[.[] | select(.name == $n) | .when][0] // "нет"'; }
[ "$(w "$m" deploy-staging)" = on_success ] || fail "В main задача deploy-staging: «$(w "$m" deploy-staging)» — должна выполняться автоматически"
[ "$(w "$m" deploy-production)" = manual ] || fail "В main задача deploy-production: «$(w "$m" deploy-production)» — должна запускаться вручную"
[ "$(echo "$m" | jq -r '[.[] | select(.name == "deploy-staging") | .stage][0]')" = deploy ] || fail "deploy-staging не в этапе deploy"
f=$(lab_ci_jobs $d feature/login)
[ -n "$f" ] || fail "Не удалось получить список задач для другой ветки"
for j in deploy-staging deploy-production; do
  x=$(w "$f" $j); [ "$x" = нет ] || [ "$x" = never ] || fail "В ветке feature/login задача $j есть в пайплайне (when: $x)"
done
lab_ci_run $d || fail "Пайплайн в main не проходит: $(lab_ci_log)"
ok "main: staging — автоматически, production — вручную; в других ветках деплоя нет"
```

```text hint
1. Добавить этап в список этапов.
2. Условия запуска задачи задаются списком правил: условие на переменную с именем текущей ветки, и для правила можно указать способ запуска «вручную».
3. Если ни одно правило не подошло, задача в пайплайн не попадает.
4. Проверить список задач в main и в новой ветке (создайте её и снова выведите список).
```

```bash solution
cd ~/ci-basics
sed -i 's/^stages: \[lint, test, build\]$/stages: [lint, test, build, deploy]/' .gitlab-ci.yml
cat >> .gitlab-ci.yml <<'EOF'

deploy-staging:
  stage: deploy
  script:
    - echo "deploy to staging"
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

deploy-production:
  stage: deploy
  script:
    - echo "deploy to production"
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: manual
EOF
gitlab-ci-local --list
```

```text review
Эталон: `rules: - if: $CI_COMMIT_BRANCH == "main"` (для прода — `when: manual`).

- `rules` проверяются сверху вниз до первого совпадения; не совпало ни одно — задачи нет. Часто последним правилом пишут `- when: never` для наглядности.
- Старые `only:`/`except:` устарели — в новых пайплайнах только `rules`.
- `when: manual` — кнопка «Play» в интерфейсе. Для прода добавляют `environment: production` и защиту окружения (deploy только от определённых людей).
- Полезные переменные: `$CI_COMMIT_BRANCH`, `$CI_COMMIT_TAG` (деплой по тегу релиза), `$CI_PIPELINE_SOURCE` (`push`, `merge_request_event`, `schedule`), `$CI_DEFAULT_BRANCH` (вместо хардкода `main`).
```

```text notes
\bonly:|\bexcept: => Использовались only/except — они устарели, в новых пайплайнах — rules.
```

### Экспериментальная задача не должна ронять пайплайн

Команда добавила экспериментальные тесты `test_experimental.py` — они пока падают. Добавьте в этап **test** задачу **`experimental`**, которая их запускает (`python3 -m unittest test_experimental`). Её падение **не должно** валить пайплайн, а падение обычных тестов — **должно**, как и раньше.

```bash setup
lab_ci_base
lab_ci_base_pipeline
cat > $d/test_experimental.py <<'EOF'
import unittest
from app import add
class TestExperimental(unittest.TestCase):
    def test_add_strings(self):
        self.assertEqual(add("2", "3"), 5)
EOF
lab_ci_commit $d
```

```bash check
m=$(lab_ci_jobs $d); [ -n "$m" ] || fail "gitlab-ci-local не может разобрать .gitlab-ci.yml"
[ "$(echo "$m" | jq -r '[.[] | select(.name == "experimental") | .stage][0]')" = test ] || fail "Задачи experimental в этапе test нет"
[ "$(echo "$m" | jq -r '[.[] | select(.name == "experimental") | .allow_failure][0]')" = true ] || fail "Падение experimental сейчас валит пайплайн"
others=$(echo "$m" | jq -r '[.[] | select(.name != "experimental" and .allow_failure == true) | .name] | join(", ")')
[ -z "$others" ] || fail "Падение разрешено и другим задачам: $others"
grep -q test_experimental $d/.gitlab-ci.yml || fail "Задача experimental не запускает test_experimental"
lab_ci_run $d || fail "Пайплайн падает: $(lab_ci_log)"
sed 's/\x1b\[[0-9;]*m//g' /tmp/lab-ci.log | grep -qE 'WARN +experimental' || fail "Задача experimental не выполнилась или не упала — она должна запускать падающие тесты"
ok "experimental падает с предупреждением, пайплайн проходит"
```

```text hint
1. Добавить задачу в этап тестов с запуском нужного модуля.
2. У задачи есть параметр, разрешающий ей падать: пайплайн отметит её предупреждением и пойдёт дальше.
3. Запустить пайплайн и посмотреть статус задачи в итоге.
```

```bash solution
cd ~/ci-basics
cat >> .gitlab-ci.yml <<'EOF'

experimental:
  stage: test
  script:
    - python3 -m unittest -v test_experimental
  allow_failure: true
EOF
gitlab-ci-local | tail -8
```

```text review
Эталон: `allow_failure: true`.

- В интерфейсе GitLab такая задача — оранжевая с восклицательным знаком, пайплайн — «passed with warnings».
- `allow_failure: exit_codes: [42]` — разрешать только конкретный код выхода (например, «нашлись предупреждения линтера», но не «линтер сломался»).
- Не злоупотребляйте: задача, которой всегда разрешено падать, скоро начнёт падать всегда, и никто не заметит. Временный флаг — с задачей в трекере, когда его снять.
- Manual-задачи по умолчанию тоже `allow_failure: true` — иначе пайплайн «висел» бы в ожидании кнопки.
```

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
