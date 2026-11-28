---
title: Сломанный сервер — Git
slug: slomannyj-server-git
description: Разбор аварий с Git без подсказок в условии — потерянные коммиты, застрявший rebase, секрет в коммите. Как не сделать хуже и как найти, где что лежит.
duration: 60
level: Практика
quizSize: 10
---

# Сломанный сервер — Git

В этом разделе нет новой теории — только **аварии**. В лаборатории вам описывают симптом, как его описал бы коллега («коммиты пропали», «Git ругается»), а причину и способ починки вы ищете сами. Так проходит live-траблшутинг на собеседовании и обычный рабочий день.

## Как не сделать хуже

1. **Остановиться.** Большинство потерь в Git случается не от исходной ошибки, а от суеты после неё: `reset --hard`, `push --force`, удалённая ветка.
2. **Сохранить состояние.** Перед экспериментами — копия: `cp -a project project.bak` или `git branch backup-$(date +%s)`. Ветка ничего не стоит, а коммиты в ней не потеряются.
3. **Понять, где вы:** `git status` (не идёт ли merge, rebase, cherry-pick; какая ветка), `git log --oneline --graph --all -20` (что где лежит), `git reflog -20` (куда HEAD ходил последние шаги).
4. **Только потом** чинить — и проверять результат той же картой.

## Где искать «пропавшее»

- **Коммиты, на которые не ссылается ни одна ветка**, живут ~90 дней: `git reflog` (перемещения HEAD), `git reflog show <ветка>`, `git fsck --lost-found` (совсем потерянные).
- **Незакоммиченные правки**, стёртые `reset --hard` или `checkout -- .`, Git не хранит — их не вернуть. Спасает только привычка коммитить часто и `git stash`.
- **Удалённая ветка** — её последний коммит есть в reflog и, возможно, на сервере (`git branch -r`).

## Частые поломки

| Симптом | Что посмотреть | Что обычно помогает |
| --- | --- | --- |
| «Коммиты пропали» после переключения ветки | `git reflog` — коммиты в «detached HEAD» | `git branch rescue <хеш>`, затем merge/cherry-pick |
| `git status`: rebase/merge in progress, коммит не делается | `git status`, файлы с конфликтом | исправить, `git add`, `git rebase --continue` (или `--abort`) |
| Push отклонён | `git fetch` и `git log main..origin/main` | `git pull --rebase`, но не `--force` в общую ветку |
| Секрет попал в коммит | `git log --all -- путь` | не отправлен — `git rm --cached` + `--amend`; отправлен — **сменить секрет** и чистить историю (`git filter-repo`) |
| «dubious ownership» | владелец каталога | `git config --global --add safe.directory <путь>` |
| Огромный репозиторий | `git count-objects -vH` | большие файлы — в Git LFS, из истории — `git filter-repo` |

## Практика

- [ ] Пройти все задачи лаборатории, не открывая подсказку хотя бы первые 10 минут
- [ ] Для каждой аварии записать в конспект: симптом → команды диагностики → причина → решение
- [ ] Специально «потерять» коммит в своём репозитории через detached HEAD и вернуть его через reflog

## Лаборатория

```bash setup
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
```

### Пропали два коммита

Вчера вы чинили вход в `~/incident-login`: сделали два коммита — **«Fix login timeout»** и **«Add login tests»**. Сегодня их нет ни в одной ветке, `git log` их не показывает. Верните эту работу в ветку **`main`**.

```bash setup
rm -rf /home/student/incident-login
su - student -c 'bash -s' <<'EOF'
mkdir ~/incident-login && cd ~/incident-login && git init -q -b main
echo "timeout=10" > login.conf && git add . && git commit -qm "Initial login"
git tag v1.0
echo "# docs" > README.md && git add . && git commit -qm "Add readme"
git checkout -q v1.0 2>/dev/null
echo "timeout=30" > login.conf && git commit -qam "Fix login timeout"
echo "def test_login(): pass" > test_login.py && git add . && git commit -qm "Add login tests"
git checkout -q main 2>/dev/null
EOF
```

```bash check
r=/home/student/incident-login
for m in "Fix login timeout" "Add login tests"; do
  git -C $r log --format=%s main | grep -qx "$m" || fail "В main нет коммита «$m»"
done
git -C $r cat-file -e main:test_login.py 2>/dev/null || fail "В main нет test_login.py"
[ "$(git -C $r show main:login.conf)" = "timeout=30" ] || fail "В main login.conf не исправлен"
git -C $r cat-file -e main:README.md 2>/dev/null || fail "Из main пропал README.md"
[ -z "$(git -C $r status --porcelain)" ] || fail "В рабочем каталоге остались незавершённые изменения"
ok "$(git -C $r log --oneline main | tr '\n' ';')"
```

```text hint
1. Обычный журнал показывает только коммиты, достижимые из веток. Есть журнал всех перемещений HEAD — там видно, на чём вы работали вчера.
2. Сохранить найденное в ветке, чтобы оно больше не «висело».
3. Перенести работу в main слиянием или переносом коммитов.
```

```bash solution
cd ~/incident-login
git reflog | head -8
git branch rescue "$(git reflog --format='%H %gs' | grep -m1 'commit: Add login tests' | cut -d' ' -f1)"
git switch main
git merge --no-edit rescue
git log --oneline --graph --all | head
```

```text review
Причина: коммиты сделаны в состоянии **detached HEAD** (после `git checkout v1.0`) — HEAD указывал на коммит, а не на ветку. При возврате на main на них не осталось ни одной ссылки.

- Git предупреждает об этом при переключении («you are leaving 2 commits behind»), но сообщение легко пропустить.
- Спасение: `git reflog` → `git branch rescue <хеш>` → слить или перенести в нужную ветку.
- Профилактика: прежде чем работать от тега, создать ветку — `git switch -c hotfix/login v1.0`.
```

### Git ругается и не даёт коммитить

В `~/incident-pay` вчера начали обновлять ветку `feature/payments` и ушли домой. Сейчас `git commit` не работает, а `git status` пишет что-то непонятное. Доведите начатое до конца: ветка `feature/payments` должна быть **поверх актуального `main`**, без коммитов слияния, а в `config.yml` должны остаться **оба** изменения — `timeout` из `main` и `retries` из ветки.

```bash setup
rm -rf /home/student/incident-pay
su - student -c 'bash -s' <<'EOF'
mkdir ~/incident-pay && cd ~/incident-pay && git init -q -b main
printf 'service: pay\n' > config.yml && git add . && git commit -qm "Init"
git switch -qc feature/payments
printf 'service: pay\nretries: 3\n' > config.yml && git commit -qam "Add retries"
git switch -q main
printf 'service: pay\ntimeout: 30\n' > config.yml && git commit -qam "Add timeout"
git switch -q feature/payments
git rebase main >/dev/null 2>&1 || true
EOF
```

```bash check
r=/home/student/incident-pay
[ -d $r/.git/rebase-merge ] || [ -d $r/.git/rebase-apply ] && fail "Перебазирование всё ещё не завершено"
[ "$(git -C $r branch --show-current)" = feature/payments ] || fail "Сейчас выбрана ветка «$(git -C $r branch --show-current)»"
git -C $r merge-base --is-ancestor main feature/payments || fail "feature/payments не стоит поверх main"
[ -z "$(git -C $r rev-list --merges main..feature/payments)" ] || fail "В ветке есть коммит слияния"
c=$(git -C $r show feature/payments:config.yml)
echo "$c" | grep -qE '^(<<<<<<<|=======|>>>>>>>)' && fail "В config.yml остались пометки конфликта"
echo "$c" | grep -qx 'timeout: 30' && echo "$c" | grep -qx 'retries: 3' || fail "В config.yml нет обоих изменений: $(echo $c)"
ok "feature/payments поверх main: $(echo $c)"
```

```text hint
1. Прочитайте git status целиком: он говорит, какая операция идёт и что от вас ждут.
2. Разрешите конфликт в файле, оставив обе нужные строки, отметьте файл решённым.
3. Продолжите прерванную операцию (не начинайте новую).
```

```bash solution
cd ~/incident-pay
git status
printf 'service: pay\ntimeout: 30\nretries: 3\n' > config.yml
git add config.yml
GIT_EDITOR=true git rebase --continue
git log --oneline --graph --all
```

```text review
Причина: `git rebase main` остановился на конфликте, и операция осталась незавершённой — Git держит состояние в `.git/rebase-merge`.

- `git status` в таком состоянии прямо пишет: «You are currently rebasing… fix conflicts and then run git rebase --continue». Читайте его до конца.
- Выходы: исправить и `--continue`, пропустить коммит `--skip`, отменить всё `--abort` (вернёт как было до rebase).
- `git commit` посреди rebase создаёт лишний коммит, а `git rebase main` заново — ошибку «already in progress».
```

```text notes
rebase\s+--abort => Перебазирование отменялось — работает, если потом начать заново, но задача была довести начатое: rebase --continue после разрешения конфликта.
```

### Пароль в последнем коммите

В `~/incident-secret` перед `git push` заметили, что в последний коммит «Add db config» вместе с правкой `app.py` попал файл `config/db.env` с паролем. Коммит **ещё не отправлен**. Уберите файл из истории так, чтобы правка `app.py` осталась закоммиченной, сам файл остался **на диске** (он нужен для запуска), а Git его **больше не видел**.

```bash setup
rm -rf /home/student/incident-secret
su - student -c 'bash -s' <<'EOF'
mkdir -p ~/incident-secret && cd ~/incident-secret && git init -q -b main
echo "print('app v1')" > app.py && git add . && git commit -qm "Init app"
mkdir config && echo "DB_PASSWORD=Sup3r-Secret" > config/db.env
echo "print('app v2: reads config/db.env')" > app.py
git add -A && git commit -qm "Add db config"
EOF
```

```bash check
r=/home/student/incident-secret
[ -n "$(git -C $r log --all --format=%H -- config/db.env)" ] && fail "config/db.env всё ещё есть в истории (git log --all -- config/db.env)"
git -C $r show HEAD:app.py 2>/dev/null | grep -q 'app v2' || fail "Правка app.py пропала из коммита"
[ "$(git -C $r rev-list --count HEAD)" = 2 ] || fail "В истории $(git -C $r rev-list --count HEAD) коммитов, а должно остаться 2"
grep -q 'Sup3r-Secret' $r/config/db.env 2>/dev/null || fail "Файл config/db.env удалён с диска — он нужен для запуска"
git -C $r check-ignore -q config/db.env || fail "Git всё ещё видит config/db.env"
[ -z "$(git -C $r status --porcelain)" ] || fail "Остались незакоммиченные изменения: $(git -C $r status --porcelain | tr '\n' ' ')"
ok "секрета нет в истории, файл на месте и игнорируется"
```

```text hint
1. Убрать файл из индекса, не удаляя с диска, — у команды удаления есть ключ «только из индекса».
2. Добавить путь в файл исключений.
3. Пересоздать последний коммит с текущим индексом (вместе с файлом исключений).
4. Проверить историю по пути файла во всех ветках.
```

```bash solution
cd ~/incident-secret
git rm --cached config/db.env
echo "config/db.env" >> .gitignore
git add .gitignore
git commit --amend --no-edit
git log --all --stat --oneline
```

```text review
Эталон: `git rm --cached config/db.env` → `.gitignore` → `git commit --amend`.

- Пока коммит не отправлен, это безопасно: история меняется только у вас.
- **Если уже отправлен** — секрет скомпрометирован навсегда: его видели все, у кого есть доступ к репозиторию, и CI. Порядок: **сначала сменить пароль**, потом чистить историю (`git filter-repo --path config/db.env --invert-paths`, затем force-push и пересоздание клонов у всех).
- Профилактика: `.gitignore` с первого дня, `.env.example` без значений, сканеры секретов перед коммитом (gitleaks, pre-commit) и в CI.
```

```text notes
git\s+rm\s+(?![^\n]*--cached)[^\n]*db\.env => Файл удалялся без --cached — он пропал и с диска. Чтобы убрать только из Git, нужен git rm --cached.
filter-branch|filter-repo => Для неотправленного последнего коммита хватает git commit --amend — переписывать всю историю не нужно.
```

## Тест

### Вы переключились на тег v1.0, сделали два коммита и вернулись на main. Где теперь эти коммиты?
- [ ] Удалены безвозвратно
- [x] Существуют, но на них не ссылается ни одна ветка — найти их можно в reflog
- [ ] В ветке v1.0
- [ ] На сервере
> В detached HEAD коммиты создаются, но после ухода на ветку становятся «сиротами». Они живут ~90 дней и видны в `git reflog`.

### Какая команда показывает, куда перемещался HEAD последние шаги?
= git reflog
= git reflog show HEAD
> reflog — локальный журнал перемещений HEAD и веток: коммиты, переключения, reset, rebase.

### Что первым делом делать при аварии в репозитории?
- [ ] git reset --hard origin/main
- [ ] Удалить каталог и склонировать заново
- [x] Остановиться и сохранить текущее состояние: ветка-закладка или копия каталога
- [ ] git push --force, чтобы сервер совпал с локальным
> Большинство потерь — от суетливых действий после ошибки. Закладка `git branch backup` ничего не стоит.

### git status пишет «You are currently rebasing». Как довести операцию до конца после разрешения конфликта?
- [ ] git commit -m "merge"
- [ ] git rebase main ещё раз
- [x] git add <файлы> и git rebase --continue
- [ ] git merge --continue
> Rebase применяет коммиты по одному; после разрешения конфликта — `add` и `--continue`, отменить всё — `--abort`.

### Какую незакоммиченную работу НЕ вернуть никаким способом после git reset --hard?
- [x] Изменения в файлах, которые не были ни закоммичены, ни спрятаны в stash
- [ ] Коммиты в текущей ветке
- [ ] Коммиты в удалённой локальной ветке
- [ ] Ничего — reflog вернёт всё
> Git хранит только то, что попало в объекты (коммиты, stash, иногда индекс). Правки рабочего каталога reset --hard стирает навсегда.

### В неотправленный последний коммит попал файл с паролем. Как убрать его из коммита, не удаляя с диска?
- [ ] git rm config/db.env и git commit
- [x] git rm --cached config/db.env, добавить путь в .gitignore и git commit --amend
- [ ] git reset --hard HEAD~1
- [ ] git revert HEAD
> `--cached` убирает файл только из индекса; `--amend` пересоздаёт последний коммит без него.

### Секрет попал в коммит, который уже отправлен на GitHub. Что сделать в первую очередь?
- [ ] Удалить файл новым коммитом
- [ ] Переписать историю через filter-repo и force-push
- [x] Сменить скомпрометированный пароль или ключ
- [ ] Сделать репозиторий приватным
> Отправленный секрет уже могли скачать (клоны, CI, форки, сканеры). Сначала ротация, потом чистка истории.

### Как найти все коммиты во всех ветках, где менялся файл config/db.env?
= git log --all -- config/db.env
= git log --all --oneline -- config/db.env
> `--all` — все ссылки, `-- путь` — только коммиты, которые трогали этот файл.

### Push отклоняется с сообщением «fetch first». Что НЕ стоит делать в общей ветке main?
- [ ] git pull --rebase
- [ ] git fetch и посмотреть, что пришло
- [x] git push --force
- [ ] git pull
> На сервере есть чужие коммиты; force-push их сотрёт. Нужно забрать их и отправить свои поверх.

### Как сохранить найденный в reflog коммит abc1234, чтобы он больше не «висел»?
= git branch rescue abc1234
= git switch -c rescue abc1234
= git checkout -b rescue abc1234
> Ветка — ссылка на коммит: пока она есть, коммит не будет удалён сборщиком мусора.

### Как избежать потери коммитов при работе от тега v1.0?
- [ ] Не использовать теги
- [x] Сразу создать ветку от тега: git switch -c hotfix v1.0
- [ ] Делать коммиты с ключом --force
- [ ] Работать только в main
> С веткой HEAD указывает на неё, и новые коммиты не окажутся «сиротами».

### git status показывает, что идёт merge, а вы передумали сливать. Как вернуть всё как было до слияния?
= git merge --abort
> `--abort` возвращает состояние до начала операции; так же для rebase и cherry-pick.
