---
title: Сломанный сервер — Linux основы
slug: slomannyj-server-linux-osnovy
description: Аварии уровня «основ Linux» без подсказок в условии — скрипт не запускается, команды пропали, приложению не хватает прав. Как читать ошибки оболочки и чинить, не открывая всё всем.
duration: 60
level: Практика
quizSize: 10
---

# Сломанный сервер — Linux основы

Аварии в этом разделе выглядят мелочами, но на них теряют часы: «скрипт не запускается», «команды не найдены», «Permission denied». Почти всегда ответ — в **тексте ошибки**, который нужно прочитать целиком.

## Как читать ошибки оболочки

| Сообщение | Что значит | Куда смотреть |
| --- | --- | --- |
| `command not found` | оболочка не нашла программу в `PATH` | `echo $PATH`, `type имя`, `command -v имя`, кто менял `PATH` (`~/.bashrc`, `~/.profile`, `/etc/profile.d/`) |
| `Permission denied` при запуске | нет права `x` у файла или каталога по пути, файловая система смонтирована `noexec` | `ls -l`, `namei -l путь`, `findmnt` |
| `bad interpreter: /bin/bash^M` | файл с концами строк Windows (CRLF) | `file скрипт`, `cat -A` (видно `^M$`) |
| `No such file or directory` у существующего скрипта | неверный путь в shebang | первая строка файла |
| `Permission denied` при записи | у пользователя процесса нет прав на файл или каталог | `id пользователь`, `namei -l путь`, `stat` |

## Правила починки

- **Не `chmod 777`.** Даёт запись всем — и вирусу, и соседнему процессу. Выдавайте право конкретному пользователю или группе: `chown`, `chgrp` + `chmod g+w`, ACL (`setfacl`).
- **Проверять под тем, кто работает.** «У меня от root работает» ничего не доказывает: `sudo -u app команда`, `su - dev -c '...'`.
- **Новый сеанс.** Правки `~/.bashrc` и `~/.profile` действуют в новом входе; проверяйте `su - пользователь`.

## Практика

- [ ] Пройти все задачи лаборатории, первые 10 минут — без подсказки
- [ ] Для каждой аварии записать в конспект: симптом → команды диагностики → причина → решение
- [ ] Сохранить скрипт с CRLF и посмотреть его через `file` и `cat -A`

## Лаборатория

### Скрипт с Windows-машины

Коллега прислал скрипт `~/deploy.sh`, написанный на Windows. Команда `./deploy.sh` в домашнем каталоге не работает. Сделайте так, чтобы `./deploy.sh` выполнялся и печатал `deploy ok`.

```bash setup
printf '#!/bin/bash\r\nset -e\r\necho "deploy ok"\r\n' > /home/student/deploy.sh
chmod 644 /home/student/deploy.sh
chown student:student /home/student/deploy.sh
```

```bash check
out=$(su - student -c 'cd ~ && ./deploy.sh' 2>&1)
[ "$out" = "deploy ok" ] || fail "./deploy.sh выдаёт: «$(echo "$out" | head -1 | cat -A | cut -c1-100)»"
grep -q $'\r' /home/student/deploy.sh && fail "В файле остались символы CR — на другой машине скрипт снова сломается"
ok "./deploy.sh → deploy ok"
```

```text hint
1. Запустить и прочитать ошибку. Исправить первую, запустить снова — ошибок может быть несколько.
2. Что это за файл и что в нём на самом деле (с невидимыми символами), покажут утилиты определения типа файла и вывода с отображением спецсимволов.
3. Невидимые символы в концах строк можно удалить потоковым редактором или утилитой преобразования из формата DOS.
```

```bash solution
cd ~
./deploy.sh || true
file deploy.sh
chmod +x deploy.sh
sed -i 's/\r$//' deploy.sh
./deploy.sh
```

```text review
Две причины: у файла нет права на выполнение (`Permission denied`) и концы строк Windows (`/bin/bash^M: bad interpreter`).

- `file deploy.sh` → «with CRLF line terminators», `cat -A` показывает `^M$` в конце строк. Лечится `sed -i 's/\r$//'` или `dos2unix`.
- Профилактика: `.gitattributes` с `*.sh text eol=lf` в репозитории и настройка редактора (LF для скриптов).
- Тот же CR ломает и конфиги (`nginx: unknown directive "listen\r"`), и переменные окружения из файлов.
```

### Пропали команды

У пользователя **`dev`** в новом сеансе не работают обычные команды: `ls`, `grep`, `cat` — «command not found». При этом его утилита **`devtool`** из `/opt/tools/bin` должна работать по имени. Почините окружение пользователя `dev` так, чтобы в новом сеансе работало и то, и другое.

```bash setup
id dev >/dev/null 2>&1 || useradd -m -s /bin/bash dev
mkdir -p /opt/tools/bin
printf '#!/bin/sh\necho "devtool ok"\n' > /opt/tools/bin/devtool && chmod 755 /opt/tools/bin/devtool
cp /etc/skel/.bashrc /home/dev/.bashrc
cp /etc/skel/.profile /home/dev/.profile
printf '\n# инструменты команды\nexport PATH=/opt/tools/bin\n' >> /home/dev/.bashrc
printf '\n# инструменты команды\nPATH=/opt/tools/bin\n' >> /home/dev/.profile
chown -R dev:dev /home/dev
```

```bash check
out=$(su - dev -c 'ls / >/dev/null && grep -q root /etc/passwd && cat /etc/hostname >/dev/null && echo base-ok' 2>&1)
[ "$out" = base-ok ] || fail "В новом сеансе dev обычные команды не работают: $(echo "$out" | head -1)"
out=$(su - dev -c 'devtool' 2>&1)
[ "$out" = "devtool ok" ] || fail "В новом сеансе dev команда devtool не находится по имени"
out=$(su - dev -c 'bash -ic "ls / >/dev/null && devtool"' 2>&1 | tail -1)
[ "$out" = "devtool ok" ] || fail "В интерактивной оболочке dev команды по-прежнему не работают"
ok "у dev работают и системные команды, и devtool"
```

```text hint
1. Войти под пользователем и посмотреть переменную со списком каталогов для поиска программ.
2. Найти, где её перезаписывают: файлы, которые читаются при входе и при запуске интерактивной оболочки.
3. Каталог нужно добавлять к существующему значению, а не заменять его.
```

```bash solution
sudo su - dev -c 'echo $PATH'
sudo grep -n PATH /home/dev/.bashrc /home/dev/.profile
sudo sed -i 's#^export PATH=/opt/tools/bin$#export PATH="$PATH:/opt/tools/bin"#' /home/dev/.bashrc
sudo sed -i 's#^PATH=/opt/tools/bin$#PATH="$PATH:/opt/tools/bin"#' /home/dev/.profile
sudo su - dev -c 'ls / >/dev/null && devtool'
```

```text review
Причина: в `~/.bashrc` и `~/.profile` переменную перезаписали — `PATH=/opt/tools/bin` вместо `PATH="$PATH:/opt/tools/bin"`. Остался один каталог, системные `/usr/bin` и `/bin` пропали.

- Даже в «сломанной» оболочке команды доступны по полному пути: `/usr/bin/ls`, `/usr/bin/vim ~/.bashrc` — так и чинят.
- Добавлять — в конец (`$PATH:новый`) или в начало (`новый:$PATH`, если нужно перекрыть системные версии).
- Для всех пользователей — файл в `/etc/profile.d/`, а не правка чужих `.bashrc`.
```

### Приложение не пишет лог

Приложение `/opt/app/run.sh` запускается от пользователя **`app`** и падает: не может записать лог в `/var/log/app/`. Сделайте так, чтобы `sudo -u app /opt/app/run.sh` отрабатывал успешно. Давать запись в каталог **всем** нельзя.

```bash setup
id app >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin app
mkdir -p /opt/app /var/log/app
cat > /opt/app/run.sh <<'EOF'
#!/bin/bash
set -e
echo "$(date -Is) app started" >> /var/log/app/app.log
echo "started"
EOF
chmod 755 /opt/app/run.sh
rm -f /var/log/app/app.log
chown root:root /var/log/app && chmod 755 /var/log/app
```

```bash check
out=$(sudo -u app /opt/app/run.sh 2>&1)
[ "$out" = started ] || fail "sudo -u app /opt/app/run.sh: «$(echo "$out" | head -1)»"
m=$(stat -c %a /var/log/app)
[ $(( 0$m & 2 )) = 0 ] || fail "Каталог /var/log/app доступен на запись всем (права $m)"
[ -f /var/log/app/app.log ] && [ $(( 0$(stat -c %a /var/log/app/app.log) & 2 )) = 0 ] || fail "Лог-файл доступен на запись всем"
ok "app пишет лог; права каталога $(stat -c '%U:%G %a' /var/log/app)"
```

```text hint
1. Запустить от нужного пользователя и прочитать ошибку: какой путь недоступен.
2. Посмотреть владельца и права на каждый каталог по пути — есть утилита, которая показывает их для всего пути разом.
3. Выдать право на запись именно этому пользователю: сменить владельца каталога (или группу и добавить группе запись).
```

```bash solution
sudo -u app /opt/app/run.sh || true
namei -l /var/log/app/app.log
sudo chown app:app /var/log/app
sudo -u app /opt/app/run.sh
```

```text review
Причина: каталог `/var/log/app` принадлежит root с правами 755 — пользователь app может читать, но не создавать в нём файлы.

- `namei -l путь` показывает владельца и права каждого компонента пути — быстрее, чем `ls -ld` по очереди.
- Правильно — владелец каталога = пользователь службы (`chown app:app`), либо группа + `chmod 2775`, либо ACL `setfacl -m u:app:rwx /var/log/app`. В systemd-юните ещё проще: `LogsDirectory=app` — systemd сам создаст каталог с нужным владельцем.
- `chmod 777` «починит», но откроет каталог всем процессам системы — так получают подмену логов и атаки через симлинки.
```

```text notes
chmod\s+(-R\s+)?(777|666|a\+w|o\+w) => Права открывались всем — так «чинить» нельзя: выдавайте запись конкретному пользователю или группе.
```

## Тест

### Скрипт падает с «/bin/bash^M: bad interpreter». В чём причина?
- [ ] В системе нет bash
- [x] Концы строк Windows (CRLF): символ CR стал частью пути к интерпретатору
- [ ] У скрипта нет права на выполнение
- [ ] Ошибка в синтаксисе скрипта
> CR (^M) в конце первой строки превращает путь в «/bin/bash\r». Лечится `sed -i 's/\r$//'` или `dos2unix`.

### Какой утилитой проверить, что в файле концы строк CRLF?
= file
= cat -A
> `file` пишет «with CRLF line terminators», `cat -A` показывает `^M$` в концах строк.

### В новом сеансе «ls: command not found». Как запустить ls, чтобы починить окружение?
- [ ] Никак — нужна перезагрузка
- [x] По полному пути: /usr/bin/ls
- [ ] sudo ls
- [ ] Переустановить пакет coreutils
> Программа на месте — оболочка просто не ищет её в каталоге. Полный путь работает всегда.

### Как правильно добавить каталог /opt/tools/bin в PATH?
- [ ] export PATH=/opt/tools/bin
- [x] export PATH="$PATH:/opt/tools/bin"
- [ ] PATH+=/opt/tools/bin без кавычек и двоеточия
- [ ] alias PATH=/opt/tools/bin
> Нужно дополнить текущее значение, а не заменить его. Без `$PATH` пропадут все системные каталоги.

### Какая утилита показывает владельца и права каждого каталога на пути к файлу?
= namei
= namei -l
> `namei -l /var/log/app/app.log` разворачивает путь по компонентам — сразу видно, где нет права.

### Приложение от пользователя app не может создать файл в /var/log/app (root:root 755). Как починить правильно?
- [ ] chmod 777 /var/log/app
- [x] Сделать владельцем каталога пользователя app (или выдать запись его группе)
- [ ] Запускать приложение от root
- [ ] Отключить проверку прав
> Права выдают тому, кому они нужны. 777 открывает каталог всем процессам системы.

### Чем опасен chmod 777 на каталоге с логами?
- [ ] Ничем, это стандартная практика
- [x] Любой процесс может удалять и подменять файлы и создавать в каталоге симлинки на чужие файлы
- [ ] Логи перестанут писаться
- [ ] Каталог станет недоступен root
> Запись всем = возможность подменить логи, заметать следы и атаковать через симлинки.

### Почему проверка «от root всё работает» ничего не доказывает?
- [ ] root работает медленнее
- [x] root обходит проверки прав, а служба работает от своего пользователя
- [ ] У root другой PATH, но права те же
- [ ] root не может писать в /var/log
> Проверяйте от имени того, кто реально выполняет команду: `sudo -u app`, `su - dev -c`.

### Команда есть в /usr/local/bin, но «command not found» только в cron. Самая вероятная причина?
- [ ] Cron не умеет запускать программы
- [x] У cron свой минимальный PATH — нужен полный путь или PATH в crontab
- [ ] Файл не имеет права на чтение
- [ ] Cron работает только от root
> Cron и systemd не читают `.bashrc`: окружение у них минимальное.

### Скрипт ./run.sh: «Permission denied», хотя у файла есть право x. Что ещё проверить?
- [ ] Ничего, это невозможно
- [x] Не смонтирована ли файловая система с noexec и есть ли право x на каталогах по пути
- [ ] Свободное место на диске
- [ ] Версию bash
> Для запуска нужно право x на файл и проход (x) по всем каталогам пути; `noexec` у раздела запрещает запуск совсем.

### Где задать общий для всех пользователей каталог в PATH?
- [ ] В ~/.bashrc каждого пользователя
- [x] Файлом в /etc/profile.d/
- [ ] В /etc/hosts
- [ ] В /etc/shells
> Скрипты из `/etc/profile.d/` выполняются при входе любого пользователя.

### Какой командой убрать символы CR из скрипта на месте?
= sed -i 's/\r$//' deploy.sh
= dos2unix deploy.sh
> `sed -i 's/\r$//'` удаляет CR в конце каждой строки; `dos2unix` делает то же.
