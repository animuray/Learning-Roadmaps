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

## Лаборатория

Пайплайны выполняются локально через `gitlab-ci-local`; итоговый YAML после `extends`, `include` и `default` показывает `gitlab-ci-local --preview`.

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

### Граф вместо этапов

В монорепозитории `~/ci-mono` два сервиса — `api` и `web`. Сейчас тест `web` ждёт сборки `api`, хотя они не связаны. Перепишите пайплайн через **`needs`**:

- `build-api` и `build-web` — этап build;
- `test-api` зависит **только** от `build-api`, `test-web` — **только** от `build-web`;
- `deploy` — после **обоих** тестов.

```bash setup
d=/home/student/ci-mono
lab_ci_repo $d
mkdir -p $d/api $d/web
echo 'print("api")' > $d/api/main.py; echo 'print("web")' > $d/web/main.py
cat > $d/.gitlab-ci.yml <<'EOF'
stages: [build, test, deploy]

build-api:
  stage: build
  script: [echo "build api"]
build-web:
  stage: build
  script: [echo "build web"]
test-api:
  stage: test
  script: [python3 api/main.py]
test-web:
  stage: test
  script: [python3 web/main.py]
deploy:
  stage: deploy
  script: [echo "deploy all"]
EOF
printf '.gitlab-ci-local/\n' > $d/.gitignore
lab_ci_commit $d
```

```bash check
d=/home/student/ci-mono
p=$(lab_ci_preview $d); [ -n "$p" ] && [ "$p" != null ] || fail "gitlab-ci-local не может разобрать .gitlab-ci.yml"
n() { echo "$p" | jq -c --arg j "$1" '[.[$j].needs // [] | .[] | if type == "string" then . else .job end] | sort'; }
[ "$(n test-api)" = '["build-api"]' ] || fail "test-api зависит от: $(n test-api)"
[ "$(n test-web)" = '["build-web"]' ] || fail "test-web зависит от: $(n test-web)"
[ "$(n deploy)" = '["test-api","test-web"]' ] || fail "deploy зависит от: $(n deploy)"
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log)"
ok "граф: build-api → test-api, build-web → test-web, оба → deploy"
```

```text hint
1. У задачи есть параметр со списком задач, после которых её можно запускать, — не дожидаясь окончания всего предыдущего этапа.
2. Задать его тестам и деплою. Этапы можно оставить — они нужны для отображения.
```

```bash solution
cd ~/ci-mono
cat > .gitlab-ci.yml <<'EOF'
stages: [build, test, deploy]

build-api:
  stage: build
  script: [echo "build api"]
build-web:
  stage: build
  script: [echo "build web"]
test-api:
  stage: test
  needs: [build-api]
  script: [python3 api/main.py]
test-web:
  stage: test
  needs: [build-web]
  script: [python3 web/main.py]
deploy:
  stage: deploy
  needs: [test-api, test-web]
  script: [echo "deploy all"]
EOF
gitlab-ci-local --list
```

```text review
Эталон: `needs:` у тестов и деплоя.

- `needs` превращает пайплайн в граф (DAG): задача стартует, как только готовы её зависимости. Медленная сборка web больше не задерживает тесты api.
- `needs: []` — стартовать сразу, в первую очередь (линтеры).
- С `needs` задача получает артефакты **только** перечисленных задач — ещё и экономия времени на скачивание.
- В монорепо дальше: `rules: changes: [api/**/*]` — не запускать задачи сервиса, если его код не менялся, или дочерние пайплайны (`trigger: include:`) на каждый сервис.
```

### Общий шаблон через extends

В `~/ci-tpl` три задачи на Python повторяют одинаковые `image`, `before_script` и переменные. Вынесите общее в **скрытую задачу** `.python-base` и подключите её через **`extends`** во все три задачи. У задачи `coverage` должна остаться **своя** переменная `COVERAGE_MIN: "80"` **вместе** с общими.

```bash setup
d=/home/student/ci-tpl
lab_ci_repo $d
echo 'print("ok")' > $d/app.py
cat > $d/.gitlab-ci.yml <<'EOF'
stages: [test]

lint:
  stage: test
  image: python:3.12-slim
  variables:
    PYTHONDONTWRITEBYTECODE: "1"
    PIP_DISABLE_PIP_VERSION_CHECK: "1"
  before_script:
    - python3 --version
  script:
    - python3 -m py_compile app.py

unit:
  stage: test
  image: python:3.12-slim
  variables:
    PYTHONDONTWRITEBYTECODE: "1"
    PIP_DISABLE_PIP_VERSION_CHECK: "1"
  before_script:
    - python3 --version
  script:
    - python3 app.py

coverage:
  stage: test
  image: python:3.12-slim
  variables:
    PYTHONDONTWRITEBYTECODE: "1"
    PIP_DISABLE_PIP_VERSION_CHECK: "1"
    COVERAGE_MIN: "80"
  before_script:
    - python3 --version
  script:
    - echo "coverage must be >= $COVERAGE_MIN"
EOF
printf '.gitlab-ci-local/\n' > $d/.gitignore
lab_ci_commit $d
```

```bash check
d=/home/student/ci-tpl
f=$d/.gitlab-ci.yml
grep -qE '^\.python-base:' $f || fail "Нет скрытой задачи .python-base"
[ "$(grep -c 'python:3.12-slim' $f)" = 1 ] || fail "Образ python:3.12-slim всё ещё повторяется ($(grep -c 'python:3.12-slim' $f) раза)"
[ "$(grep -c 'PIP_DISABLE_PIP_VERSION_CHECK' $f)" = 1 ] || fail "Общие переменные всё ещё повторяются"
p=$(lab_ci_preview $d); [ -n "$p" ] && [ "$p" != null ] || fail "gitlab-ci-local не может разобрать .gitlab-ci.yml"
for j in lint unit coverage; do
  [ "$(echo "$p" | jq -r --arg j $j '.[$j].image | if type == "object" then .name else . end')" = python:3.12-slim ] || fail "У $j после extends нет образа python:3.12-slim"
  echo "$p" | jq -e --arg j $j '.[$j].before_script | index("python3 --version")' >/dev/null || fail "У $j после extends нет общего before_script"
  [ "$(echo "$p" | jq -r --arg j $j '.[$j].variables.PYTHONDONTWRITEBYTECODE')" = 1 ] || fail "У $j после extends нет общих переменных"
done
[ "$(echo "$p" | jq -r '.coverage.variables.COVERAGE_MIN')" = 80 ] || fail "У coverage пропала своя переменная COVERAGE_MIN"
[ "$(echo "$p" | jq -r '.coverage.variables.PIP_DISABLE_PIP_VERSION_CHECK')" = 1 ] || fail "У coverage свои переменные заменили общие, а не дополнили"
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log)"
ok "три задачи наследуют .python-base, у coverage — свои + общие переменные"
```

```text hint
1. Задача, имя которой начинается с точки, не запускается — это шаблон.
2. Перенести в шаблон образ, переменные и подготовительные команды; в задачах оставить этап, свои команды и ссылку на шаблон.
3. Посмотреть итоговый YAML: словари при наследовании сливаются, а списки команд — заменяются.
```

```bash solution
cat > ~/ci-tpl/.gitlab-ci.yml <<'EOF'
stages: [test]

.python-base:
  image: python:3.12-slim
  variables:
    PYTHONDONTWRITEBYTECODE: "1"
    PIP_DISABLE_PIP_VERSION_CHECK: "1"
  before_script:
    - python3 --version

lint:
  extends: .python-base
  stage: test
  script:
    - python3 -m py_compile app.py

unit:
  extends: .python-base
  stage: test
  script:
    - python3 app.py

coverage:
  extends: .python-base
  stage: test
  variables:
    COVERAGE_MIN: "80"
  script:
    - echo "coverage must be >= $COVERAGE_MIN"
EOF
cd ~/ci-tpl && gitlab-ci-local --preview | sed -n '/^coverage:/,$p'
```

```text review
Эталон: скрытая `.python-base` + `extends: .python-base`.

- `extends` сливает словари рекурсивно (variables объединяются), а **списки заменяет** целиком: свой `before_script` в задаче выкинет шаблонный. Нужно и то и другое — `!reference [.python-base, before_script]`.
- YAML-якоря (`<<: *base`) работают только в одном файле; `extends` — и через `include`, поэтому шаблоны в общем репозитории делают на `extends`.
- Итоговый результат всегда смотрите через CI Lint → View merged YAML (здесь — `gitlab-ci-local --preview`).
```

### Матрица версий

Добавьте в `~/ci-matrix` задачу **`test`**, которая запускается на **трёх версиях Python** — `3.11`, `3.12` и `3.13` — через **`parallel: matrix`** с переменной `PYTHON_VERSION`. Скрипт задачи — просто `echo "testing on $PYTHON_VERSION"`.

```bash setup
d=/home/student/ci-matrix
lab_ci_repo $d
printf 'stages: [test]\n' > $d/.gitlab-ci.yml
printf '.gitlab-ci-local/\n' > $d/.gitignore
lab_ci_commit $d
```

```bash check
d=/home/student/ci-matrix
m=$(lab_ci_jobs $d); [ -n "$m" ] || fail "gitlab-ci-local не может разобрать .gitlab-ci.yml"
names=$(echo "$m" | jq -r '[.[] | select(.name | startswith("test")) | .name] | sort | join(", ")')
for v in 3.11 3.12 3.13; do echo "$names" | grep -q "\[$v\]" || fail "Нет задачи для Python $v (задачи: ${names:-нет})"; done
[ "$(echo "$m" | jq '[.[] | select(.name | startswith("test"))] | length')" = 3 ] || fail "Задач test должно быть ровно три: $names"
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log)"
for v in 3.11 3.12 3.13; do sed 's/\x1b\[[0-9;]*m//g' /tmp/lab-ci.log | grep -q "testing on $v" || fail "Задача для $v не получила свою переменную PYTHON_VERSION"; done
ok "матрица: $names"
```

```text hint
У задачи есть параметр параллельного запуска; его вариант «матрица» — список наборов переменных, где значение переменной может быть списком: на каждое значение создаётся своя копия задачи.
```

```bash solution
cat >> ~/ci-matrix/.gitlab-ci.yml <<'EOF'

test:
  stage: test
  parallel:
    matrix:
      - PYTHON_VERSION: ["3.11", "3.12", "3.13"]
  script:
    - echo "testing on $PYTHON_VERSION"
EOF
cd ~/ci-matrix && gitlab-ci-local --list
```

```text review
Эталон: `parallel: matrix: - PYTHON_VERSION: ["3.11", "3.12", "3.13"]`.

- На настоящем раннере обычно добавляют `image: python:$PYTHON_VERSION-slim` — каждая копия задачи в своей версии.
- Несколько переменных в одном наборе дают все сочетания: `OS: [ubuntu, alpine]` × `PY: [3.11, 3.12]` = 4 задачи.
- `needs` на матричную задачу — `needs: [{job: test, parallel: {matrix: [{PYTHON_VERSION: "3.12"}]}}]`.
- Версии в кавычках: `3.10` без кавычек YAML превратит в число 3.1.
```

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
