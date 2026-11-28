---
title: Git — удалённые репозитории
slug: git-udalennye-repozitorii
description: GitHub и GitLab, clone, push, pull и fetch, ветки удалённого отслеживания и вход по SSH-ключу.
duration: 50
level: Основы
quizSize: 10
materials:
  - title: Pro Git — Работа с удалёнными репозиториями
    url: https://git-scm.com/book/ru/v2/Основы-Git-Работа-с-удалёнными-репозиториями
    type: книга
  - title: Pro Git — Удалённые ветки
    url: https://git-scm.com/book/ru/v2/%D0%92%D0%B5%D1%82%D0%B2%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5-%D0%B2-Git-%D0%A3%D0%B4%D0%B0%D0%BB%D1%91%D0%BD%D0%BD%D1%8B%D0%B5-%D0%B2%D0%B5%D1%82%D0%BA%D0%B8
    type: книга
  - title: Pro Git — Команды совместной работы (fetch, pull, push)
    url: https://git-scm.com/book/ru/v2/Приложение-C:-Команды-Git-Совместная-работа-и-обновление-проектов
    type: книга
  - title: GitHub Docs — Управление удалёнными репозиториями
    url: https://docs.github.com/ru/get-started/git-basics/managing-remote-repositories
    type: документация
  - title: GitHub Docs — Generating a new SSH key
    url: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent
    type: документация
---

# Git — удалённые репозитории

Локальный репозиторий хорош, пока вы работаете один и ваш диск жив. Чтобы делиться кодом, делать бэкап и запускать CI/CD, нужен **удалённый репозиторий** (remote) — копия на сервере: GitHub, GitLab, Bitbucket или свой GitLab в компании.

> [!note] Git и GitHub — не одно и то же
> Git — программа на вашем компьютере. GitHub и GitLab — сервисы, которые хранят Git-репозитории и добавляют к ним веб-интерфейс, pull и merge request, задачи, CI/CD и registry.

## Подключить удалённый репозиторий

Есть два пути.

**1. Склонировать готовый:**

```bash
git clone git@github.com:user/project.git
```

`git clone` создаёт каталог, инициализирует в нём репозиторий, добавляет удалённый репозиторий с именем **origin**, скачивает всю историю и переключает вас на ветку по умолчанию.

**2. Привязать существующий локальный проект:**

```bash
git remote add origin git@github.com:user/notes.git
git remote -v                # список удалённых репозиториев и их адресов
git push -u origin main      # отправить ветку и запомнить связь
```

## fetch, pull и push

| Команда | Что делает |
| --- | --- |
| `git fetch` | Скачивает новые коммиты с сервера в ветки удалённого отслеживания (`origin/main`). Ваши ветки и файлы **не меняются** |
| `git pull` | `git fetch` + слияние скачанного в текущую ветку (`git merge`). С флагом `--rebase` — перебазирование вместо слияния |
| `git push` | Отправляет ваши коммиты на сервер |

**Ветки удалённого отслеживания** (`origin/main`, `origin/feature`) — это закладки: «вот где была ветка на сервере, когда я последний раз делал fetch». Их нельзя редактировать напрямую, они двигаются только при fetch или pull.

```bash
git fetch
git log --oneline main..origin/main   # что пришло с сервера и ещё не влито к вам
git pull                              # влить
```

> [!important] Частый вопрос на собеседовании: как работает git pull?
> `git pull` = `git fetch` (забрать изменения) + `git merge origin/<ветка>` (влить в текущую). Если настроить `git pull --rebase` или `pull.rebase=true`, вместо merge будет rebase.

## Когда push отклонён

```
! [rejected]        main -> main (fetch first)
error: failed to push some refs
```

Это значит, что на сервере есть коммиты, которых нет у вас: кто-то запушил раньше. Сделайте `git pull` (или `git pull --rebase`), разрешите конфликты, если они есть, и снова `git push`.

> [!danger] git push --force в общую ветку
> `--force` перезаписывает историю на сервере. Коммиты коллег, которых не было у вас, пропадут. Если перезаписать историю действительно нужно (например, в своей feature-ветке после rebase), используйте `git push --force-with-lease`: он откажется, если на сервере появились чужие коммиты.

## Флаг -u и upstream

`git push -u origin feature` отправляет ветку и запоминает её «пару» на сервере (upstream). Дальше в этой ветке достаточно писать просто `git push` и `git pull`.

## Аутентификация: SSH или HTTPS

- **HTTPS** (`https://github.com/user/repo.git`). Пароль от аккаунта GitHub для операций Git больше не принимается: вместо него вводят **personal access token** или используют менеджер учётных данных.
- **SSH** (`git@github.com:user/repo.git`). Вы один раз создаёте пару ключей и добавляете **публичный** ключ в настройки GitHub или GitLab. Это удобнее и безопаснее.

```bash
ssh-keygen -t ed25519 -C "ivan@example.com"   # создать пару ключей
cat ~/.ssh/id_ed25519.pub                     # публичный ключ — его копируем в GitHub или GitLab
ssh -T git@github.com                         # проверить подключение
```

Приватный ключ (`~/.ssh/id_ed25519`) никому не отдаётся и никуда не копируется. Подробнее о ключах — в теме [[SSH]].

## Практика

- [ ] Зарегистрироваться на GitHub или GitLab и создать пустой репозиторий — он станет вашим конспектом на весь путь
- [ ] Создать SSH-ключ ed25519, добавить публичную часть в аккаунт и проверить `ssh -T git@github.com`
- [ ] Привязать локальный репозиторий из прошлой темы через `git remote add origin` и выполнить `git push -u origin main`
- [ ] Изменить файл прямо в веб-интерфейсе GitHub, затем локально сделать `git fetch`, посмотреть `git log main..origin/main` и выполнить `git pull`
- [ ] Специально получить отказ push: изменить файл и на сайте, и локально, закоммитить и запушить локальные изменения, разобраться и починить

## Лаборатория

Вместо GitHub здесь «сервер» — голый (bare) репозиторий в `/srv/git/`: работает он точно так же, только адрес — путь на диске, а не `git@github.com:...`.

```bash setup
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
mkdir -p /srv/git
```

### Отправить проект на сервер

В `~/notes` — локальный репозиторий с двумя коммитами. На сервере для него создан пустой репозиторий `/srv/git/notes.git`. Подключите его как удалённый репозиторий `origin` и отправьте туда ветку `main` так, чтобы дальше `git push` и `git pull` в этом репозитории работали **без аргументов**.

```bash setup
rm -rf /home/student/notes /srv/git/notes.git
git init -q --bare -b main /srv/git/notes.git
chown -R student:student /srv/git/notes.git
su - student -c 'bash -s' <<'EOF'
mkdir ~/notes && cd ~/notes && git init -q -b main
echo "# Конспект" > README.md && git add . && git commit -qm "Init notes"
echo "## Git" >> README.md && git commit -qam "Add Git section"
EOF
```

```bash check
r=/home/student/notes
url=$(git -C $r remote get-url origin 2>/dev/null) || fail "У репозитория ~/notes нет удалённого репозитория origin"
case "$url" in
  /srv/git/notes.git|/srv/git/notes.git/|file:///srv/git/notes.git|file:///srv/git/notes.git/) ;;
  *) fail "origin указывает на «$url», а не на /srv/git/notes.git" ;;
esac
[ "$(git -C /srv/git/notes.git rev-parse -q --verify refs/heads/main)" = "$(git -C $r rev-parse main)" ] || fail "На сервере нет ветки main с вашими коммитами"
[ "$(git -C $r config branch.main.remote)" = origin ] && [ "$(git -C $r config branch.main.merge)" = refs/heads/main ] || fail "Ветка main не связана с веткой на сервере: git push и git pull без аргументов не знают, куда отправлять и откуда забирать"
ok "$(git -C $r branch -vv | tr -s ' ')"
```

```text hint
1. Добавить удалённый репозиторий под именем origin, указав путь к репозиторию на сервере.
2. Отправить ветку main и одновременно запомнить связь локальной ветки с веткой на сервере — у команды отправки есть для этого короткий ключ.
3. Посмотреть, с какой веткой сервера теперь связана локальная (подробный список веток).
```

```bash solution
cd ~/notes
git remote add origin /srv/git/notes.git
git push -u origin main
```

```text review
Эталон: `git remote add origin /srv/git/notes.git && git push -u origin main`.

- `-u` (`--set-upstream`) запоминает **upstream**: локальная `main` теперь отслеживает `origin/main`. Поэтому дальше хватает `git push` и `git pull`, а `git status` пишет «ahead 1» / «behind 2».
- Посмотреть связи: `git branch -vv`; удалённые репозитории: `git remote -v`.
- На GitHub адрес будет `git@github.com:login/notes.git` (SSH) или `https://github.com/login/notes.git` (HTTPS). Для SSH нужен ключ в аккаунте, для HTTPS — токен вместо пароля.
- Ошиблись в адресе — `git remote set-url origin <новый адрес>`, удалять и добавлять заново не нужно.
```

```text notes
branch\s+(--set-upstream-to|-u)\b => Связь с веткой сервера задана отдельной командой — так тоже можно, но обычно хватает одного git push -u origin main при первой отправке.
```

### Забрать изменения коллеги

Репозиторий `~/app` склонирован с сервера `/srv/git/app.git`. С тех пор коллега отправил на сервер новые коммиты. Сначала **посмотрите**, что именно пришло, и только потом обновите свою ветку `main`. Коммитов слияния в истории появиться не должно.

```bash setup
rm -rf /home/student/app /srv/git/app.git /tmp/lab-colleague
git init -q --bare -b main /srv/git/app.git
git clone -q /srv/git/app.git /tmp/lab-colleague 2>/dev/null
cd /tmp/lab-colleague
git config user.name "Анна" && git config user.email anna@team.local
echo "app v1" > app.txt && git add . && git commit -qm "Init app" && git push -q origin main
chown -R student:student /srv/git/app.git
su - student -c 'git clone -q /srv/git/app.git ~/app'
echo "timeout=30" > config.txt && git add . && git commit -qm "Add config"
echo "app v2" > app.txt && git commit -qam "Release v2" && git push -q origin main
cd / && rm -rf /tmp/lab-colleague
chown -R student:student /srv/git/app.git
```

```bash check
r=/home/student/app
remote=$(git -C /srv/git/app.git rev-parse main)
[ "$(git -C $r rev-parse main)" = "$remote" ] || fail "Ветка main в ~/app отстаёт от main на сервере"
[ -z "$(git -C $r rev-list --merges main)" ] || fail "В истории появился коммит слияния"
[ -z "$(git -C $r status --porcelain)" ] || fail "В ~/app есть незакоммиченные изменения"
ok "$(git -C $r log --oneline -3 | tr '\n' ';')"
```

```text hint
1. Скачать новые коммиты с сервера, не трогая свою ветку.
2. Посмотреть коммиты, которые есть в ветке сервера, но нет в локальной (диапазон «локальная..серверная»), и их изменения.
3. Обновить локальную ветку. Своих коммитов у вас нет, поэтому ветка может просто «перемотаться» вперёд.
```

```bash solution
cd ~/app
git fetch
git log --oneline main..origin/main
git pull --ff-only
```

```text review
Эталон: `git fetch` → `git log main..origin/main` (и `git diff main origin/main`) → `git pull --ff-only`.

- `git pull` = `git fetch` + слияние. Разделять их полезно: сначала видно, **что** придёт, и только потом это попадает в рабочий каталог.
- Здесь у вас не было своих коммитов, поэтому вышел fast-forward: указатель `main` просто передвинулся. `--ff-only` гарантирует, что pull не создаст коммит слияния, а остановится, если ветки разошлись.
- Многие ставят `git config --global pull.ff only` или `pull.rebase true`, чтобы случайные «Merge branch 'main' of …» не засоряли историю.
```

```text notes
reset\s+--hard\s+origin => reset --hard origin/main тоже выравнивает ветку, но молча выбросил бы ваши локальные коммиты и правки, если бы они были. Для обновления — git pull --ff-only.
```

### Push отклонён

В `~/site` вы закоммитили изменение главной страницы. Пока вы работали, коллега отправил на сервер свой коммит «Add news», и теперь `git push` отклоняется. Отправьте свой коммит на сервер так, чтобы коммит коллеги **не потерялся**, а история `main` осталась **линейной** — без коммита слияния.

```bash setup
rm -rf /home/student/site /srv/git/site.git /tmp/lab-colleague
git init -q --bare -b main /srv/git/site.git
git clone -q /srv/git/site.git /tmp/lab-colleague 2>/dev/null
cd /tmp/lab-colleague
git config user.name "Борис" && git config user.email boris@team.local
echo "<h1>Сайт</h1>" > index.html && git add . && git commit -qm "Init site" && git push -q origin main
chown -R student:student /srv/git/site.git
su - student -c 'git clone -q /srv/git/site.git ~/site && cd ~/site && echo "<h1>Наш сайт</h1>" > index.html && git commit -qam "Update homepage"'
echo "Открылись!" > news.txt && git add . && git commit -qm "Add news" && git push -q origin main
cd / && rm -rf /tmp/lab-colleague
chown -R student:student /srv/git/site.git
```

```bash check
b=/srv/git/site.git
r=/home/student/site
git -C $b log --format=%s main | grep -qx "Add news" || fail "На сервере пропал коммит коллеги «Add news»"
git -C $b log --format=%s main | grep -qx "Update homepage" || fail "Вашего коммита «Update homepage» на сервере нет"
[ -z "$(git -C $b rev-list --merges main)" ] || fail "В main на сервере есть коммит слияния — история не линейная"
[ "$(git -C $r rev-parse main)" = "$(git -C $b rev-parse main)" ] || fail "Локальная main и main на сервере различаются"
ok "$(git -C $b log --oneline main | tr '\n' ';')"
```

```text hint
1. Попробовать отправить и прочитать, почему сервер отказал.
2. Забрать коммит коллеги так, чтобы ваш коммит «переехал» поверх него, а не склеился с ним коммитом слияния.
3. Отправить снова. Перезаписывать ветку на сервере силой нельзя — пропадёт чужая работа.
```

```bash solution
cd ~/site
git pull --rebase
git push
```

```text review
Эталон: `git pull --rebase && git push`.

- Push отклоняется (`rejected — fetch first`), когда на сервере есть коммиты, которых нет у вас: иначе сервер потерял бы их.
- `pull --rebase` забирает чужие коммиты и пересоздаёт ваши поверх них — история остаётся прямой линией. Обычный `pull` создал бы коммит «Merge branch 'main' of …».
- **Никогда** не чините отказ через `git push --force` в общей ветке: коммит коллеги исчезнет с сервера. Если перезапись действительно нужна (своя ветка после rebase) — `--force-with-lease`, он откажет, если на сервере появилось что-то новое.
- Был бы конфликт — rebase остановится: исправить файлы, `git add`, `git rebase --continue`.
```

```text notes
push\s+[^\n]*(--force\b|\s-f\b) => Использовался force-push. В общей ветке так теряют чужие коммиты; даже в своей ветке безопаснее --force-with-lease.
git\s+merge\s+origin => Ветка сервера вливалась через merge — для линейной истории нужен rebase (git pull --rebase).
```

## Тест

### Что делает git clone?
- [ ] Скачивает только последнюю версию файлов без истории
- [x] Копирует репозиторий со всей историей, настраивает удалённый репозиторий origin и переключает на ветку по умолчанию
- [ ] Создаёт пустой репозиторий на сервере
- [ ] Делает копию текущей ветки в новую ветку
> У вас оказывается полная копия проекта, с которой можно работать без сети.

### Как работает git pull?
- [ ] Отправляет локальные коммиты на сервер
- [x] Выполняет git fetch, а затем вливает полученное в текущую ветку через merge (или rebase, если так настроено)
- [ ] Удаляет локальные изменения и заменяет их серверными
- [ ] Только скачивает изменения, не трогая ветки
> Популярный вопрос на собеседовании. Ответ: pull = fetch + merge.

### Чем git fetch отличается от git pull?
- [ ] Ничем, это синонимы
- [x] fetch только скачивает новые коммиты в ветки удалённого отслеживания и не меняет ваши ветки и файлы
- [ ] fetch отправляет изменения на сервер
- [ ] fetch работает только с тегами
> fetch — безопасный способ посмотреть, что изменилось на сервере, перед слиянием.

### Какое имя по умолчанию получает удалённый репозиторий после git clone?
= origin
> Имя можно изменить, но origin — общепринятое соглашение.

### git push завершился ошибкой «rejected… fetch first». Что произошло и что делать?
- [ ] Нет прав на репозиторий, нужно создать новый
- [x] На сервере есть коммиты, которых нет у вас: нужно сделать git pull, при необходимости разрешить конфликты и повторить push
- [ ] Нужно сразу выполнить git push --force
- [ ] Репозиторий повреждён, его надо склонировать заново
> `--force` здесь стёр бы чужие коммиты. Правильный путь — сначала забрать изменения.

### Что делает флаг -u в git push -u origin feature?
- [ ] Обновляет все ветки сразу
- [x] Запоминает связь локальной ветки с веткой на сервере (upstream), чтобы потом писать просто git push и git pull
- [ ] Отправляет только неотслеживаемые файлы
- [ ] Удаляет ветку на сервере после отправки
> `-u` — сокращение от `--set-upstream`.

### Почему git push --force в общую ветку опасен?
- [ ] Он работает медленнее обычного push
- [x] Он перезаписывает историю на сервере, и коммиты коллег, которых не было у вас, пропадут
- [ ] Он удаляет локальный репозиторий
- [ ] Он отключает защиту ветки
> Если перезапись истории действительно нужна, есть более безопасный `--force-with-lease`.

### Какие способы аутентификации подходят для git push на GitHub?
- [x] SSH-ключ
- [x] Personal access token по HTTPS
- [ ] Пароль от аккаунта GitHub по HTTPS
- [ ] Логин без пароля
> Парольную аутентификацию для операций Git на GitHub отключили в пользу токенов и ключей.

### Какую часть SSH-ключа нужно добавить в настройки GitHub или GitLab?
- [ ] Приватный ключ id_ed25519
- [x] Публичный ключ id_ed25519.pub
- [ ] Обе части
- [ ] Файл known_hosts
> Приватный ключ никогда не покидает ваш компьютер. Сервер проверяет подпись по публичному.

### Какой командой посмотреть список удалённых репозиториев вместе с их адресами?
= git remote -v
> Каждый адрес выводится дважды: для fetch и для push.

### Что такое origin/main?
- [ ] Ваша локальная ветка main
- [x] Ветка удалённого отслеживания: положение ветки main на сервере на момент последнего fetch или pull
- [ ] Резервная копия ветки main
- [ ] Ветка, в которую нельзя коммитить никому
> Чтобы увидеть, что пришло с сервера, сравните: `git log main..origin/main`.

### Какой командой создать SSH-ключ современного типа ed25519?
= ssh-keygen -t ed25519
> Можно добавить `-C "почта"` — это просто комментарий-метка ключа.

### Вы сделали git fetch. Что изменилось в вашей рабочей ветке main и в файлах?
- [ ] Файлы обновились до серверной версии
- [x] Ничего: обновились только ветки удалённого отслеживания вроде origin/main
- [ ] Ветка main переключилась на origin/main
- [ ] Удалились незакоммиченные изменения
> Чтобы влить изменения, нужен `git merge origin/main` или `git pull`.
