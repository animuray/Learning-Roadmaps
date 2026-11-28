---
title: GitHub Actions
slug: github-actions
description: CI/CD на GitHub — workflow, события, jobs и steps, готовые actions, матрицы, артефакты, секреты и окружения, условия и зависимости задач. Локальный запуск через act и проверка actionlint.
duration: 180
level: Средний
quizSize: 10
materials:
  - title: GitHub Docs — Understanding GitHub Actions
    url: https://docs.github.com/en/actions/about-github-actions/understanding-github-actions
    type: документация
  - title: GitHub Docs — Workflow syntax
    url: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
    type: документация
  - title: nektos/act — запуск workflow локально
    url: https://nektosact.com/
    type: документация
  - title: actionlint
    url: https://github.com/rhysd/actionlint
    type: инструмент
---

# GitHub Actions

GitHub Actions — встроенный в GitHub CI/CD. Идеи те же, что в GitLab CI (пайплайн из задач, артефакты, секреты, окружения), но синтаксис и словарь свои. Если вы знаете GitLab CI, здесь главное — сопоставить понятия.

## Словарь

| GitHub Actions | GitLab CI | Что это |
| --- | --- | --- |
| workflow (`.github/workflows/*.yml`) | pipeline (`.gitlab-ci.yml`) | весь процесс; файлов может быть много |
| `on:` | `rules`, `workflow:rules` | события запуска |
| job | job | задача на отдельной машине |
| step | строка `script` | шаг задачи: команда (`run`) или action (`uses`) |
| `needs:` | `stage` / `needs` | зависимости задач; без `needs` задачи идут **параллельно** |
| action (`uses: owner/repo@v4`) | `include` / шаблон | готовый переиспользуемый шаг |
| runner (`runs-on`) | runner + tags | где выполняется |
| secrets / vars | CI/CD Variables | секреты и обычные переменные |
| environment | environment | окружение с правилами защиты и своими секретами |

## Минимальный workflow

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4          # без него в задаче нет кода репозитория!
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - run: pytest -q
```

- Каждая job стартует на **чистой** машине: код нужно получить (`checkout`), зависимости — поставить.
- `run:` выполняется в bash (`set -e` включён): первая ошибка — задача падает.
- Многострочный `run: |` — несколько команд одним шагом.

## События

```yaml
on:
  push:
    branches: [main]
    tags: ["v*"]
    paths: ["src/**"]        # только если менялись эти файлы
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 3 * * *"      # по расписанию (UTC)
  workflow_dispatch:          # кнопка «Run workflow» с параметрами
```

## Контексты и выражения

`${{ ... }}` — выражение, вычисляется до запуска шага:

- `github.sha`, `github.ref` (`refs/heads/main`), `github.ref_name` (`main`), `github.event_name`, `github.actor`;
- `secrets.ИМЯ`, `vars.ИМЯ`, `env.ИМЯ`, `matrix.ИМЯ`, `needs.<job>.outputs.<имя>`;
- условие задачи или шага: `if: github.ref == 'refs/heads/main'`, `if: failure()`, `if: always()`.

В `run:` те же значения доступны и как переменные окружения: `$GITHUB_SHA`, `$GITHUB_REF_NAME`.

## Матрица

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        python: ["3.11", "3.12"]
        os-target: [linux, windows]
    steps:
      - run: echo "python ${{ matrix.python }} для ${{ matrix.os-target }}"
```

Одна job → по экземпляру на каждую комбинацию (здесь 4), параллельно.

## Артефакты и кэш

```yaml
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make dist
      - uses: actions/upload-artifact@v4
        with:
          name: app
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: app
          path: dist/
```

- Артефакт — результат для следующих задач и людей (как `artifacts` в GitLab).
- Кэш зависимостей — `actions/cache@v4` или встроенный в `setup-*` (`cache: pip`).
- Между jobs файлы **не переносятся сами**: только артефактами (или outputs для коротких значений).

## Секреты, окружения, права

```yaml
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production          # правила защиты: ревьюеры, ожидание, ветки
    permissions:
      contents: read
    steps:
      - run: ./deploy.sh
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

- Секреты задаются в Settings → Secrets and variables → Actions (уровень репозитория, окружения или организации). В журналах они маскируются `***`.
- Из **форков** pull request секретов не получает — иначе любой мог бы их украсть.
- `permissions:` урезает права встроенного `GITHUB_TOKEN` — по умолчанию лучше `contents: read`.
- В облако — без долгоживущих ключей: **OIDC** (`permissions: id-token: write` + роль в облаке).
- Версии actions закрепляют (`@v4`, а для сторонних — по SHA коммита): action — чужой код с доступом к вашим секретам.

## Раннеры

- `ubuntu-latest`, `windows-latest`, `macos-latest` — машины GitHub, минуты по тарифу.
- **Self-hosted** раннеры — свои серверы (`runs-on: [self-hosted, linux]`), как GitLab Runner. Не запускайте их для публичных репозиториев: код из чужого PR выполнится на вашем сервере.

## Локально: act и actionlint

```bash
actionlint                                   # проверка всех workflow: синтаксис, выражения, shellcheck в run
act -l                                       # какие jobs и для каких событий
act push                                     # запустить workflow события push
act push -P ubuntu-latest=-self-hosted       # без Docker-образа: шаги прямо на этой машине
act push --secret DEPLOY_TOKEN=... --var ENV=dev --artifact-server-path /tmp/art
```

`act` не полная копия GitHub (нет части контекстов, своя реализация артефактов), но ловит большинство ошибок до push.

## Практика

- [ ] Перенести пайплайн своего проекта из GitLab CI в GitHub Actions (или наоборот) и сравнить
- [ ] Добавить матрицу версий и кэш зависимостей
- [ ] Настроить окружение production с обязательным подтверждением и деплой только из main
- [ ] Включить actionlint в pre-commit или отдельной задачей CI
- [ ] Пройти задачи лаборатории

## Лаборатория

На стенде — `act` (локальный запуск workflow) и `actionlint`. Запуск без Docker-образа: `act push -P ubuntu-latest=-self-hosted` — шаги выполняются прямо на стенде от вашего пользователя.

```bash lib
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
# lab_gha_repo каталог — новый репозиторий ученика (файлы кладёт вызывающий), origin — на GitHub, как у настоящего проекта
lab_gha_repo() { rm -rf "$1"; mkdir -p "$1"; }
lab_gha_commit() { chown -R student:student "$1"; su - student -c "cd $1 && git init -q -b main && git remote add origin https://github.com/student/$(basename "$1").git && git add -A && git commit -qm 'Initial commit'"; }
# lab_act каталог аргументы — act от имени ученика; вывод — в /tmp/lab-act.log
lab_act() { su - student -c "cd $1 && timeout 50 act push -P ubuntu-latest=-self-hosted $2" > /tmp/lab-act.log 2>&1; }
lab_actlog() { sed 's/\x1b\[[0-9;]*m//g' /tmp/lab-act.log | grep -E '❌|Error|error|failed' | head -2 | tr '\n' ' ' | cut -c1-250; }
# lab_wf файл — workflow как JSON (ключ on — строкой, а не true)
lab_wf() { python3 -c 'import sys, yaml, json
class L(yaml.SafeLoader): pass
L.yaml_implicit_resolvers = {c: [(t, r) for t, r in v if t != "tag:yaml.org,2002:bool"] for c, v in yaml.SafeLoader.yaml_implicit_resolvers.items()}
print(json.dumps(yaml.load(open(sys.argv[1]), Loader=L)))' "$1" 2>/dev/null; }
```

### Первый workflow

В `~/gha-app` — проект с тестами `./test.sh`. Напишите workflow **`.github/workflows/ci.yml`** с именем `ci`:

- запускается на **push в ветку `main`** и на **любой pull request**;
- задача **`test`** на `ubuntu-latest`: получает код репозитория и запускает `./test.sh`.

Workflow должен проходить `actionlint` и успешно выполняться через `act push`.

```bash setup
d=/home/student/gha-app
lab_gha_repo $d
cat > $d/test.sh <<'EOF'
#!/bin/sh
[ -f app.sh ] || { echo "app.sh не найден — код репозитория не получен"; exit 1; }
echo "tests passed: 7"
EOF
printf '#!/bin/sh\necho app\n' > $d/app.sh
chmod +x $d/test.sh $d/app.sh
lab_gha_commit $d
```

```bash check
d=/home/student/gha-app
f=$d/.github/workflows/ci.yml
[ -f $f ] || fail "Нет ~/gha-app/.github/workflows/ci.yml"
l=$(su - student -c "cd $d && actionlint -no-color" 2>&1) || fail "actionlint находит ошибки: $(echo "$l" | head -2 | tr '\n' ' ' | cut -c1-250)"
w=$(lab_wf $f); [ -n "$w" ] || fail "ci.yml — не YAML"
[ "$(echo "$w" | jq -r .name)" = ci ] || fail "Имя workflow — $(echo "$w" | jq -r .name)"
echo "$w" | jq -e '.on | if type == "object" then has("push") and has("pull_request") elif type == "array" then index("push") and index("pull_request") else false end' >/dev/null || fail "Workflow запускается не на push и pull_request"
echo "$w" | jq -e '.on | type == "object" and (.push.branches // [] | index("main"))' >/dev/null || fail "Событие push не ограничено веткой main"
echo "$w" | jq -e '.on.pull_request.branches // null | . == null' >/dev/null || fail "pull_request ограничен ветками, а нужен любой"
echo "$w" | jq -e '.jobs.test' >/dev/null || fail "Нет задачи test"
[ "$(echo "$w" | jq -r '.jobs.test["runs-on"]')" = ubuntu-latest ] || fail "Задача test запускается не на ubuntu-latest"
su - student -c "cd $d && git add -A && git commit -qm 'CI' >/dev/null 2>&1"; true
lab_act $d "-W .github/workflows/ci.yml" || fail "act push завершается с ошибкой: $(lab_actlog)"
grep -q 'tests passed: 7' /tmp/lab-act.log || fail "В журнале задачи test нет результата ./test.sh"
ok "workflow ci: actionlint чист, act push — тесты прошли"
```

```text hint
1. Workflow — YAML-файл в каталоге workflow репозитория: имя, события, задачи.
2. События: push с фильтром по веткам и pull request без фильтра.
3. Задача: на какой машине выполняется и список шагов — первый шаг получает код готовым action, второй запускает тесты.
4. Проверить линтером, закоммитить и запустить локально.
```

```bash solution
mkdir -p ~/gha-app/.github/workflows
cat > ~/gha-app/.github/workflows/ci.yml <<'EOF'
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./test.sh
EOF
cd ~/gha-app
actionlint && echo "actionlint: ok"
git add -A && git commit -qm "CI"
act push -P ubuntu-latest=-self-hosted -W .github/workflows/ci.yml
```

```text review
Эталон — в «Решении»: `on: push: branches: [main]` + `pull_request:` + job `test` с `checkout` и `./test.sh`.

- Без `actions/checkout` в задаче нет кода — классическая ошибка первого workflow: «No such file or directory».
- `pull_request:` без фильтра — проверка любого PR; `push` только в `main` — чтобы не запускать задачи дважды (на push в ветку и на PR из неё).
- Защита ветки main (Settings → Branches → Require status checks) делает задачу `test` обязательной для мержа — так CI реально что-то защищает.
- `actionlint` проверяет не только YAML, но и выражения `${{ }}`, имена событий, `needs`, а команды в `run:` — через shellcheck.
```

### Сборка матрицей и деплой

В `~/gha-release` — проект: `./build.sh <платформа>` собирает `dist/app-<платформа>.txt`, `./deploy.sh` выкладывает содержимое `dist/` на «сервер» `~/gha-www/` (ему нужна переменная `DEPLOY_TOKEN`). Напишите workflow **`.github/workflows/release.yml`** (на push в `main`):

- задача **`build`** матрицей по платформам **`linux`** и **`windows`** собирает приложение и сохраняет каждую сборку **артефактом** `app-<платформа>`;
- задача **`deploy`** запускается **после всех сборок** и **только для ветки `main`**, получает обе сборки в `dist/` и запускает `./deploy.sh` с `DEPLOY_TOKEN` из **секрета** с тем же именем.

Проверка запустит `act` с секретом `DEPLOY_TOKEN` и сервером артефактов.

```bash setup
d=/home/student/gha-release
lab_gha_repo $d
rm -rf /home/student/gha-www /tmp/lab-gha-art
cat > $d/build.sh <<'EOF'
#!/bin/sh
set -e
[ -n "$1" ] || { echo "укажите платформу"; exit 1; }
mkdir -p dist
echo "app for $1, commit ${GITHUB_SHA:-local}" > "dist/app-$1.txt"
echo "built dist/app-$1.txt"
EOF
cat > $d/deploy.sh <<'EOF'
#!/bin/sh
set -e
[ -n "$DEPLOY_TOKEN" ] || { echo "DEPLOY_TOKEN не задан"; exit 1; }
[ "$(printf %s "$DEPLOY_TOKEN" | sha256sum | cut -c1-8)" = "$(printf %s tok-gha-42 | sha256sum | cut -c1-8)" ] || { echo "DEPLOY_TOKEN неверный"; exit 1; }
for p in linux windows; do [ -f "dist/app-$p.txt" ] || { echo "нет dist/app-$p.txt"; exit 1; }; done
mkdir -p "$HOME/gha-www"
cp dist/app-*.txt "$HOME/gha-www/"
echo "${GITHUB_SHA:-unknown}" > "$HOME/gha-www/version.txt"
echo "deployed ${GITHUB_SHA:-unknown}"
EOF
chmod +x $d/build.sh $d/deploy.sh
printf 'dist/\n' > $d/.gitignore
lab_gha_commit $d
```

```bash check
d=/home/student/gha-release
f=$d/.github/workflows/release.yml
[ -f $f ] || fail "Нет ~/gha-release/.github/workflows/release.yml"
grep -q 'tok-gha-42' $f && fail "Токен записан прямо в workflow"
l=$(su - student -c "cd $d && actionlint -no-color" 2>&1) || fail "actionlint находит ошибки: $(echo "$l" | head -2 | tr '\n' ' ' | cut -c1-250)"
w=$(lab_wf $f); [ -n "$w" ] || fail "release.yml — не YAML"
echo "$w" | jq -e '.jobs.build.strategy.matrix | [.. | strings] | index("linux") and index("windows")' >/dev/null || fail "У задачи build нет матрицы с linux и windows"
echo "$w" | jq -e '.jobs.deploy.needs | if type == "array" then index("build") else . == "build" end' >/dev/null || fail "Задача deploy не зависит от build"
echo "$w" | jq -r '.jobs.deploy.if // ""' | grep -qE "refs/heads/main|ref_name *== *'main'" || fail "Задача deploy не ограничена веткой main"
echo "$w" | jq -r '.jobs.deploy | tostring' | grep -q 'secrets.DEPLOY_TOKEN' || fail "Задача deploy не берёт DEPLOY_TOKEN из секретов"
su - student -c "cd $d && git add -A && git commit -qm 'Release workflow' >/dev/null 2>&1"; true
rm -rf /home/student/gha-www /tmp/lab-gha-art
lab_act $d "-W .github/workflows/release.yml --secret DEPLOY_TOKEN=tok-gha-42 --artifact-server-path /tmp/lab-gha-art" || fail "act push завершается с ошибкой: $(lab_actlog)"
for p in linux windows; do
  find /tmp/lab-gha-art -type d -name "app-$p" 2>/dev/null | grep -q . || fail "Нет артефакта app-$p"
  [ -f /home/student/gha-www/app-$p.txt ] || fail "На «сервере» нет app-$p.txt"
done
sha=$(su - student -c "cd $d && git rev-parse HEAD")
[ "$(cat /home/student/gha-www/version.txt 2>/dev/null)" = "$sha" ] || fail "На «сервере» версия не текущего коммита"
grep -q "commit $sha" /home/student/gha-www/app-linux.txt || fail "app-linux.txt собран не из текущего коммита"
ok "build (linux, windows) → артефакты → deploy из main с секретом: ${sha:0:7}"
```

```text hint
1. Задача сборки: стратегия с матрицей из двух значений; шаги — получить код, собрать для значения матрицы, сохранить результат готовым action под именем, в котором есть значение матрицы.
2. Задача деплоя: зависимость от сборки, условие на ветку, шаги — получить код, скачать артефакты по шаблону имени в один каталог, запустить деплой с переменной окружения из секретов.
3. Проверить линтером, закоммитить, запустить локально с секретом и каталогом для артефактов.
```

```bash solution
mkdir -p ~/gha-release/.github/workflows
cat > ~/gha-release/.github/workflows/release.yml <<'EOF'
name: release

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [linux, windows]
    steps:
      - uses: actions/checkout@v4
      - run: ./build.sh "${{ matrix.target }}"
      - uses: actions/upload-artifact@v4
        with:
          name: app-${{ matrix.target }}
          path: dist/

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          pattern: app-*
          path: dist/
          merge-multiple: true
      - run: ./deploy.sh
        env:
          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
EOF
cd ~/gha-release
actionlint && echo "actionlint: ok"
git add -A && git commit -qm "Release workflow"
act push -P ubuntu-latest=-self-hosted -W .github/workflows/release.yml --secret DEPLOY_TOKEN=tok-gha-42 --artifact-server-path /tmp/lab-gha-art
cat ~/gha-www/version.txt
```

```text review
Эталон — в «Решении»: матрица `target` + `upload-artifact` с именем `app-${{ matrix.target }}`, `deploy` с `needs: build`, `if: github.ref == 'refs/heads/main'`, `download-artifact` с `pattern` и `merge-multiple`.

- `needs: build` у задачи с матрицей ждёт **все** её экземпляры. Если одна платформа упала — деплоя не будет (и это правильно).
- Имена артефактов в v4 должны быть уникальны — поэтому в имени значение матрицы; `merge-multiple: true` складывает их в один каталог.
- Условие на ветку у deploy дублирует фильтр `on.push.branches` намеренно: если позже добавят `pull_request`, деплой из PR всё равно не запустится.
- Для продакшена — `environment: production` с обязательным подтверждением, а секрет `DEPLOY_TOKEN` — в этом окружении, а не в репозитории: тогда его не получит ни одна другая задача.
```

```text notes
echo\s+[^\n]*DEPLOY_TOKEN => Секрет выводили в журнал — GitHub маскирует известные секреты, но производные от них значения (base64, часть строки) утекут.
```

## Тест

### Где лежат workflow GitHub Actions?
- [ ] .github-ci.yml в корне
- [x] .github/workflows/*.yml
- [ ] .gitlab-ci.yml
- [ ] actions/ в корне
> Файлов может быть несколько — каждый отдельный workflow.

### Почему в задаче «нет файлов репозитория» (No such file or directory) на первом шаге run?
- [ ] Неверный runs-on
- [x] Не добавлен шаг actions/checkout — каждая задача стартует на чистой машине
- [ ] Не хватает прав GITHUB_TOKEN
- [ ] Файлы есть только в pull request
> Код получают явно в каждой задаче.

### Две задачи без needs. Как они выполнятся?
- [ ] Последовательно в порядке файла
- [x] Параллельно
- [ ] Только первая
- [ ] Это ошибка синтаксиса
> Порядок задаётся только через needs.

### Как запустить задачу только для ветки main?
- [ ] runs-on: main
- [x] if: github.ref == 'refs/heads/main'
- [ ] needs: main
- [ ] branches: main внутри задачи
> Ещё вариант — фильтр `on.push.branches`, но условие на задаче защищает и при добавлении других событий.

### Как передать файлы сборки из задачи build в задачу deploy?
- [ ] Они остаются на диске сами
- [x] Артефактами: upload-artifact в build и download-artifact в deploy
- [ ] Через переменные окружения
- [ ] Через secrets
> Задачи выполняются на разных машинах.

### Сколько экземпляров задачи создаст matrix с python: [3.11, 3.12] и target: [linux, windows]?
= 4
> Матрица — все комбинации значений.

### Получает ли pull request из форка секреты репозитория?
- [ ] Да, все
- [x] Нет — иначе автор форка мог бы их вывести
- [ ] Только secrets.GITHUB_TOKEN с полными правами
- [ ] Только если PR одобрен
> Для таких случаев есть отдельные события и правила, но по умолчанию секретов нет.

### Зачем в workflow указывать permissions: contents: read?
- [ ] Чтобы ускорить checkout
- [x] Чтобы урезать права встроенного GITHUB_TOKEN до минимально нужных
- [ ] Без этого не работает checkout
- [ ] Чтобы скрыть секреты
> Принцип наименьших привилегий: скомпрометированный шаг не сможет писать в репозиторий.

### Как деплоить в облако из GitHub Actions без долгоживущих ключей?
- [ ] Положить ключи в репозиторий
- [x] OIDC: permissions id-token: write и роль в облаке, доверяющая токену GitHub
- [ ] Через self-hosted раннер с ключами на диске
- [ ] Через переменные vars
> Облако выдаёт короткоживущие учётные данные под конкретный репозиторий и ветку.

### Чем опасен self-hosted раннер в публичном репозитории?
- [ ] Ничем
- [x] Код из чужого pull request выполнится на вашем сервере
- [ ] Он медленнее облачного
- [ ] Он не поддерживает Docker
> Self-hosted раннеры — для приватных репозиториев и доверенного кода.

### Почему сторонние actions закрепляют по SHA коммита, а не по тегу?
- [ ] Так быстрее
- [x] Тег можно перевесить на другой (вредоносный) коммит, SHA — нет
- [ ] Теги не поддерживаются
- [ ] Чтобы обойти кэш
> Action выполняется с доступом к секретам задачи.

### Какой утилитой проверить workflow на ошибки до push?
= actionlint
> Проверяет синтаксис, выражения и команды в run через shellcheck.

### Как запустить workflow события push локально?
= act push
= act
> act выполняет задачи в контейнерах или прямо на машине (-P …=-self-hosted).

### Какое значение у github.ref для ветки main?
- [ ] main
- [x] refs/heads/main
- [ ] origin/main
- [ ] heads/main
> Короткое имя — в github.ref_name.
