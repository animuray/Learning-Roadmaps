---
title: Git — ветки и слияние
slug: git-vetki-i-sliyanie
description: Что такое ветка и HEAD, merge и fast-forward, конфликты слияния, rebase и cherry-pick — и когда что использовать.
duration: 70
level: Основы
quizSize: 10
materials:
  - title: Pro Git — О ветвлении в двух словах
    url: https://git-scm.com/book/ru/v2/%D0%92%D0%B5%D1%82%D0%B2%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5-%D0%B2-Git-%D0%9E-%D0%B2%D0%B5%D1%82%D0%B2%D0%BB%D0%B5%D0%BD%D0%B8%D0%B8-%D0%B2-%D0%B4%D0%B2%D1%83%D1%85-%D1%81%D0%BB%D0%BE%D0%B2%D0%B0%D1%85
    type: книга
  - title: Pro Git — Основы ветвления и слияния
    url: https://git-scm.com/book/ru/v2/Ветвление-в-Git-Основы-ветвления-и-слияния
    type: книга
  - title: Pro Git — Перебазирование
    url: https://git-scm.com/book/ru/v2/%D0%92%D0%B5%D1%82%D0%B2%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5-%D0%B2-Git-%D0%9F%D0%B5%D1%80%D0%B5%D0%B1%D0%B0%D0%B7%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5
    type: книга
  - title: Atlassian — Сравнение слияния и перебазирования
    url: https://www.atlassian.com/ru/git/tutorials/merging-vs-rebasing
    type: статья
  - title: Документация git cherry-pick
    url: https://www.git-scm.com/docs/git-cherry-pick
    type: документация
  - title: Learn Git Branching — интерактивный тренажёр
    url: https://learngitbranching.js.org/
    type: тренажёр
---

# Git — ветки и слияние

Ветки позволяют вести несколько линий работы параллельно: в одной ветке вы делаете новую функциональность, в другой срочно чините прод, а `main` остаётся рабочей. В Git ветки дешёвые: создаются мгновенно, поэтому их заводят на каждую задачу.

## Что такое ветка и HEAD

- **Ветка** — это просто перемещаемый указатель на коммит. Когда вы делаете новый коммит, указатель текущей ветки сдвигается на него.
- **HEAD** — указатель «где я сейчас». Обычно он указывает на текущую ветку.

```bash
git branch                 # список локальных веток (* — текущая)
git branch feature/nginx   # создать ветку, но остаться на текущей
git switch feature/nginx   # переключиться
git switch -c fix/typo     # создать и сразу переключиться
git branch -d fix/typo     # удалить влитую ветку (-D — удалить принудительно)
```

Команды `git switch` и `git restore` появились в Git 2.23 вместо перегруженной `git checkout`. Старый вариант `git checkout -b имя` тоже работает, и его часто встречают в статьях.

> [!warning] Переключение ветки меняет файлы
> При `git switch` Git приводит рабочий каталог к состоянию целевой ветки. Незакоммиченные изменения, которые мешают переключению, сначала закоммитьте или спрячьте через `git stash` (см. [[Git — история, теги и отмена изменений]]).

## Слияние: merge

Вы закончили работу в `feature` и хотите влить её в `main`:

```bash
git switch main
git merge feature
```

Бывает два случая:

1. **Fast-forward.** Если в `main` не появилось новых коммитов после того, как от неё ответвилась `feature`, Git просто передвигает указатель `main` вперёд. Новый коммит не создаётся.
2. **Трёхстороннее слияние.** Если обе ветки ушли вперёд, Git берёт их общего предка и два последних коммита и создаёт **коммит слияния** (merge commit) с двумя родителями.

## Конфликт слияния

Конфликт возникает, когда обе ветки изменили **одни и те же строки** одного файла (или одна ветка изменила файл, а другая удалила). Git не может выбрать за вас и останавливается:

```
<<<<<<< HEAD
listen 80;
=======
listen 8080;
>>>>>>> feature
```

Что делать:

1. `git status` покажет файлы с конфликтами (both modified).
2. Отредактируйте файл: оставьте нужный вариант и удалите маркеры `<<<<<<<`, `=======`, `>>>>>>>`.
3. `git add файл` — пометить конфликт решённым.
4. `git commit` (или `git merge --continue`) — завершить слияние.

Если всё пошло не так — `git merge --abort` вернёт состояние до слияния.

## Перебазирование: rebase

`rebase` решает ту же задачу, что и `merge` — интеграцию изменений, — но иначе. Он берёт ваши коммиты и по одному **заново применяет** их поверх другой ветки:

```bash
git switch feature
git rebase main        # переиграть коммиты feature поверх свежей main
```

Результат — линейная история без коммитов слияния. Но коммиты получаются **новыми** — с другими хешами.

> [!danger] Золотое правило rebase
> Не перебазируйте коммиты, которые уже отправлены в общий репозиторий и на которых работают другие. Иначе у коллег окажутся «старые» версии коммитов, и история разойдётся. Rebase своей локальной или личной feature-ветки — нормальная практика.

При конфликте во время rebase: исправить файл → `git add` → `git rebase --continue`. Отменить — `git rebase --abort`.

**Интерактивный rebase** `git rebase -i HEAD~3` открывает список трёх последних коммитов. Их можно объединить (`squash`, `fixup`), переименовать (`reword`) или удалить (`drop`). Так приводят историю в порядок перед pull или merge request.

| | merge | rebase |
| --- | --- | --- |
| История | Сохраняется как была, плюс коммит слияния | Линейная, коммиты переписаны |
| Хеши коммитов | Не меняются | Меняются |
| Для общих веток | Безопасно | Только для своих, ещё не опубликованных коммитов |

## Перенос отдельных коммитов: cherry-pick

`git cherry-pick <хеш>` применяет изменения указанного коммита к текущей ветке и создаёт **новый** коммит. Это ответ на частый вопрос с собеседования «как перенести коммиты из одной ветки в другую».

```bash
git switch release/1.2
git cherry-pick a1b2c3d            # один коммит
git cherry-pick a1b2c3d e4f5a6b    # несколько
```

Типичный сценарий: исправление сделали в `main`, и его нужно перенести в ветку старого релиза.

## Практика

- [ ] Пройти первые уровни на learngitbranching.js.org: коммиты, ветки, merge, rebase
- [ ] В своём репозитории создать ветку, сделать в ней 2 коммита и влить в main через merge — посмотреть `git log --graph`
- [ ] Специально устроить конфликт: изменить одну и ту же строку в двух ветках, слить их и разрешить конфликт руками
- [ ] Повторить то же через rebase и сравнить графы истории
- [ ] Перенести один коммит в другую ветку через `git cherry-pick`
- [ ] Объединить 3 коммита в один через `git rebase -i`

## Лаборатория

```bash setup
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
```

### Влить ветку

В репозитории `~/shop` есть ветка `feature/cart` с двумя коммитами. Влейте её в `main`.

```bash setup
rm -rf /home/student/shop
su - student -c 'bash -s' <<'EOF'
mkdir ~/shop && cd ~/shop && git init -q -b main
echo "shop" > README.md && git add . && git commit -qm "Init"
git switch -qc feature/cart
echo "cart = []" > cart.py && git add . && git commit -qm "Add cart"
echo "def add(item): cart.append(item)" >> cart.py && git commit -qam "Add item to cart"
git switch -q main
echo "Магазин" >> README.md && git commit -qam "Readme"
EOF
```

```bash check
r=/home/student/shop
[ "$(git -C $r branch --show-current)" = main ] || fail "Сейчас выбрана ветка «$(git -C $r branch --show-current)», а не main"
git -C $r merge-base --is-ancestor feature/cart main || fail "Коммиты feature/cart ещё не в main"
git -C $r show main:cart.py >/dev/null 2>&1 || fail "В main нет cart.py"
[ -z "$(git -C $r status --porcelain)" ] || fail "Слияние не завершено: есть незакоммиченные изменения"
ok "$(git -C $r log --oneline --graph -6 | tr '\n' ';')"
```

```text hint
1. Перейти на ветку, В КОТОРУЮ вливаем.
2. Выполнить слияние, указав ветку, КОТОРУЮ вливаем.
3. Посмотреть граф истории — там должен появиться коммит слияния.
```

```bash solution
cd ~/shop
git switch main
git merge --no-edit feature/cart
```

```text review
Эталон: `git switch main && git merge feature/cart`.

- В `main` после ответвления был свой коммит, поэтому Git создал **коммит слияния** с двумя родителями. Если бы main не менялся, произошёл бы fast-forward — указатель просто сдвинулся бы вперёд.
- `git log --oneline --graph --all` — лучший способ увидеть, что произошло.
- В командах обычно не вливают руками в main, а открывают Pull Request: там проходит ревью и CI, а сливает платформа.
- После слияния ветку удаляют: `git branch -d feature/cart` (с `-d` Git не даст удалить невлитую ветку).
```

```text notes
git\s+checkout\s+feature/cart[\s\S]*git\s+merge\s+main => main вливался в feature/cart, а нужно было наоборот. Сначала переходят на ветку-получатель, затем merge ветки-источника.
```

### Разрешить конфликт

В `~/pricing` ветки `main` и `feature/price` по-разному поменяли одну и ту же строку `price.txt`. Влейте `feature/price` в `main` и разрешите конфликт так, чтобы в итоге в файле была цена из `feature/price`. В файле не должно остаться служебных пометок конфликта.

```bash setup
rm -rf /home/student/pricing
su - student -c 'bash -s' <<'EOF'
mkdir ~/pricing && cd ~/pricing && git init -q -b main
printf 'product=coffee\nprice=100\n' > price.txt && git add . && git commit -qm "Init"
git switch -qc feature/price
sed -i 's/price=100/price=120/' price.txt && git commit -qam "Raise price to 120"
git switch -q main
sed -i 's/price=100/price=110/' price.txt && git commit -qam "Raise price to 110"
EOF
```

```bash check
r=/home/student/pricing
[ -f $r/.git/MERGE_HEAD ] && fail "Слияние начато, но не завершено"
git -C $r merge-base --is-ancestor feature/price main || fail "feature/price ещё не влита в main"
[ "$(git -C $r rev-list --count --merges main)" -ge 1 ] || fail "В main нет коммита слияния"
c=$(git -C $r show main:price.txt)
echo "$c" | grep -qE '^(<<<<<<<|=======|>>>>>>>)' && fail "В закоммиченном price.txt остались пометки конфликта"
[ "$c" = "$(printf 'product=coffee\nprice=120')" ] || fail "В price.txt не та цена или лишние строки. Сейчас в main:
$c"
ok "конфликт разрешён: $(echo $c)"
```

```text hint
1. Начать слияние — Git остановится и сообщит о конфликте.
2. Открыть файл: спорная часть обрамлена служебными строками из угловых скобок и знаков равенства. Оставить нужный вариант, служебные строки удалить.
3. Отметить конфликт решённым (добавить файл в индекс) и завершить слияние коммитом.
```

```bash solution
cd ~/pricing
git merge feature/price || true
printf 'product=coffee\nprice=120\n' > price.txt
git add price.txt
git commit --no-edit
```

```text review
Эталон: `git merge feature/price` → правка `price.txt` → `git add` → `git commit`.

- Конфликт — не ошибка, а вопрос к человеку: Git не знает, какая цена верная.
- Пометки: между `<<<<<<< HEAD` и `=======` — версия текущей ветки, между `=======` и `>>>>>>> feature/price` — вливаемой.
- Взять одну сторону целиком: `git checkout --theirs price.txt` (или `--ours`), затем `git add`.
- Передумали: `git merge --abort` возвращает всё как было до слияния.
- Чем меньше и чаще слияния, тем меньше конфликтов: короткоживущие ветки — основа trunk-based разработки.
```

```text notes
git\s+add\s+-A[\s\S]*commit|git\s+commit\s+-a => Проверьте перед коммитом, что в файлах не осталось строк <<<<<<< и >>>>>>>: git diff --check их находит.
```

### Перебазировать ветку

В `~/api` ветка `feature/api` отстала от `main`: в `main` появились новые коммиты. Перенесите коммиты `feature/api` **поверх** актуального `main`, чтобы история ветки стала линейной — **без коммитов слияния**.

```bash setup
rm -rf /home/student/api
su - student -c 'bash -s' <<'EOF'
mkdir ~/api && cd ~/api && git init -q -b main
echo "v1" > version.txt && git add . && git commit -qm "Init"
git switch -qc feature/api
echo "GET /users" > routes.txt && git add . && git commit -qm "Add users route"
echo "GET /orders" >> routes.txt && git commit -qam "Add orders route"
git switch -q main
echo "license MIT" > LICENSE && git add . && git commit -qm "Add license"
echo "v2" > version.txt && git commit -qam "Bump version"
git switch -q feature/api
EOF
```

```bash check
r=/home/student/api
[ -d $r/.git/rebase-merge ] || [ -d $r/.git/rebase-apply ] && fail "Перебазирование не завершено"
git -C $r merge-base --is-ancestor main feature/api || fail "feature/api не содержит последних коммитов main — ветка всё ещё отстаёт"
[ -z "$(git -C $r rev-list --merges main..feature/api)" ] || fail "В feature/api есть коммит слияния — история не линейная"
[ "$(git -C $r rev-list --count main..feature/api)" = 2 ] || fail "Поверх main должно быть ровно 2 коммита ветки, а их $(git -C $r rev-list --count main..feature/api)"
git -C $r show feature/api:routes.txt | grep -q orders || fail "Потерялись изменения ветки в routes.txt"
ok "$(git -C $r log --oneline feature/api | tr '\n' ';')"
```

```text hint
Находясь в ветке feature/api, «пересадите» её коммиты на текущую вершину main. Это не слияние: коммиты ветки будут пересозданы поверх main, и история станет прямой линией.
```

```bash solution
cd ~/api
git switch feature/api
git rebase main
```

```text review
Эталон: `git switch feature/api && git rebase main`.

- rebase пересоздаёт коммиты ветки поверх main — у них новые хеши. Поэтому **публичные** ветки, с которыми работают другие, не перебазируют: после этого нужен `git push --force-with-lease`, и у коллег всё разъедется.
- Обычная практика: перед Pull Request подтянуть main через rebase в своей ветке — история в PR будет чистой.
- `git pull --rebase` (или `git config --global pull.rebase true`) — то же самое при обновлении ветки с сервера, без лишних merge-коммитов «Merge branch main».
- Застряли в конфликте посреди rebase: исправить, `git add`, `git rebase --continue`; передумали — `git rebase --abort`.
```

```text notes
git\s+merge\s+main => В ветку влили main через merge — появится коммит слияния. Задача была получить линейную историю: для этого rebase.
```

### Забрать один коммит

В `~/site` ветка `hotfix` содержит три коммита. Нужен только один — «Fix typo in README». Перенесите **только его** в `main`, остальные изменения `hotfix` в `main` попасть не должны.

```bash setup
rm -rf /home/student/site
su - student -c 'bash -s' <<'EOF'
mkdir ~/site && cd ~/site && git init -q -b main
printf 'Wellcome to site\n' > README.md && echo "debug=false" > app.conf && git add . && git commit -qm "Init"
git switch -qc hotfix
echo "debug=true" > app.conf && git commit -qam "Enable debug (temporary)"
printf 'Welcome to site\n' > README.md && git commit -qam "Fix typo in README"
echo "experimental=1" >> app.conf && git commit -qam "Experimental flag"
git switch -q main
EOF
```

```bash check
r=/home/student/site
[ -f $r/.git/CHERRY_PICK_HEAD ] && fail "Перенос начат, но не завершён"
git -C $r log --format=%s main | grep -qx "Fix typo in README" || fail "В main нет коммита «Fix typo in README»"
[ "$(git -C $r show main:README.md)" = "Welcome to site" ] || fail "README.md в main не исправлен"
[ "$(git -C $r show main:app.conf)" = "debug=false" ] || fail "В main попали изменения app.conf из других коммитов hotfix — их переносить было не нужно"
git -C $r merge-base --is-ancestor hotfix main && fail "Ветка hotfix влита в main целиком"
ok "$(git -C $r log --oneline main | tr '\n' ';')"
```

```text hint
1. Узнать хеш нужного коммита в истории ветки hotfix.
2. Перейти в main.
3. Есть команда, которая повторяет изменения одного выбранного коммита в текущей ветке («сорвать вишенку»).
```

```bash solution
cd ~/site
git switch main
git cherry-pick "$(git log hotfix --format='%H %s' | grep 'Fix typo' | cut -d' ' -f1)"
```

```text review
Эталон: `git log --oneline hotfix` → `git switch main` → `git cherry-pick <хеш>`.

- cherry-pick создаёт в текущей ветке **новый** коммит с теми же изменениями и сообщением (хеш другой).
- Типичный случай: исправление сделали в ветке разработки, а нужно срочно выпустить его в релизной ветке.
- `git cherry-pick -x` добавит в сообщение строку «cherry picked from commit …» — потом видно, откуда пришёл коммит.
- Если переносить нужно много коммитов, это сигнал, что ветки устроены неудачно: возможно, нужен был merge или rebase.
```

```text notes
git\s+merge\s+hotfix => Ветка hotfix вливалась целиком — вместе с отладочным флагом и экспериментом. Для одного коммита нужен cherry-pick.
```

## Тест

### Что такое ветка в Git?
- [ ] Полная копия всех файлов проекта
- [x] Перемещаемый указатель на коммит
- [ ] Отдельный репозиторий на сервере
- [ ] Список изменённых файлов
> Именно поэтому ветки в Git создаются мгновенно и почти не занимают места.

### Что такое HEAD?
- [ ] Самый первый коммит репозитория
- [x] Указатель на то, где вы сейчас находитесь, — обычно на текущую ветку
- [ ] Главная ветка проекта на сервере
- [ ] Последний коммит в ветке main
> Когда вы переключаете ветку, меняется HEAD.

### Какой командой создать ветку feature и сразу на неё переключиться?
= git switch -c feature
= git checkout -b feature
> `git switch -c` — современный вариант, `git checkout -b` — классический.

### Когда слияние проходит как fast-forward?
- [ ] Когда в ветках нет конфликтов
- [x] Когда в целевой ветке нет новых коммитов с момента ответвления, и указатель можно просто передвинуть вперёд
- [ ] Когда используется флаг --fast
- [ ] Всегда при слиянии в main
> При fast-forward коммит слияния не создаётся. Если нужен всегда, есть флаг `--no-ff`.

### Что такое merge conflict и почему он возникает?
- [ ] Ошибка сети при push
- [x] Ситуация, когда обе ветки изменили одни и те же строки файла (или одна изменила файл, а другая удалила), и Git не может решить, что оставить
- [ ] Попытка слить ветку саму в себя
- [ ] Повреждение репозитория
> Ещё один частый вопрос на собеседованиях. Конфликты решаются руками, затем `git add` и коммит.

### Вы исправили конфликтующий файл и убрали маркеры. Что дальше?
- [ ] git push --force
- [x] git add файл, затем git commit (или git merge --continue)
- [ ] git reset --hard
- [ ] Ничего, Git сам заметит изменения
> `git add` сообщает Git, что конфликт в этом файле разрешён.

### Какие маркеры Git вставляет в файл при конфликте?
- [x] `<<<<<<<`
- [x] `=======`
- [x] `>>>>>>>`
- [ ] `#######`
> Между `<<<<<<<` и `=======` — ваша версия (HEAD), между `=======` и `>>>>>>>` — вливаемая.

### Чем rebase отличается от merge?
- [ ] rebase работает только с удалёнными ветками
- [x] rebase заново применяет коммиты поверх другой ветки: история становится линейной, а коммиты получают новые хеши; merge сохраняет историю и добавляет коммит слияния
- [ ] merge удаляет историю ветки
- [ ] Ничем, это синонимы
> Обе команды интегрируют изменения из одной ветки в другую, но по-разному обращаются с историей.

### Что гласит «золотое правило» rebase?
- [ ] Всегда делать rebase перед каждым коммитом
- [x] Не перебазировать коммиты, которые уже опубликованы в общем репозитории и с которыми работают другие
- [ ] Использовать rebase только в ветке main
- [ ] После rebase обязательно удалять ветку
> Rebase переписывает коммиты, и у коллег история разойдётся с вашей.

### Исправление лежит в ветке main коммитом a1b2c3d. Его нужно перенести в ветку release/1.2, не вливая всю main. Как?
- [ ] git merge main из ветки release/1.2
- [x] Переключиться на release/1.2 и выполнить git cherry-pick a1b2c3d
- [ ] git rebase release/1.2
- [ ] Скопировать файлы вручную и сделать git push --force
> cherry-pick создаёт в текущей ветке новый коммит с теми же изменениями.

### Вы запутались в конфликтах посреди слияния. Какой командой вернуть всё к состоянию до merge?
= git merge --abort
> Для rebase аналог — `git rebase --abort`.

### Что делает git rebase -i HEAD~3?
- [ ] Удаляет три последних коммита
- [x] Открывает интерактивный список трёх последних коммитов: их можно объединить, переименовать, переупорядочить или удалить
- [ ] Переносит ветку на три коммита назад
- [ ] Показывает три последних коммита
> Так перед merge request объединяют коммиты вида «fix», «fix 2», «опечатка» в один осмысленный.

### git branch -d feature выдаёт ошибку «not fully merged». Что это значит?
- [ ] Ветки feature не существует
- [x] В ветке есть коммиты, которые не влиты в текущую ветку; удалить принудительно можно через -D, но эти коммиты могут потеряться
- [ ] У вас нет прав на удаление
- [ ] Нужно сначала удалить ветку на сервере
> Git защищает от потери работы. Перед `-D` проверьте, что эти коммиты точно не нужны.
