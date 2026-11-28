---
title: Сломанный сервер — CI-CD
slug: slomannyj-server-ci-cd
description: Сломанные пайплайны без подсказок в условии — пайплайн не создаётся из-за ошибок в .gitlab-ci.yml, деплой не запускается и уезжает без сборки. Читать ошибки линтера, правила и артефакты.
duration: 60
level: Практика
quizSize: 10
---

# Сломанный сервер — CI-CD

Пайплайн ломается двумя способами: GitLab вообще не может его создать (ошибка конфигурации — видно сразу), или пайплайн создаётся, но делает не то (задача пропущена, артефакт не доехал, деплой «зелёный», а на сервере пусто). Второе коварнее.

## Алгоритм «пайплайн не работает»

1. **Пайплайна нет или он с ошибкой yaml invalid** — открыть CI Lint (Build → Pipeline editor → Validate) или локально `gitlab-ci-local --preview`. Ошибки показываются **по одной** — чините и проверяйте снова.
2. **Задачи нет в пайплайне** — смотреть `rules`/`only`/`except` и для какой ветки/события создан пайплайн. Переменные в `if:` — `$CI_COMMIT_BRANCH`, `$CI_PIPELINE_SOURCE`, `$CI_DEFAULT_BRANCH`.
3. **Задача упала** — журнал задачи: первая красная строка, а не последняя.
4. **Задача зелёная, а результата нет** — что задача получила на вход: артефакты предыдущих этапов (`artifacts:paths`, `dependencies`, `needs`), переменные, рабочий каталог.
5. Итоговая конфигурация после `include`, `extends`, якорей — «Full configuration» в редакторе или `gitlab-ci-local --preview`.

## Частые ошибки конфигурации

| Сообщение | Причина |
| --- | --- |
| `chosen stage does not exist` | `stage:` задачи нет в списке `stages` |
| `script config should be a string or a nested array of strings` | строка скрипта с `: ` YAML прочитал как словарь — всю строку в кавычки |
| `job needs ... but it was not added to the pipeline` / `undefined need` | `needs` ссылается на несуществующую или не созданную задачу |
| `jobs config should contain at least one visible job` | все задачи скрыты (`.имя`) или отсечены `rules` |
| Задача молча отсутствует | `rules` не совпали: например, ветка переименована `master` → `main` |
| `No such file or directory` в deploy | артефакт не объявлен, путь не тот, `dependencies: []` |

## Практика

- [ ] Пройти задачи лаборатории, первые 10 минут без подсказки
- [ ] Для каждой записать: симптом → где увидели → причина → решение
- [ ] В своём проекте включить проверку `.gitlab-ci.yml` перед коммитом (pre-commit с линтером или `gitlab-ci-local --preview`)

## Лаборатория

```bash lib
# Пайплайны GitLab CI выполняются локально утилитой gitlab-ci-local (shell executor — задачи идут прямо на стенде)
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
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
# job_when JSON задача — when задачи в списке или «нет»
job_when() { echo "$1" | jq -r --arg j "$2" '(.[] | select(.name == $j) | .when) // "нет"'; }
```

### Пайплайн не создаётся

В `~/ci-broken` после последних правок пайплайн перестал создаваться. Почините `.gitlab-ci.yml`: должны быть задачи `lint`, `test` и `build` на этапах `lint`, `test` и `build`, все команды задач должны остаться и выполняться, пайплайн — проходить.

Запуск пайплайна: `gitlab-ci-local` в каталоге проекта.

```bash setup
d=/home/student/ci-broken
lab_ci_repo $d
cat > $d/run-tests.sh <<'EOF'
#!/bin/sh
echo "tests passed: 12"
EOF
chmod +x $d/run-tests.sh
cat > $d/.gitlab-ci.yml <<'EOF'
stages: [lint, test, build]

lint:
  stage: lint
  script:
    - echo "lint ok"

test:
  stage: tests
  script:
    - echo Result: ok
    - ./run-tests.sh

build:
  stage: build
  needs: [unit]
  script:
    - echo "build ok" > build.txt
    - cat build.txt
EOF
printf '.gitlab-ci-local/\nbuild.txt\n' > $d/.gitignore
lab_ci_commit $d
```

```bash check
d=/home/student/ci-broken
m=$(lab_ci_jobs $d); [ -n "$m" ] || fail "Пайплайн по ~/ci-broken/.gitlab-ci.yml не создаётся"
for j in lint:lint test:test build:build; do
  n=${j%%:*}; s=${j#*:}
  [ "$(echo "$m" | jq -r --arg n "$n" '.[] | select(.name == $n) | .stage')" = "$s" ] || fail "Нет задачи $n на этапе $s"
done
lab_ci_run $d || fail "Пайплайн не проходит: $(lab_ci_log)"
log=$(sed 's/\x1b\[[0-9;]*m//g' /tmp/lab-ci.log)
echo "$log" | grep -q 'Result: ok' || fail "В журнале задачи test нет строки «Result: ok»"
echo "$log" | grep -q 'tests passed: 12' || fail "В журнале задачи test нет вывода тестов"
echo "$log" | grep -q 'build ok' || fail "В журнале задачи build нет «build ok»"
ok "пайплайн lint → test → build проходит"
```

```text hint
1. Запросить у локального запуска итоговую конфигурацию — он покажет первую ошибку. После каждой правки проверять снова: ошибки идут по одной.
2. Сверить этапы задач со списком этапов; ссылки между задачами — с реальными именами задач.
3. Строку скрипта, в которой есть двоеточие с пробелом, YAML читает как словарь — её нужно сделать строкой.
```

```bash solution
cd ~/ci-broken
gitlab-ci-local --preview 2>&1 | tail -3 || true
sed -i 's/^  stage: tests$/  stage: test/; s/^  needs: \[unit\]$/  needs: [test]/' .gitlab-ci.yml
sed -i "s/^    - echo Result: ok\$/    - 'echo Result: ok'/" .gitlab-ci.yml
cat .gitlab-ci.yml
gitlab-ci-local
```

```text review
Три ошибки, каждая останавливает создание пайплайна целиком:

1. `stage: tests` — такого этапа нет в `stages` (`test`).
2. `- echo Result: ok` — для YAML это словарь `{echo Result: ok}`, а не строка. Любую строку скрипта с `: ` (двоеточие и пробел) берут в кавычки **целиком**: `- 'echo Result: ok'`. Вариант `- echo "Result: ok"` не помогает — кавычки в середине строки для YAML просто символы, и это снова словарь. То же касается `#` (начало комментария) и строк, начинающихся с `*`, `&`, `{`, `[`.
3. `needs: [unit]` — задачи `unit` нет. Можно было убрать `needs` совсем — тогда build ждёт весь этап test.

- Линтер перед коммитом экономит пайплайн-минуты и нервы: в GitLab — Pipeline editor и `glab ci lint`, локально — `gitlab-ci-local --preview`.
- Удалить «мешающую» строку — не решение: по условию все команды задач должны остаться.
```

### Деплой уезжает без сборки

В `~/ci-deploy2` пайплайн собирает сайт (`build.sh` кладёт его в `dist/`) и выкладывает на «сервер» `~/ci-www2/`. После перехода основной ветки с `master` на `main` и «оптимизации» пайплайна сайт на сервере перестал обновляться.

Почините `.gitlab-ci.yml` так, чтобы на ветке `main` пайплайн собирал сайт и выкладывал **именно эту сборку** в `~/ci-www2/`, а в остальных ветках деплоя не было. Задачи изолированы, как в настоящем GitLab: запуск — `gitlab-ci-local --shell-isolation`.

```bash setup
d=/home/student/ci-deploy2
lab_ci_repo $d
rm -rf /home/student/ci-www2
echo '<h1>Сайт __VERSION__</h1>' > $d/index.html
cat > $d/build.sh <<'EOF'
#!/bin/sh
set -e
mkdir -p dist
sed "s/__VERSION__/${CI_COMMIT_SHORT_SHA:-dev}/" index.html > dist/index.html
echo "built dist/index.html"
EOF
chmod +x $d/build.sh
cat > $d/.gitlab-ci.yml <<'EOF'
stages: [build, deploy]

build:
  stage: build
  script:
    - ./build.sh
  artifacts:
    paths: [build/]
    expire_in: 1 day

deploy:
  stage: deploy
  dependencies: []
  rules:
    - if: '$CI_COMMIT_BRANCH == "master"'
  script:
    - mkdir -p "$HOME/ci-www2"
    - cp -r dist/. "$HOME/ci-www2/"
EOF
printf '.gitlab-ci-local/\ndist/\n' > $d/.gitignore
lab_ci_commit $d
```

```bash check
d=/home/student/ci-deploy2
m=$(lab_ci_jobs $d); [ -n "$m" ] || fail "Пайплайн по ~/ci-deploy2/.gitlab-ci.yml не создаётся"
[ "$(job_when "$m" deploy)" = нет ] && fail "На ветке main в пайплайне нет задачи deploy"
f=$(lab_ci_jobs $d feature/x)
[ -n "$f" ] || fail "Не удалось получить список задач для другой ветки"
x=$(job_when "$f" deploy); [ "$x" = нет ] || [ "$x" = never ] || fail "В ветке feature/x в пайплайне есть задача deploy"
rm -rf /home/student/ci-www2 $d/dist
lab_ci_run $d --shell-isolation || fail "Пайплайн не проходит: $(lab_ci_log)"
sha=$(su - student -c "cd $d && git rev-parse --short=8 HEAD")
[ -f /home/student/ci-www2/index.html ] || fail "После пайплайна на «сервере» нет ~/ci-www2/index.html"
grep -q "$sha" /home/student/ci-www2/index.html || fail "~/ci-www2/index.html не из сборки коммита $sha: $(head -c 80 /home/student/ci-www2/index.html)"
p=$(lab_ci_preview $d)
echo "$p" | jq -r '.deploy.script | join(" ")' | grep -qE 'build\.sh|__VERSION__|sed' && fail "Задача deploy собирает сайт сама"
ok "на main сборка $sha выложена через артефакт, в других ветках деплоя нет"
```

```text hint
1. Посмотреть, какие задачи попадают в пайплайн основной ветки, и сравнить условие задачи деплоя с тем, как теперь называется основная ветка.
2. Когда деплой появился, прочитать его журнал: что задача получила на вход от сборки. Сравнить, куда сборка кладёт результат, с тем, что она объявляет результатом.
3. Проверить, не запрещено ли задаче деплоя получать результаты предыдущих этапов.
```

```bash solution
cd ~/ci-deploy2
gitlab-ci-local --list
sed -i 's/"master"/"main"/; s#paths: \[build/\]#paths: [dist/]#; /^  dependencies: \[\]$/d' .gitlab-ci.yml
cat .gitlab-ci.yml
gitlab-ci-local --shell-isolation
cat ~/ci-www2/index.html
```

```text review
Три поломки по цепочке, каждая видна только после исправления предыдущей:

1. `rules: if: $CI_COMMIT_BRANCH == "master"` — основную ветку переименовали в `main`, правило перестало совпадать, и задача деплоя молча исчезла из пайплайна. Надёжнее писать `$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH`.
2. `artifacts: paths: [build/]` — сборка кладёт результат в `dist/`. GitLab честно предупреждает в журнале build: «no matching files».
3. `dependencies: []` — задаче запрещено скачивать артефакты вообще. Это оптимизация для задач, которым они не нужны (линтер, уведомление), но не для деплоя.

- Без изоляции (`gitlab-ci-local` без ключа, shell-раннер в одном каталоге) поломки 2 и 3 не видны: файлы просто остаются на диске после build. Поэтому «у меня локально работает» в CI ничего не доказывает.
- Пересобрать сайт в deploy — не решение: на сервер должна уехать та сборка, что прошла проверки (build once, deploy many).
```

```text notes
\$CI_COMMIT_BRANCH\s*!=|when:\s*always => Деплой запускается не только на основной ветке — по условию в других ветках его быть не должно.
```

## Тест

### Пайплайн не создаётся с ошибкой «chosen stage does not exist». Что не так?
- [ ] Нет раннера
- [x] У задачи stage, которого нет в списке stages
- [ ] Ошибка в Dockerfile
- [ ] Не задана переменная
> Этапы перечисляются в `stages`, задача может ссылаться только на них.

### Почему строка скрипта `- echo Result: ok` ломает .gitlab-ci.yml?
- [ ] echo запрещён в GitLab CI
- [x] YAML читает «ключ: значение» как словарь, а script ждёт строки — нужны кавычки
- [ ] Слово Result зарезервировано
- [ ] Нужно писать с отступом в 4 пробела
> Двоеточие с пробелом делает строку словарём; кавычки нужны вокруг всей строки: `- 'echo Result: ok'`.

### Где посмотреть итоговую конфигурацию пайплайна после include, extends и якорей?
- [ ] В журнале раннера
- [x] Pipeline editor → Full configuration (локально — gitlab-ci-local --preview)
- [ ] В Settings → CI/CD → Variables
- [ ] Только после запуска пайплайна
> Итоговый YAML показывает, что реально получила каждая задача.

### Задача deploy есть в файле, но её нет в пайплайне. Что проверить первым?
- [ ] Хватает ли у раннера памяти
- [x] rules / only / except и для какой ветки или события создан пайплайн
- [ ] Права на репозиторий
- [ ] Версию GitLab
> Задача, у которой не совпало ни одно правило, просто не попадает в пайплайн — без ошибки.

### Как в rules сослаться на основную ветку, не прописывая её имя?
= $CI_DEFAULT_BRANCH
> `if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH` переживёт переименование master → main.

### В журнале build предупреждение «no matching files» про артефакт. Что это значит?
- [ ] Артефакт загрузился, всё в порядке
- [x] По путям из artifacts:paths файлов не нашлось — следующие этапы ничего не получат
- [ ] Закончилось место в GitLab
- [ ] Неправильный expire_in
> Обычно путь не совпадает с тем, куда сборка на самом деле кладёт результат.

### Что делает dependencies: [] в задаче?
- [ ] Ускоряет запуск, ничего не меняя
- [x] Запрещает задаче скачивать артефакты предыдущих этапов
- [ ] Отменяет needs
- [ ] Делает задачу независимой от stages
> Полезно для задач, которым артефакты не нужны; деплою — нужны.

### Деплой «зелёный», но на сервере старая версия. Что проверить?
- [ ] Ничего — раз зелёный, значит всё выложено
- [x] Что задача получила на вход (артефакты), какие файлы скопировала, куда и с какой версией
- [ ] Перезапустить пайплайн несколько раз
- [ ] Сменить раннер
> Зелёный статус значит лишь, что команды вернули 0; `cp` пустого каталога тоже «успешен».

### Почему пайплайн может работать на shell-раннере без артефактов, а на docker-раннере — нет?
- [ ] Docker медленнее
- [x] На shell-раннере в одном каталоге файлы предыдущих задач остаются на диске; в изолированных задачах их нет
- [ ] Docker не поддерживает артефакты
- [ ] Это ошибка GitLab
> Изоляция задач делает явными все зависимости — то, что не объявлено артефактом, не доедет.

### needs: [unit] — задачи unit в пайплайне нет. Что будет?
- [ ] needs игнорируется
- [x] Пайплайн не создастся: needs ссылается на отсутствующую задачу
- [ ] Задача запустится первой
- [ ] Задача будет ждать вечно
> Ссылки `needs` проверяются при создании пайплайна.

### Пайплайн упал. Какую строку журнала смотреть в первую очередь?
- [ ] Последнюю
- [x] Первую ошибку — дальше обычно её последствия
- [ ] Строку с версией раннера
- [ ] Любую красную
> Последние строки часто — «job failed: exit code 1», а причина выше.

### Зачем проверять .gitlab-ci.yml линтером до push?
- [ ] Иначе GitLab удалит файл
- [x] Ошибка конфигурации ломает пайплайн целиком; линтер находит её за секунды без запуска
- [ ] Линтер ускоряет раннер
- [ ] Это обязательное требование GitLab
> Pipeline editor, `glab ci lint` или локальный `gitlab-ci-local --preview` — в pre-commit или вручную.
