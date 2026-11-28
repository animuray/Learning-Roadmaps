---
title: Git — история, теги и отмена изменений
slug: git-istoriya-tegi-otmena
description: Как читать историю и сравнивать изменения, ставить теги версий и безопасно отменять ошибки — restore, revert, reset, stash, reflog.
duration: 60
level: Основы
quizSize: 10
materials:
  - title: Pro Git — Просмотр истории коммитов
    url: https://git-scm.com/book/ru/v2/Основы-Git-Просмотр-истории-коммитов
    type: книга
  - title: Pro Git — Операции отмены
    url: https://git-scm.com/book/ru/v2/%D0%9E%D1%81%D0%BD%D0%BE%D0%B2%D1%8B-Git-%D0%9E%D0%BF%D0%B5%D1%80%D0%B0%D1%86%D0%B8%D0%B8-%D0%BE%D1%82%D0%BC%D0%B5%D0%BD%D1%8B
    type: книга
  - title: Pro Git — Работа с тегами
    url: https://git-scm.com/book/ru/v2/%D0%9E%D1%81%D0%BD%D0%BE%D0%B2%D1%8B-Git-%D0%A0%D0%B0%D0%B1%D0%BE%D1%82%D0%B0-%D1%81-%D1%82%D0%B5%D0%B3%D0%B0%D0%BC%D0%B8
    type: книга
  - title: Pro Git — Раскрытие тайн reset
    url: https://git-scm.com/book/ru/v2/%d0%98%d0%bd%d1%81%d1%82%d1%80%d1%83%d0%bc%d0%b5%d0%bd%d1%82%d1%8b-Git-%d0%a0%d0%b0%d1%81%d0%ba%d1%80%d1%8b%d1%82%d0%b8%d0%b5-%d1%82%d0%b0%d0%b9%d0%bd-reset
    type: книга
  - title: Pro Git — Припрятывание и очистка (stash)
    url: https://git-scm.com/book/ru/v2/Инструменты-Git-Припрятывание-и-очистка
    type: книга
  - title: Atlassian — Команды reset, checkout и revert
    url: https://www.atlassian.com/ru/git/tutorials/resetting-checking-out-and-reverting
    type: статья
---

# Git — история, теги и отмена изменений

Git ценен тем, что почти любую ошибку можно отменить. Важно знать, **какой командой**: одни отмены безопасны для общей истории, другие её переписывают и могут уничтожить работу.

## Смотреть историю

```bash
git log --oneline --graph --all      # граф всех веток
git log -p -2                        # два последних коммита с изменениями
git log --stat                       # какие файлы менялись и насколько
git log --author="Иван" --since="2 weeks ago"
git log -- nginx.conf                # история одного файла
git show a1b2c3d                     # что именно изменил конкретный коммит
```

## Сравнивать изменения: diff

| Команда | Что сравнивает |
| --- | --- |
| `git diff` | Рабочий каталог ↔ индекс: что изменено, но ещё не добавлено |
| `git diff --staged` | Индекс ↔ последний коммит: что войдёт в коммит |
| `git diff main feature` | Две ветки |
| `git diff a1b2c3d e4f5a6b -- app.py` | Один файл между двумя коммитами |

## Теги: метки версий

Тег — постоянное имя для конкретного коммита, обычно версия релиза: `v1.0`, `v2.3.1`. В отличие от ветки, тег не двигается.

- **Аннотированный** тег (`git tag -a v1.0 -m "Первый релиз"`) — полноценный объект: автор, дата, сообщение. Используется для релизов.
- **Легковесный** тег (`git tag v1.0-test`) — просто указатель на коммит, для личных или временных меток.

```bash
git tag                         # список тегов
git tag -a v1.0 -m "Релиз 1.0"  # тег на текущий коммит
git tag -a v0.9 9fceb02         # тег на старый коммит
git push origin v1.0            # теги НЕ отправляются обычным git push
git push origin --tags          # отправить все теги
```

> [!tip] Теги и CI/CD
> В DevOps теги часто запускают релиз: пайплайн собирает Docker-образ с тегом `v1.0` и деплоит его. Распространённая схема нумерации — семантическое версионирование `MAJOR.MINOR.PATCH`.

## Отмена изменений: что выбрать

| Ситуация | Команда |
| --- | --- |
| Испортил файл, хочу вернуть как в последнем коммите | `git restore файл` |
| Случайно добавил файл в индекс | `git restore --staged файл` |
| Опечатка в сообщении последнего коммита или забыл файл | `git commit --amend` |
| Нужно отменить коммит, который уже на сервере | `git revert <хеш>` |
| Убрать последние локальные коммиты | `git reset` с нужным режимом |
| Срочно переключиться, а работа не готова | `git stash` |
| Потерял коммит после reset или rebase | `git reflog` |

### revert — безопасная отмена

`git revert <хеш>` создаёт **новый коммит**, который делает обратные изменения. История не переписывается, поэтому так отменяют коммиты в общих ветках, уже отправленных на сервер.

### reset — передвинуть ветку назад

`git reset` двигает указатель текущей ветки на другой коммит. Три режима:

| Режим | Ветка | Индекс | Рабочий каталог |
| --- | --- | --- | --- |
| `--soft` | Передвинута | Изменения отменённых коммитов остаются подготовленными | Не тронут |
| `--mixed` (по умолчанию) | Передвинута | Сброшен | Изменения остаются в файлах |
| `--hard` | Передвинута | Сброшен | **Изменения удалены** |

```bash
git reset --soft HEAD~1   # «раскоммитить» последний коммит, оставив изменения в индексе
git reset --hard HEAD~1   # выбросить последний коммит и все незакоммиченные изменения
```

> [!danger] reset и amend переписывают историю
> Используйте их для коммитов, которые ещё **не отправлены** на сервер. Для опубликованных коммитов — `git revert`.

### amend — поправить последний коммит

```bash
git add забытый_файл
git commit --amend -m "Исправленное сообщение"
```

Старый коммит заменяется новым, с другим хешем.

### stash — спрятать работу

```bash
git stash            # спрятать изменения (то же, что git stash push)
git stash -u         # вместе с неотслеживаемыми файлами
git stash list       # список: stash@{0} — самый свежий
git stash pop        # вернуть последнее и удалить из списка
git stash apply      # вернуть, но оставить в списке
git stash drop stash@{1}
```

### reflog — машина времени

`git reflog` показывает, куда указывал HEAD в последнее время: каждое переключение, коммит, reset, rebase. Если «потеряли» коммит после `reset --hard`, найдите его хеш в reflog и верните: `git reset --hard <хеш>` или создайте на нём ветку `git branch rescue <хеш>`.

## Практика

- [ ] Сделать несколько коммитов и посмотреть их через `git log --stat`, `git log -p` и `git show`
- [ ] Сравнить `git diff` и `git diff --staged` до и после `git add`
- [ ] Поставить аннотированный тег `v0.1` на свой конспект и отправить его на GitHub; найти его во вкладке Tags
- [ ] Отменить запушенный коммит через `git revert`
- [ ] Сделать `git reset --hard HEAD~2`, а затем вернуть «потерянные» коммиты через `git reflog`
- [ ] Начать правку, спрятать её через `git stash`, переключиться на другую ветку и вернуть через `git stash pop`

## Лаборатория

```bash setup
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
mkdir -p /srv/git
```

### Отменить опубликованный коммит

В `~/shop` история уже отправлена на сервер `/srv/git/shop.git`. Один из коммитов, «Enable debug mode», включил отладку на проде — его нужно отменить. После него был ещё коммит, его трогать не надо. История на сервере **не должна переписываться**: коллеги уже скачали эти коммиты. Отмена должна попасть и на сервер.

```bash setup
rm -rf /home/student/shop /srv/git/shop.git
git init -q --bare -b main /srv/git/shop.git
chown -R student:student /srv/git/shop.git
su - student -c 'bash -s' <<'EOF'
git clone -q /srv/git/shop.git ~/shop 2>/dev/null && cd ~/shop
printf 'debug=false\nport=8080\n' > app.conf && git add . && git commit -qm "Init shop"
sed -i 's/debug=false/debug=true/' app.conf && git commit -qam "Enable debug mode"
echo "<footer>shop</footer>" > footer.html && git add . && git commit -qm "Add footer"
git push -q origin main
EOF
git -C /srv/git/shop.git rev-parse main > /var/lib/lab/shop-pushed
```

```bash check
b=/srv/git/shop.git
git -C $b merge-base --is-ancestor "$(cat /var/lib/lab/shop-pushed)" main || fail "История на сервере переписана: прежних коммитов больше нет в main"
[ "$(git -C $b show main:app.conf | grep '^debug=')" = "debug=false" ] || fail "На сервере в app.conf отладка всё ещё включена"
git -C $b show main:footer.html >/dev/null 2>&1 || fail "Пропал коммит «Add footer» — его отменять было не нужно"
git -C $b log -1 --format=%s main | grep -q '^Revert' || fail "Последний коммит на сервере — не отмена коммита"
[ "$(git -C /home/student/shop rev-parse main)" = "$(git -C $b rev-parse main)" ] || fail "Локальная main и main на сервере различаются"
ok "$(git -C $b log --oneline -4 main | tr '\n' ';')"
```

```text hint
1. Найти хеш коммита, который включил отладку.
2. Есть команда, которая создаёт **новый** коммит с обратными изменениями указанного коммита — история при этом не переписывается.
3. Отправить результат на сервер обычным способом.
```

```bash solution
cd ~/shop
git revert --no-edit "$(git log --format=%H --grep='^Enable debug mode$')"
git push
```

```text review
Эталон: `git revert <хеш>` → `git push`.

- `revert` не удаляет коммит, а добавляет новый с обратными изменениями. История только растёт — это безопасно для общих веток.
- `git reset --hard` + `git push --force` тоже убрали бы коммит, но у коллег разъехалась бы история, а вместе с ним пропал бы «Add footer».
- Отменить можно и не последний коммит: Git вычислит обратный diff. Если более поздние коммиты меняли те же строки — будет конфликт, как при слиянии.
- Отменили по ошибке — отмените отмену: `git revert` от коммита «Revert …».
```

```text notes
reset\s+--hard => Использовался reset --hard: для опубликованной истории это переписывание, коллеги получат расхождение. Для отмены на общей ветке — git revert.
push\s+[^\n]*(--force\b|\s-f\b) => Использовался force-push в общую ветку.
```

### Поставить тег на релиз

В `~/lib` среди коммитов есть «Release 1.0» — он не последний. Поставьте на **этот** коммит **аннотированный** тег `v1.0` с сообщением и отправьте тег на сервер `/srv/git/lib.git`.

```bash setup
rm -rf /home/student/lib /srv/git/lib.git
git init -q --bare -b main /srv/git/lib.git
chown -R student:student /srv/git/lib.git
su - student -c 'bash -s' <<'EOF'
git clone -q /srv/git/lib.git ~/lib 2>/dev/null && cd ~/lib
echo "0.9" > VERSION && git add . && git commit -qm "Beta"
echo "1.0" > VERSION && git commit -qam "Release 1.0"
echo "def new(): pass" > new.py && git add . && git commit -qm "Start 1.1"
git push -q origin main
EOF
```

```bash check
b=/srv/git/lib.git
git -C $b rev-parse -q --verify refs/tags/v1.0 >/dev/null || fail "На сервере нет тега v1.0"
[ "$(git -C $b cat-file -t v1.0)" = tag ] || fail "v1.0 — лёгкий тег: у него нет автора, даты и сообщения"
[ "$(git -C $b log -1 --format=%s 'v1.0^{commit}')" = "Release 1.0" ] || fail "Тег v1.0 стоит на коммите «$(git -C $b log -1 --format=%s 'v1.0^{commit}')»"
[ -n "$(git -C $b for-each-ref refs/tags/v1.0 --format='%(contents:subject)')" ] || fail "У тега нет сообщения"
ok "v1.0 → $(git -C $b log -1 --format='%h %s' 'v1.0^{commit}'): $(git -C $b for-each-ref refs/tags/v1.0 --format='%(contents:subject)')"
```

```text hint
1. Найти хеш нужного коммита в истории.
2. Создать тег с ключом «аннотированный» и сообщением, указав этот хеш (без хеша тег встанет на последний коммит).
3. Теги не отправляются вместе с веткой — их нужно отправить отдельно.
```

```bash solution
cd ~/lib
git tag -a v1.0 -m "Версия 1.0" "$(git log --format=%H --grep='^Release 1.0$')"
git push origin v1.0
```

```text review
Эталон: `git tag -a v1.0 -m "..." <хеш>` → `git push origin v1.0`.

- Аннотированный тег — отдельный объект: автор, дата, сообщение, можно подписать. Для релизов используют только их; лёгкий тег (`git tag v1.0`) — просто указатель.
- `git push` теги не отправляет. Один тег — `git push origin v1.0`, все сразу — `git push --tags` (осторожно: уйдут и черновые).
- Посмотреть: `git show v1.0`, список — `git tag -l 'v1.*'`. На GitHub из тега делают Release.
- Тег поставили не туда: `git tag -d v1.0`, на сервере — `git push origin :refs/tags/v1.0`. Но если тег уже скачали, лучше выпустить новую версию.
```

### Вернуть потерянные коммиты

В `~/payments` вы поторопились и выполнили `git reset --hard HEAD~2`: из ветки `main` пропали два последних коммита — «Add refunds» и «Add tests». Верните их в `main`.

```bash setup
rm -rf /home/student/payments
su - student -c 'bash -s' <<'EOF'
mkdir ~/payments && cd ~/payments && git init -q -b main
echo "def pay(): pass" > pay.py && git add . && git commit -qm "Add payments"
echo "def refund(): pass" > refunds.py && git add . && git commit -qm "Add refunds"
echo "def test_pay(): pass" > tests.py && git add . && git commit -qm "Add tests"
git reset -q --hard HEAD~2
EOF
```

```bash check
r=/home/student/payments
for m in "Add refunds" "Add tests"; do
  git -C $r log --format=%s main | grep -qx "$m" || fail "В main нет коммита «$m»"
done
git -C $r cat-file -e HEAD:tests.py 2>/dev/null && git -C $r cat-file -e HEAD:refunds.py 2>/dev/null || fail "В последнем коммите нет файлов refunds.py и tests.py"
[ -z "$(git -C $r status --porcelain)" ] || fail "В рабочем каталоге остались незакоммиченные изменения"
ok "$(git -C $r log --oneline | tr '\n' ';')"
```

```text hint
1. Обычный журнал коммитов их уже не показывает. Но Git ведёт отдельный журнал всех перемещений HEAD — посмотрите его.
2. Найдите в нём состояние до сброса.
3. Верните ветку в это состояние той же командой, которой её сбросили.
```

```bash solution
cd ~/payments
git reflog -5
git reset --hard 'HEAD@{1}'
```

```text review
Эталон: `git reflog` → `git reset --hard HEAD@{1}` (или хеш из reflog).

- Коммиты после `reset --hard` не удаляются сразу: на них больше не ссылается ветка, но reflog помнит их около 90 дней (до сборки мусора).
- `HEAD@{1}` — «где был HEAD одно перемещение назад». Надёжнее взять хеш из вывода `git reflog`: после пары лишних команд номера сдвинутся.
- Альтернатива без перемещения ветки: `git branch rescue <хеш>` — сохранить коммиты в новой ветке и спокойно разобраться.
- Чего reflog не спасёт: **незакоммиченные** изменения, стёртые `reset --hard` или `checkout -- .`. Поэтому коммитьте часто.
```

```text notes
cherry-pick => Коммиты возвращались через cherry-pick — сработает, но создаст копии с новыми хешами. Проще вернуть ветку на прежний коммит: git reset --hard <хеш из reflog>.
```

### Срочно переключиться, не теряя работу

В `~/web` на ветке `main` вы начали правку `app.py` и ещё не закончили — коммитить её рано. Срочно нужно исправить опечатку в `README.md` («Wellcome» → «Welcome») на ветке `hotfix` и закоммитить. Потом вернитесь на `main` и продолжите: незаконченные правки `app.py` должны снова оказаться в рабочем каталоге, **не закоммиченными**.

```bash setup
rm -rf /home/student/web
su - student -c 'bash -s' <<'EOF'
mkdir ~/web && cd ~/web && git init -q -b main
echo "Wellcome to web" > README.md && echo "print('app')" > app.py && git add . && git commit -qm "Init web"
git branch hotfix
echo "# WIP: новая форма входа" >> app.py
EOF
git -C /home/student/web rev-parse main > /var/lib/lab/web-main
git -C /home/student/web rev-parse hotfix > /var/lib/lab/web-hotfix
```

```bash check
r=/home/student/web
[ "$(git -C $r rev-parse hotfix)" != "$(cat /var/lib/lab/web-hotfix)" ] || fail "На ветке hotfix нет нового коммита"
git -C $r show hotfix:README.md | grep -qx "Welcome to web" || fail "В README.md на ветке hotfix опечатка не исправлена"
[ -z "$(git -C $r diff --name-only "$(cat /var/lib/lab/web-hotfix)" hotfix -- app.py)" ] || fail "В коммит на hotfix попали изменения app.py"
[ "$(git -C $r branch --show-current)" = main ] || fail "Сейчас выбрана ветка «$(git -C $r branch --show-current)», а не main"
[ "$(git -C $r rev-parse main)" = "$(cat /var/lib/lab/web-main)" ] || fail "В main появились новые коммиты — незаконченная работа закоммичена"
git -C $r diff -- app.py | grep -q "WIP: новая форма входа" || fail "Незаконченных правок app.py нет в рабочем каталоге"
ok "hotfix: $(git -C $r log -1 --format=%s hotfix); в работе: $(git -C $r status --porcelain | tr '\n' ' ')"
```

```text hint
1. Временно убрать незаконченные правки в «тайник» — рабочий каталог станет чистым.
2. Перейти на ветку hotfix, исправить опечатку и закоммитить.
3. Вернуться на main и достать правки из тайника.
```

```bash solution
cd ~/web
git stash
git switch hotfix
sed -i 's/Wellcome/Welcome/' README.md
git commit -qam "Fix typo in README"
git switch main
git stash pop
```

```text review
Эталон: `git stash` → `git switch hotfix` → правка и коммит → `git switch main` → `git stash pop`.

- `stash` прячет изменения отслеживаемых файлов; новые файлы — только с `git stash -u`.
- `stash pop` = применить и удалить из тайника; `stash apply` оставляет копию. Список — `git stash list`, подписать — `git stash push -m "форма входа"`.
- Альтернатива: временный коммит `WIP` и потом `git reset --soft HEAD~1`. А для долгих параллельных задач удобнее `git worktree add ../web-hotfix hotfix` — второй рабочий каталог той же истории.
- Иногда Git переключает ветку и с изменениями (если они не мешают), и правки «переезжают» на другую ветку — легко закоммитить не туда.
```

```text notes
commit\s+[^\n]*(WIP|wip) => Незаконченная работа коммитилась как WIP. Так тоже делают, но потом коммит нужно убрать (git reset --soft HEAD~1), иначе он останется в истории.
```

## Тест

### Чем git revert отличается от git reset?
- [ ] revert удаляет коммит из истории, а reset создаёт новый
- [x] revert создаёт новый коммит с обратными изменениями и не переписывает историю, а reset передвигает ветку назад, переписывая историю
- [ ] Ничем, это синонимы
- [ ] revert работает только с тегами
> Поэтому для общих, уже опубликованных веток используют revert.

### Что сделает git reset --hard HEAD~1?
- [ ] Отменит последний коммит, но оставит его изменения в файлах
- [x] Уберёт последний коммит из ветки и удалит все незакоммиченные изменения в индексе и рабочем каталоге
- [ ] Создаст коммит, отменяющий предыдущий
- [ ] Отправит изменения на сервер
> `--hard` — единственный режим reset, который трогает файлы на диске. Используйте его осознанно.

### Что останется после git reset --soft HEAD~1?
- [ ] Ничего, всё удалится
- [x] Изменения из отменённого коммита останутся подготовленными в индексе — можно сразу закоммитить заново
- [ ] Изменения останутся только на сервере
- [ ] Коммит превратится в тег
> Удобно, чтобы переделать последний коммит, например разбить его на два.

### Вы случайно выполнили git add config.yml. Какой командой убрать файл из индекса, не теряя изменений?
= git restore --staged config.yml
= git reset config.yml
= git reset HEAD config.yml
> Современный вариант — `git restore --staged`. `git status` сам подсказывает эту команду.

### Чем git diff отличается от git diff --staged?
- [ ] git diff показывает изменения на сервере
- [x] git diff сравнивает рабочий каталог с индексом, а git diff --staged — индекс с последним коммитом
- [ ] git diff --staged показывает только удалённые файлы
- [ ] Ничем
> Перед коммитом полезно запускать `git diff --staged`: это ровно то, что попадёт в коммит.

### Чем аннотированный тег отличается от легковесного?
- [ ] Аннотированный можно перемещать между коммитами
- [x] Аннотированный — полноценный объект с автором, датой и сообщением, его используют для релизов; легковесный — просто указатель на коммит
- [ ] Легковесный тег занимает больше места
- [ ] Легковесный автоматически отправляется на сервер
> Создаётся флагом `-a`: `git tag -a v1.0 -m "..."`.

### Вы создали тег v1.0 и выполнили git push. Окажется ли тег на сервере?
- [ ] Да, теги всегда отправляются вместе с коммитами
- [x] Нет: теги нужно отправить явно — git push origin v1.0 или git push origin --tags
- [ ] Да, но только аннотированные
- [ ] Нет, на сервер теги отправить нельзя
> Частая причина, почему релизный пайплайн по тегу «не запустился».

### Что делает git commit --amend?
- [ ] Создаёт новую ветку из последнего коммита
- [x] Заменяет последний коммит новым: можно исправить сообщение или добавить забытые файлы
- [ ] Отменяет последний коммит на сервере
- [ ] Объединяет все коммиты ветки
> Коммит получает новый хеш, поэтому amend делают только для ещё не отправленных коммитов.

### Изменения не готовы к коммиту, а нужно срочно переключиться на другую ветку. Что подойдёт лучше всего?
- [ ] git reset --hard
- [x] git stash, переключиться, а потом вернуть работу через git stash pop
- [ ] Удалить файлы и написать заново
- [ ] git push --force
> stash сохраняет незакоммиченные изменения в отдельном хранилище и очищает рабочий каталог.

### После git reset --hard «пропал» нужный коммит. Как его найти?
- [ ] Никак, он удалён навсегда
- [x] Через git reflog: найти хеш коммита и вернуться к нему или создать на нём ветку
- [ ] Через git stash list
- [ ] Только из резервной копии сервера
> reflog хранит историю перемещений HEAD. Коммиты удаляются сборщиком мусора далеко не сразу.

### Какой командой показать, что именно изменил конкретный коммит (сообщение и diff)?
= git show
> Например, `git show a1b2c3d`. Без аргумента — последний коммит.

### Каким флагом команды git tag создаётся аннотированный тег?
= -a
= --annotate
> Полная команда: `git tag -a v1.0 -m "Описание релиза"`.

### Что делает git stash pop?
- [ ] Удаляет все спрятанные изменения
- [x] Применяет последние спрятанные изменения и удаляет их из списка stash
- [ ] Показывает список спрятанного
- [ ] Отправляет stash на сервер
> `git stash apply` делает то же самое, но оставляет запись в списке.
