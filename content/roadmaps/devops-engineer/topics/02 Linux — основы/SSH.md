---
title: SSH
slug: ssh
description: Подключение к серверам по SSH — ключи, ssh-copy-id, ~/.ssh/config, jump-хосты, проброс портов, scp и rsync.
duration: 120
level: Основы
quizSize: 10
materials:
  - title: ArchWiki — SSH keys
    url: https://wiki.archlinux.org/title/SSH_keys
    type: документация
  - title: DigitalOcean — Настройка аутентификации на основе ключей SSH (на русском)
    url: https://www.digitalocean.com/community/tutorials/how-to-configure-ssh-key-based-authentication-on-a-linux-server-ru
    type: статья
  - title: OpenSSH — ssh_config(5)
    url: https://man.openbsd.org/ssh_config
    type: документация
  - title: Флант на Хабре — SSH-туннели и проброс портов
    url: https://habr.com/ru/companies/flant/articles/691388/
    type: статья
---

# SSH

**SSH** (Secure Shell) — зашифрованный протокол удалённого доступа. Через него вы управляете серверами, копируете файлы, Ansible настраивает машины, а CI/CD деплоит приложения. Сервер — служба `sshd` (порт **22**), клиент — команда `ssh`.

## Подключение

```bash
ssh user@203.0.113.10
ssh -p 2222 user@server.example.com     # нестандартный порт
ssh user@server 'df -h; uptime'          # выполнить команду и выйти
ssh -v user@server                       # подробный вывод для отладки подключения
```

При первом подключении SSH показывает **отпечаток ключа сервера** и сохраняет его в `~/.ssh/known_hosts`. Если потом ключ изменится, появится предупреждение `REMOTE HOST IDENTIFICATION HAS CHANGED`: сервер переустановили или кто-то подменяет соединение. Убедившись, что это переустановка, удалите старую запись: `ssh-keygen -R server`.

## Ключи вместо паролей

Пара ключей: **приватный** остаётся только у вас, **публичный** кладут на серверы. Сервер проверяет, что у вас есть приватный ключ, при этом сам ключ по сети не передаётся. Это надёжнее пароля и не поддаётся перебору.

```bash
ssh-keygen -t ed25519 -C "alice@laptop"   # создаст ~/.ssh/id_ed25519 и id_ed25519.pub
ssh-copy-id user@server                    # допишет публичный ключ в ~/.ssh/authorized_keys на сервере
ssh user@server                            # теперь вход по ключу
```

- Ed25519 — современный рекомендуемый тип ключа. RSA используйте не короче 3072 бит.
- **Passphrase** шифрует приватный ключ на диске. Чтобы не вводить её каждый раз, ключ загружают в агент: `ssh-add ~/.ssh/id_ed25519`.
- Права: каталог `~/.ssh` — `700`, приватный ключ и `authorized_keys` — `600`. При более широких правах sshd проигнорирует ключ, а клиент откажется его использовать.
- Без `ssh-copy-id` то же самое делают руками: дописывают содержимое `.pub` строкой в `~/.ssh/authorized_keys` на сервере.

## ~/.ssh/config

Чтобы не помнить адреса, порты и ключи:

```
Host web1
    HostName 203.0.113.10
    User deploy
    Port 2222
    IdentityFile ~/.ssh/id_ed25519

Host db-internal
    HostName 10.0.0.5
    User admin
    ProxyJump web1            # подключаться через web1 (bastion)

Host *
    ServerAliveInterval 60    # не рвать соединение при простое
```

Теперь достаточно `ssh web1` или `ssh db-internal`. Эти же имена понимают `scp`, `rsync`, git и Ansible.

**Jump-хост** (бастион) — единственный сервер, доступный из интернета, через него ходят во внутреннюю сеть: `ssh -J web1 admin@10.0.0.5`.

## Проброс портов (SSH-туннели)

```bash
# Локальный: localhost:5433 у вас → 127.0.0.1:5432 на сервере (база, закрытая снаружи)
ssh -L 5433:127.0.0.1:5432 user@server
psql -h localhost -p 5433 -U app

# Через сервер к другой машине во внутренней сети
ssh -L 8080:10.0.0.7:80 user@bastion

# Удалённый: порт 9000 на сервере → порт 3000 у вас (показать локальное приложение)
ssh -R 9000:localhost:3000 user@server

# Динамический: SOCKS-прокси на localhost:1080 через сервер
ssh -D 1080 user@server

# Только туннель, без оболочки, в фоне
ssh -fN -L 5433:127.0.0.1:5432 user@server
```

## Копирование файлов

```bash
scp app.tar.gz user@server:/tmp/           # файл на сервер
scp user@server:/var/log/app.log .          # с сервера себе
scp -r ./config web1:/opt/app/              # каталог

rsync -avz ./site/ web1:/var/www/site/      # синхронизация: передаёт только изменения
rsync -avz --delete ./site/ web1:/var/www/site/   # удалить на сервере то, чего нет локально
rsync -avzn ...                              # -n (dry-run): показать, что будет сделано
rsync -avz -e "ssh -p 2222" ./data/ user@server:/data/
```

- `-a` — архивный режим (рекурсивно, сохраняя права и время), `-v` — подробно, `-z` — сжатие.
- Слеш в конце источника важен: `site/` — копировать **содержимое** каталога, `site` — сам каталог внутрь назначения.
- Для больших и повторяющихся копирований используйте rsync: при обрыве он продолжит, а при повторе передаст только разницу.

## Сервер SSH

Конфиг сервера — `/etc/ssh/sshd_config` (и файлы в `/etc/ssh/sshd_config.d/`). Как отключить вход по паролю и для root, разберём в теме «Первичная настройка сервера». После изменения конфига:

```bash
sudo sshd -t                 # проверить синтаксис
sudo systemctl reload ssh    # в RHEL-семействе служба называется sshd
```

> [!warning] Не закройте себе дверь
> Меняя настройки SSH на удалённом сервере, держите открытой вторую сессию, пока не проверите, что новый вход работает.

## Практика

- [ ] Сгенерировать ключ ed25519 с passphrase и добавить его в ssh-agent
- [ ] Поднять две виртуальные машины (или ВМ и свой ноутбук), настроить вход по ключу через `ssh-copy-id`
- [ ] Описать хосты в `~/.ssh/config` и подключаться по коротким именам
- [ ] Через `ProxyJump` зайти на вторую ВМ через первую
- [ ] Через `ssh -L` подключиться к сервису на ВМ, который слушает только `127.0.0.1`
- [ ] Синхронизировать каталог с ВМ через `rsync`, сначала с `-n`, потом по-настоящему; изменить один файл и повторить

## Лаборатория

«Сервер» в этих задачах — пользователь `ops` на том же стенде: SSH-сервер слушает порт **2222** (`ssh -p 2222 ops@localhost`). Входить на него можно только по ключу — пароли выключены, как на настоящих серверах.

```bash setup
id ops >/dev/null 2>&1 || useradd -m -s /bin/bash ops
# ключ ученика и вход на ops по нему — для задач, где это уже «настроено»
prep_key() {
  su - student -c '[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -q -t ed25519 -N "" -f ~/.ssh/id_ed25519'
  install -d -m 700 -o ops -g ops /home/ops/.ssh
  install -m 600 -o ops -g ops /home/student/.ssh/id_ed25519.pub /home/ops/.ssh/authorized_keys
}
prep_config() {
  cat > /home/student/.ssh/config <<'EOF'
Host app
    HostName localhost
    Port 2222
    User ops
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking accept-new
EOF
  chown student:student /home/student/.ssh/config
  chmod 600 /home/student/.ssh/config
}
```

### Вход по ключу

Настройте вход по ключу: создайте для себя ключ **ed25519** и сделайте так, чтобы команда `ssh -p 2222 ops@localhost` пускала на сервер без пароля. Скопировать ключ через `ssh-copy-id` не выйдет — пароли на сервере выключены, но у вас есть `sudo`.

```bash setup
rm -rf /home/ops/.ssh
rm -f /home/student/.ssh/id_ed25519 /home/student/.ssh/id_ed25519.pub /home/student/.ssh/config /home/student/.ssh/known_hosts
```

```bash check
k=/home/student/.ssh/id_ed25519
[ -f $k ] || fail "Нет ключа ~/.ssh/id_ed25519"
ssh-keygen -l -f $k.pub 2>/dev/null | grep -q ED25519 || fail "~/.ssh/id_ed25519 — не ключ ed25519"
[ "$(stat -c %a $k)" = 600 ] || fail "Права на закрытый ключ $(stat -c %a $k) — ssh откажется его использовать"
su - student -c "ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -p 2222 ops@localhost true" >/dev/null 2>&1 \
  || fail "Вход ops@localhost по ключу не работает. Журнал сервера: $(journalctl -u ssh -n 3 --no-pager -o cat 2>/dev/null | grep -i ops | tail -1)"
ok "вход по ключу $(ssh-keygen -l -f $k.pub | awk '{print $2}')"
```

```text hint
1. Сгенерировать пару ключей нужного типа (passphrase можно оставить пустой — это учебный стенд).
2. На сервере открытая часть ключа должна лежать в файле авторизованных ключей в домашнем каталоге ops.
3. SSH очень придирчив к правам: каталог ключей и файл должны принадлежать ops и быть закрыты от остальных.
4. Проверить вход, указав порт.
```

```bash solution
ssh-keygen -q -t ed25519 -N "" -f ~/.ssh/id_ed25519
sudo install -d -m 700 -o ops -g ops /home/ops/.ssh
sudo install -m 600 -o ops -g ops ~/.ssh/id_ed25519.pub /home/ops/.ssh/authorized_keys
ssh -o StrictHostKeyChecking=accept-new -p 2222 ops@localhost whoami
```

```text review
Эталон: `ssh-keygen -t ed25519` → открытый ключ в `/home/ops/.ssh/authorized_keys` (каталог 700, файл 600, владелец ops).

- Обычно ключ кладут через `ssh-copy-id -p 2222 ops@host` — но он сам входит по паролю. На серверах с выключенными паролями ключ добавляет администратор, cloud-init или Ansible.
- Самая частая причина «по ключу не пускает» — права: если `~/.ssh` или `authorized_keys` доступны на запись группе или всем, sshd молча игнорирует ключ (`StrictModes`). Смотреть — в журнале сервера: `journalctl -u ssh` («Authentication refused: bad ownership or modes»).
- Отладка со стороны клиента: `ssh -v` — видно, какие ключи предлагались и что ответил сервер.
- Passphrase на рабочем ключе обязательна, а чтобы не вводить её каждый раз — `ssh-agent` и `ssh-add`.
```

```text notes
chmod\s+(7[0-7]7|[0-7]?77[0-7]|666) => Права на каталог или файл ключей открывались широко. sshd с такими правами отвергает ключ; для .ssh — 700, для authorized_keys — 600.
-t\s+rsa(?![^\n]*-b\s*4096) => Создавался RSA-ключ короче 4096 бит. Сейчас по умолчанию используют ed25519.
```

### Короткое имя хоста

Чтобы не набирать каждый раз порт, пользователя и ключ, опишите сервер в `~/.ssh/config` под именем `app`: команда `ssh app` должна входить как `ops` на `localhost:2222` с ключом `~/.ssh/id_ed25519`. Ключ уже создан и добавлен на сервер.

```bash setup
prep_key
rm -f /home/student/.ssh/config
```

```bash check
c=/home/student/.ssh/config
[ -f $c ] || fail "Нет ~/.ssh/config"
grep -qiE '^\s*Host\s+(.*\s)?app(\s|$)' $c || fail "В ~/.ssh/config нет блока Host app"
u=$(su - student -c "ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 app whoami" 2>/dev/null)
[ "$u" = ops ] || fail "ssh app не входит на сервер как ops (ответ: «$u»). Что ssh берёт из конфига: $(su - student -c 'ssh -G app' 2>/dev/null | grep -E '^(hostname|user|port) ' | tr '\n' ' ')"
ok "ssh app → $u@$(su - student -c 'ssh -G app' | awk '/^hostname /{h=$2} /^port /{p=$2} END{print h":"p}')"
```

```text hint
1. В файле конфигурации клиента начать блок с ключевого слова «Host» и короткого имени.
2. Под ним с отступом: настоящее имя или адрес, порт, пользователь и путь к ключу — по строке на параметр.
3. Проверить, что ssh собирается делать для этого имени: у клиента есть ключ, который печатает итоговые настройки без подключения.
```

```bash solution
cat > ~/.ssh/config <<'EOF'
Host app
    HostName localhost
    Port 2222
    User ops
    IdentityFile ~/.ssh/id_ed25519
EOF
chmod 600 ~/.ssh/config
ssh -o StrictHostKeyChecking=accept-new app whoami
```

```text review
Эталон — блок `Host app` с `HostName`, `Port`, `User`, `IdentityFile`.

- Имя из `Host` работает везде, где есть SSH: `scp file app:`, `rsync -a dir/ app:www/`, `git clone app:repo.git`, Ansible inventory.
- `ssh -G app` печатает итоговые настройки — так отлаживают, какой блок сработал. Для одного имени берётся **первое** найденное значение каждого параметра, поэтому общий `Host *` пишут в конце файла.
- Полезные параметры: `ProxyJump bastion` — вход через промежуточный сервер, `ServerAliveInterval 30` — не обрывать простаивающую сессию, `IdentitiesOnly yes` — не перебирать все ключи из агента.
```

### Туннель к закрытому сервису

На сервере `app` работает веб-сервис, который слушает **только** `127.0.0.1:8081` — снаружи к нему не подключиться. Пробросьте его на свой порт `9190` через SSH-туннель, работающий **в фоне**, и сохраните ответ сервиса (страницу `/`), полученный через туннель, в `~/tunnel.txt`. Туннель должен остаться запущенным.

```bash setup
prep_key
prep_config
pkill -u student -f 'ssh .*-[LRD]' 2>/dev/null; true
systemctl stop lab-tunnel.service 2>/dev/null; systemctl reset-failed lab-tunnel.service 2>/dev/null; true
rm -rf /srv/lab-tunnel /home/student/tunnel.txt
mkdir -p /srv/lab-tunnel
secret="secret-$(tr -dc a-z0-9 </dev/urandom | head -c 8)"
echo "$secret" > /srv/lab-tunnel/index.html
echo "$secret" > /var/lib/lab/tunnel-secret
chown -R ops:ops /srv/lab-tunnel
systemd-run -q --unit=lab-tunnel -p User=ops python3 -m http.server 8081 --bind 127.0.0.1 --directory /srv/lab-tunnel
for i in $(seq 20); do curl -s 127.0.0.1:8081/ >/dev/null && break; sleep 0.3; done
```

```bash check
s=$(cat /var/lib/lab/tunnel-secret)
pgrep -u student -f 'ssh .*-L *([^ ]*:)?9190:' >/dev/null || fail "Нет фонового ssh-процесса с пробросом порта 9190"
curl -s --max-time 5 http://127.0.0.1:9190/ | grep -q "$s" || fail "На localhost:9190 сервис не отвечает — туннель ведёт не туда"
[ -f /home/student/tunnel.txt ] || fail "Нет ~/tunnel.txt"
grep -q "$s" /home/student/tunnel.txt || fail "В ~/tunnel.txt не ответ сервиса"
ok "localhost:9190 → app:127.0.0.1:8081 ($(pgrep -u student -af 'ssh .*-L' | head -1 | cut -d' ' -f2-))"
```

```text hint
1. Нужен «локальный» проброс: свой порт → адрес и порт, как их видит сервер (для сервера это его собственный 127.0.0.1).
2. Два ключа ssh: «не выполнять команду на сервере» и «уйти в фон после подключения».
3. Запросить страницу через свой порт и сохранить ответ в файл.
```

```bash solution
ssh -f -N -L 9190:127.0.0.1:8081 app
sleep 1
curl -s http://localhost:9190/ > ~/tunnel.txt
```

```text review
Эталон: `ssh -f -N -L 9190:127.0.0.1:8081 app`.

- `-L локальный_порт:хост:порт` — «хост:порт» вычисляются **на сервере**: `127.0.0.1` здесь — сам сервер. Так безопасно добираются до баз, админок и Prometheus, не открывая их в интернет.
- `-N` — без удалённой команды, `-f` — в фон. Для постоянных туннелей — `autossh` или systemd-юнит.
- `-R` — обратный туннель (порт на сервере ведёт к вам), `-D 1080` — SOCKS-прокси через сервер.
- На стенде клиент и сервер — одна машина, поэтому разница не видна. В жизни `app` — удалённый сервер, и без туннеля к `127.0.0.1:8081` не попасть никак.
```

```text notes
curl\s+[^\n]*:8081 => Сервис запрашивался напрямую по порту 8081 — на стенде это работает, потому что клиент и сервер одна машина. На настоящем сервере доступ к 127.0.0.1 есть только через туннель.
```

### Синхронизировать сайт на сервер

В `~/site` — файлы сайта. Выложите их на сервер `app` в каталог `~/www` пользователя ops (то есть `/home/ops/www`), сохранив структуру каталогов. Используйте инструмент, который при следующих выкладках будет передавать только изменения.

```bash setup
prep_key
prep_config
rm -rf /home/ops/www /home/student/site
mkdir -p /home/student/site/css /home/student/site/img
echo "<h1>Сайт</h1>" > /home/student/site/index.html
echo "body { margin: 0 }" > /home/student/site/css/style.css
head -c 20000 /dev/urandom | base64 > /home/student/site/img/logo.txt
chown -R student:student /home/student/site
```

```bash check
[ -d /home/ops/www ] || fail "На сервере нет каталога /home/ops/www"
[ -f /home/ops/www/index.html ] || fail "В /home/ops/www нет index.html — возможно, скопирован сам каталог site, а не его содержимое"
diff -rq /home/student/site /home/ops/www >/dev/null || fail "Содержимое /home/ops/www отличается от ~/site: $(diff -rq /home/student/site /home/ops/www 2>&1 | head -2 | tr '\n' ' ')"
[ "$(stat -c %U /home/ops/www/css/style.css)" = ops ] || fail "Файлы на сервере принадлежат не ops"
ok "выложено файлов: $(find /home/ops/www -type f | wc -l)"
```

```text hint
1. Утилита синхронизации каталогов работает поверх SSH и понимает короткое имя хоста из конфига.
2. Ключ «архивный режим» сохраняет структуру, права и время изменения.
3. Слеш в конце исходного каталога решает, скопируется сам каталог или его содержимое. Сначала можно сделать «пробный прогон», ничего не меняя.
```

```bash solution
rsync -an ~/site/ app:www/
rsync -a ~/site/ app:www/
```

```text review
Эталон: `rsync -a ~/site/ app:www/` (сначала с `-n` — пробный прогон).

- `site/` — содержимое каталога, `site` — сам каталог (получится `www/site/...`). Самая частая ошибка с rsync.
- rsync передаёт только изменившиеся части файлов — повторная выкладка большого сайта занимает секунды. `scp -r` каждый раз копирует всё заново.
- `--delete` удаляет на сервере файлы, которых больше нет у вас (зеркало). Опасен с перепутанными путями — всегда сначала `-n`.
- `-z` — сжатие в пути, `--progress` — прогресс, `-e 'ssh -p 2222'` — если хост не описан в `~/.ssh/config`.
```

```text notes
scp\s+-r => Использовался scp -r — работает, но при каждой выкладке копирует всё целиком. rsync передаёт только изменения.
```

## Тест

### Какой порт по умолчанию использует SSH?
= 22
> Порт меняют в `sshd_config` (`Port`), но это не замена нормальной защите.

### Какой командой создать современный SSH-ключ типа Ed25519?
= ssh-keygen -t ed25519
> Через `-C` можно добавить комментарий, например «alice@laptop».

### Какой ключ кладут на сервер?
- [ ] Приватный
- [x] Публичный (.pub)
- [ ] Оба
- [ ] Никакой, ключ передаётся при каждом входе
> Приватный ключ никогда не покидает вашу машину.

### Что делает ssh-copy-id user@server?
- [ ] Копирует приватный ключ на сервер
- [x] Дописывает ваш публичный ключ в ~/.ssh/authorized_keys пользователя на сервере
- [ ] Создаёт пару ключей
- [ ] Копирует все файлы из ~/.ssh
> После этого вход работает по ключу.

### Какие права должны быть у каталога ~/.ssh и файла authorized_keys?
- [ ] 777 и 666
- [ ] 755 и 644
- [x] 700 и 600
- [ ] 750 и 640
> Если права шире, sshd может проигнорировать authorized_keys, и вход по ключу «не работает».

### Что означает предупреждение REMOTE HOST IDENTIFICATION HAS CHANGED?
- [ ] Истёк срок действия вашего ключа
- [x] Ключ сервера не совпадает с сохранённым в known_hosts: сервер переустановили или соединение подменяют
- [ ] Сервер сменил порт
- [ ] У пользователя сменился пароль
> Сначала выясните причину. Только убедившись, что это переустановка, удаляйте запись через `ssh-keygen -R`.

### Зачем нужен файл ~/.ssh/config?
- [ ] Это конфиг SSH-сервера
- [x] Чтобы задать для хостов короткие имена, пользователей, порты, ключи и jump-хосты
- [ ] Это список разрешённых ключей
- [ ] В нём хранятся пароли
> Конфиг сервера — `/etc/ssh/sshd_config`.

### База PostgreSQL на сервере слушает только 127.0.0.1:5432. Как подключиться к ней со своего ноутбука?
- [ ] Открыть порт 5432 всему интернету
- [x] Сделать локальный проброс: ssh -L 5433:127.0.0.1:5432 user@server и подключаться к localhost:5433
- [ ] ssh -R 5432:localhost:5432 user@server
- [ ] Это невозможно
> Трафик идёт внутри зашифрованного SSH-соединения, а база остаётся закрытой снаружи.

### Что делает опция ProxyJump (или ssh -J)?
- [ ] Ускоряет соединение
- [x] Подключается к целевому хосту через промежуточный сервер (бастион)
- [ ] Перезапускает сервер при обрыве
- [ ] Пробрасывает графический интерфейс
> Типичная схема: из интернета доступен только бастион, остальные серверы — во внутренней сети.

### Чем rsync лучше scp для регулярного копирования большого каталога?
- [x] Передаёт только изменившиеся части файлов
- [x] Умеет удалять на приёмнике лишнее (--delete) и показывать план (-n)
- [ ] rsync не использует SSH, поэтому быстрее
- [ ] scp не умеет копировать каталоги
> rsync по умолчанию ходит через SSH.

### Чем отличаются rsync -a src/ dest/ и rsync -a src dest/?
- [ ] Ничем
- [x] src/ копирует содержимое каталога src в dest, а src — сам каталог: получится dest/src
- [ ] src/ копирует только скрытые файлы
- [ ] Без слеша rsync удаляет исходник
> Частая причина «лишнего» уровня вложенности после деплоя.

### Как проверить синтаксис sshd_config перед перезагрузкой службы?
= sudo sshd -t
= sshd -t
> Ошибка в конфиге может закрыть вам доступ к серверу.

### Как подключиться к серверу по нестандартному порту 2222?
- [x] ssh -p 2222 user@server
- [ ] ssh user@server:2222
- [ ] ssh --port=2222 user@server
- [ ] scp -P 2222 user@server
> У scp порт задаётся заглавной `-P`. Удобнее прописать `Port` в `~/.ssh/config`.

### Зачем нужен ssh-agent?
- [ ] Чтобы запускать sshd
- [x] Чтобы хранить расшифрованные ключи в памяти и не вводить passphrase при каждом подключении
- [ ] Чтобы генерировать ключи
- [ ] Чтобы шифровать файлы
> Ключи в агент добавляют командой `ssh-add`.
