---
title: PostgreSQL для своего приложения
slug: postgresql-dlya-prilozheniya
description: Установить PostgreSQL, создать пользователя и базу, выдать права, открыть доступ по сети и подключить бэкенд.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Ubuntu Server — Install and configure PostgreSQL
    url: https://ubuntu.com/server/docs/how-to/databases/install-postgresql/
    type: документация
  - title: Postgres Pro — Файл pg_hba.conf (на русском)
    url: https://postgrespro.ru/docs/enterprise/14/auth-pg-hba-conf?lang=ru-en
    type: документация
  - title: PostgreSQL — Linux downloads (Ubuntu), официальный APT-репозиторий
    url: https://postgresql.org/download/linux/ubuntu/
    type: документация
  - title: DigitalOcean — How to install and use PostgreSQL on Ubuntu
    url: https://digitalocean.com/community/tutorials/how-to-install-and-use-postgresql-on-ubuntu-20-04
    type: статья
---

# PostgreSQL для своего приложения

Шесть шагов из практики роадмапа: **установить → создать пользователя → выдать права → открыть порт → создать базу → подключить бэкенд**. Глубже администрирование PostgreSQL (бэкапы, репликация) разбирается в разделе «Базы данных».

## 1. Установка

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
systemctl status postgresql
psql --version
```

Нужна конкретная свежая версия — подключите официальный APT-репозиторий PostgreSQL (PGDG).

В Debian и Ubuntu:

- конфиги лежат в `/etc/postgresql/<версия>/main/` (`postgresql.conf`, `pg_hba.conf`);
- данные — в `/var/lib/postgresql/<версия>/main/`;
- логи — в `/var/log/postgresql/`.

## 2. Пользователь (роль)

При установке создаётся системный пользователь `postgres` и одноимённый суперпользователь базы. Локально он входит по методу **peer**: имя пользователя Linux должно совпадать с именем роли, пароль не нужен.

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE app WITH LOGIN PASSWORD 'надёжный-пароль';
```

Для приложения — отдельная роль **без** прав суперпользователя.

## 3. База и права

```sql
CREATE DATABASE appdb OWNER app;           -- владелец базы получает на неё все права
\c appdb
GRANT ALL ON SCHEMA public TO app;         -- в PostgreSQL 15+ права на схему public по умолчанию урезаны
```

Если база уже есть и владелец другой:

```sql
GRANT CONNECT ON DATABASE appdb TO app;
GRANT USAGE ON SCHEMA public TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
```

Полезные команды psql:

| Команда | Что делает |
| --- | --- |
| `\l` | Список баз |
| `\du` | Список ролей |
| `\c appdb` | Подключиться к базе |
| `\dt` | Таблицы текущей базы |
| `\d items` | Структура таблицы |
| `\q` | Выход |

## 4. Доступ по сети

По умолчанию PostgreSQL слушает только `localhost`. Если бэкенд работает на **той же машине**, ничего открывать не нужно — так безопаснее всего. Если на другой:

**postgresql.conf** — на каких адресах слушать:

```
listen_addresses = 'localhost,10.0.0.5'
```

Изменение `listen_addresses` требует **перезапуска**: `sudo systemctl restart postgresql`.

**pg_hba.conf** — кому и как разрешено подключаться. Правила проверяются **сверху вниз**, срабатывает первое подходящее:

```
# TYPE  DATABASE  USER  ADDRESS          METHOD
local   all       all                    peer
host    appdb     app   127.0.0.1/32     scram-sha-256
host    appdb     app   10.0.0.10/32     scram-sha-256
```

Изменения pg_hba.conf применяются **перечитыванием** конфигурации: `sudo systemctl reload postgresql` (или `SELECT pg_reload_conf();`).

**Файрвол** — только с адреса бэкенда:

```bash
sudo ufw allow from 10.0.0.10 to any port 5432 proto tcp
sudo ss -tlnp | grep 5432
```

> [!warning] Не открывайте 5432 в интернет
> Открытая база — одна из самых частых причин утечек и взломов: её находят сканеры за минуты. База должна быть доступна только из внутренней сети и только нужным хостам.

## 5. Проверка подключения

```bash
psql -h localhost -U app -d appdb          # спросит пароль
psql "postgresql://app:пароль@10.0.0.5:5432/appdb" -c "select 1"
```

## 6. Подключить бэкенд

Строка подключения в переменной окружения:

```bash
DATABASE_URL=postgresql://app:пароль@localhost:5432/appdb
```

В службе systemd — через `EnvironmentFile=/etc/myapp/env` с правами `640` (владелец root, группа — пользователь службы). Пароль не коммитят в Git.

## Частые ошибки

| Ошибка | Причина |
| --- | --- |
| `Peer authentication failed for user "app"` | Локальное подключение через сокет без `-h localhost`, а метод peer требует совпадения имён пользователей ОС и БД |
| `password authentication failed` | Неверный пароль или правило pg_hba с другим методом |
| `no pg_hba.conf entry for host ...` | Для этого адреса, базы и пользователя нет подходящего правила |
| `Connection refused` | Сервер не запущен или не слушает этот адрес (`listen_addresses`), или порт закрыт |
| `permission denied for schema public` | PostgreSQL 15+: роли не выданы права на схему |

## Практика

- [ ] Установить PostgreSQL и найти его конфиги, данные и логи
- [ ] Создать роль `app` и базу `appdb`, выдать права, проверить подключение через `psql -h localhost`
- [ ] Подключить бэкенд своего приложения через `DATABASE_URL` и проверить, что данные сохраняются
- [ ] Поднять вторую ВМ и подключиться к базе с неё: настроить `listen_addresses`, `pg_hba.conf` и ufw только для её адреса
- [ ] Специально воспроизвести ошибки `no pg_hba.conf entry` и `Peer authentication failed` и разобраться по логам

## Лаборатория

PostgreSQL 16 уже установлен и запущен. Подключиться администратором: `sudo -u postgres psql`.

### Роль и база для приложения

Создайте для приложения роль **`app`** с паролем **`app-secret-42`** и базу **`appdb`**, владельцем которой будет `app`. Приложение должно подключаться по сети к localhost: `psql -h localhost -U app -d appdb` с этим паролем.

```bash setup
sudo -u postgres psql -qX -c "DROP DATABASE IF EXISTS appdb" -c "DROP ROLE IF EXISTS app" >/dev/null 2>&1
true
```

```bash check
q() { sudo -u postgres psql -qXtA -c "$1" 2>/dev/null; }
[ "$(q "select 1 from pg_roles where rolname = 'app'")" = 1 ] || fail "Роли app нет"
[ "$(q "select rolcanlogin from pg_roles where rolname = 'app'")" = t ] || fail "Роль app не может входить в систему (это роль без LOGIN)"
[ "$(q "select 1 from pg_database where datname = 'appdb'")" = 1 ] || fail "Базы appdb нет"
[ "$(q "select pg_get_userbyid(datdba) from pg_database where datname = 'appdb'")" = app ] || fail "Владелец appdb — $(q "select pg_get_userbyid(datdba) from pg_database where datname = 'appdb'")"
out=$(PGPASSWORD=app-secret-42 psql -h localhost -U app -d appdb -qXtA -c "create table if not exists lab_check(x int); select current_user" 2>&1)
[ "$out" = app ] || fail "Подключиться как app по паролю не получается: $out"
PGPASSWORD=app-secret-42 psql -h localhost -U app -d appdb -qX -c "drop table lab_check" >/dev/null 2>&1
ok "app → appdb по паролю работает"
```

```text hint
1. Подключиться к PostgreSQL администратором — от системного пользователя postgres.
2. Создать роль с правом входа и паролем.
3. Создать базу, сразу указав владельца, — тогда приложение сможет создавать в ней таблицы.
4. Проверить подключение по сети к localhost от имени новой роли.
```

```bash solution
sudo -u postgres psql -c "CREATE ROLE app LOGIN PASSWORD 'app-secret-42'"
sudo -u postgres psql -c "CREATE DATABASE appdb OWNER app"
PGPASSWORD=app-secret-42 psql -h localhost -U app -d appdb -c '\conninfo'
```

```text review
Эталон: `CREATE ROLE app LOGIN PASSWORD '...'` → `CREATE DATABASE appdb OWNER app`.

- `CREATE USER` = `CREATE ROLE ... LOGIN`. Без `LOGIN` роль — просто группа прав.
- Владелец базы может создавать в схеме `public` таблицы. С PostgreSQL 15 обычные роли **больше не могут** создавать таблицы в `public` чужой базы — частая ошибка «permission denied for schema public» при `OWNER postgres`.
- `-h localhost` — подключение по TCP с паролем (`scram-sha-256` в `pg_hba.conf`). Без `-h` psql идёт через unix-сокет, где по умолчанию `peer`: имя роли должно совпадать с системным пользователем — отсюда «Peer authentication failed for user app».
- Пароль в командной строке виден в истории и `ps`. Для приложения — переменная `DATABASE_URL` из секретов, для себя — `~/.pgpass` (права 600).
```

### Открыть базу для сервера приложений

Бэкенд переезжает на отдельный сервер в сети `10.20.30.0/24`. Настройте PostgreSQL так, чтобы:

- он слушал **все** сетевые интерфейсы, а не только localhost;
- подключения из `10.20.30.0/24` к базе **`appdb`** под ролью **`app`** проходили **по паролю** (`scram-sha-256`), и только они — без доступа ко всем базам и всем ролям.

Настройки должны быть **применены** к работающему серверу.

```bash setup
conf=/etc/postgresql/16/main
sudo -u postgres psql -qX -c "DROP DATABASE IF EXISTS appdb" -c "DROP ROLE IF EXISTS app" >/dev/null 2>&1
sudo -u postgres psql -qX -c "CREATE ROLE app LOGIN PASSWORD 'app-secret-42'" -c "CREATE DATABASE appdb OWNER app" >/dev/null
sed -i '/10\.20\.30\./d' $conf/pg_hba.conf
sed -i "s/^listen_addresses.*/#listen_addresses = 'localhost'/" $conf/postgresql.conf
rm -f $conf/conf.d/*.conf
sudo -u postgres psql -qX -c "ALTER SYSTEM RESET listen_addresses" >/dev/null
systemctl restart postgresql
```

```bash check
q() { sudo -u postgres psql -qXtA -c "$1" 2>/dev/null; }
[ "$(q 'show listen_addresses')" = "*" ] || fail "Работающий сервер слушает только «$(q 'show listen_addresses')»"
err=$(q "select line_number || ': ' || error from pg_hba_file_rules where error is not null")
[ -z "$err" ] && [ "$(q "select count(*) from pg_hba_file_rules where error is not null")" = 0 ] || fail "В pg_hba.conf есть ошибочные строки: $err"
rule=$(q "select line_number, database, user_name, auth_method from pg_hba_file_rules where type = 'host' and address = '10.20.30.0' and netmask = '255.255.255.0'")
[ -n "$rule" ] || fail "В действующих правилах доступа нет строки для сети 10.20.30.0/24 (файл изменён, но не перечитан?)"
echo "$rule" | grep -q '|{appdb}|{app}|scram-sha-256$' || fail "Правило для 10.20.30.0/24 не то: $rule (нужны база appdb, роль app, scram-sha-256)"
ok "listen_addresses=*; правило: $rule"
```

```text hint
1. Найти конфигурацию кластера: адреса прослушивания задаются в основном файле, правила доступа — в файле правил аутентификации.
2. Добавить правило: тип подключения по сети, база, роль, адрес сети с маской, метод с паролем.
3. Правила аутентификации применяются перечитыванием конфигурации, а смена адресов прослушивания требует перезапуска.
4. Проверить действующие правила — в системном представлении с правилами из файла (там видны и ошибки).
```

```bash solution
conf=/etc/postgresql/16/main
sudo sed -i "s/^#\?listen_addresses.*/listen_addresses = '*'/" $conf/postgresql.conf
echo "host    appdb    app    10.20.30.0/24    scram-sha-256" | sudo tee -a $conf/pg_hba.conf >/dev/null
sudo systemctl restart postgresql
sudo -u postgres psql -c "show listen_addresses" -c "select line_number, type, database, user_name, address, auth_method from pg_hba_file_rules where address = '10.20.30.0'"
```

```text review
Эталон: `listen_addresses = '*'` в `postgresql.conf` + строка `host appdb app 10.20.30.0/24 scram-sha-256` в `pg_hba.conf` → `systemctl restart postgresql`.

- `listen_addresses` меняется только **перезапуском**; правила `pg_hba.conf` — `reload` (`SELECT pg_reload_conf()` или `systemctl reload postgresql`). Какой параметр что требует — колонка `context` в `pg_settings` (`postmaster` = перезапуск).
- Правила `pg_hba.conf` читаются **сверху вниз до первого совпадения**. Широкое правило выше узкого «съест» его.
- Никогда: `host all all 0.0.0.0/0 trust`. Минимум — конкретная база, роль, сеть и пароль; плюс файрвол только для адресов бэкендов (`ufw allow from 10.20.30.0/24 to any port 5432`).
- `pg_hba_file_rules` показывает правила из файла и ошибки в них ещё до reload — проверка перед применением.
```

```text notes
\b(all\s+all|0\.0\.0\.0/0|trust)\b => В правилах доступа встречались all/0.0.0.0/trust — так база открывается шире, чем нужно. Разрешайте конкретную базу, роль и сеть с паролем.
```

## Тест

### Как зайти в консоль PostgreSQL суперпользователем сразу после установки в Ubuntu?
= sudo -u postgres psql
> Локально работает метод peer: пользователь ОС postgres = роль postgres.

### Какой SQL-командой создать роль app с правом входа и паролем?
- [ ] CREATE USER app;
- [x] CREATE ROLE app WITH LOGIN PASSWORD '...';
- [ ] ADD USER app PASSWORD '...';
- [ ] GRANT LOGIN TO app;
> `CREATE USER app PASSWORD '...'` — тоже верный вариант: это CREATE ROLE с LOGIN по умолчанию.

### Какой файл определяет, с каких адресов и каким методом можно подключаться к PostgreSQL?
= pg_hba.conf
> HBA — host-based authentication.

### За что отвечает параметр listen_addresses в postgresql.conf?
- [ ] За список разрешённых клиентов
- [x] За то, на каких сетевых адресах сервера PostgreSQL принимает подключения
- [ ] За адрес репликации
- [ ] За адрес логов
> Кому разрешено подключаться — это уже pg_hba.conf.

### Как применить изменения в pg_hba.conf?
- [ ] Только перезагрузкой сервера
- [x] Перечитать конфигурацию: systemctl reload postgresql или SELECT pg_reload_conf();
- [ ] Пересоздать базу
- [ ] Изменения применяются сами через минуту
> А изменение listen_addresses требует полного перезапуска.

### В каком порядке проверяются правила pg_hba.conf?
- [ ] Самое строгое правило имеет приоритет
- [x] Сверху вниз; применяется первое подходящее правило, остальные не рассматриваются
- [ ] Снизу вверх
- [ ] В алфавитном порядке баз
> Поэтому порядок строк важен.

### Бэкенд на 10.0.0.10 получает ошибку no pg_hba.conf entry for host "10.0.0.10". Что исправить?
- [ ] Открыть порт 5432 всему интернету
- [x] Добавить в pg_hba.conf правило host для нужной базы, пользователя и адреса 10.0.0.10/32 и перечитать конфигурацию
- [ ] Перезапустить бэкенд
- [ ] Сменить пароль роли
> Ошибка прямо говорит: подходящего правила нет.

### Почему нельзя открывать порт 5432 в интернет?
- [ ] PostgreSQL не работает по сети
- [x] Открытую базу быстро находят сканеры и начинают подбирать пароли или эксплуатировать уязвимости — это частая причина утечек
- [ ] Порт 5432 зарезервирован
- [ ] Это замедляет базу
> Доступ — только из внутренней сети и только с нужных адресов.

### Локально psql -U app appdb выдаёт Peer authentication failed. Как подключиться с паролем?
- [ ] Удалить pg_hba.conf
- [x] Подключиться по TCP: psql -h localhost -U app -d appdb, где действует правило с паролем
- [ ] Переименовать пользователя Linux в app
- [ ] Перезапустить PostgreSQL
> Без -h psql идёт через Unix-сокет, а для него действует метод peer.

### Приложение подключается к базе, но при создании таблицы получает permission denied for schema public. Что не так?
- [ ] База переполнена
- [x] Роли не выданы права на схему public (в PostgreSQL 15+ они урезаны по умолчанию)
- [ ] Неверный пароль
- [ ] Неправильный listen_addresses
> Решение — сделать роль владельцем базы или выдать GRANT на схему.

### Какая команда psql покажет список баз данных?
- [ ] \dt
- [x] \l
- [ ] \du
- [ ] \c
> `\du` — роли, `\dt` — таблицы, `\c` — подключиться к базе.

### Где хранить пароль базы для бэкенда, запущенного как служба systemd?
- [x] В файле окружения, подключённом через EnvironmentFile=, с ограниченными правами (например 640)
- [ ] В README в Git-репозитории
- [ ] В коде приложения
- [ ] В /etc/motd
> Секреты не коммитят в Git. Позже их будут хранить в Vault или секретах Kubernetes.

### Какой порт по умолчанию использует PostgreSQL?
= 5432
> Проверить: `ss -tlnp | grep 5432`.
