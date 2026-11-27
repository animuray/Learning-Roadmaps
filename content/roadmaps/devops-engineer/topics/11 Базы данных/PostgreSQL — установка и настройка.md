---
title: PostgreSQL — установка и настройка
slug: postgresql-ustanovka-i-nastrojka
description: Установка PostgreSQL из репозитория PGDG, кластеры и каталоги, postgresql.conf и главные параметры, reload и restart, pg_hba.conf и методы аутентификации, роли, привилегии и схемы, psql, пул соединений PgBouncer.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: PostgreSQL Docs — The pg_hba.conf File
    url: https://www.postgresql.org/docs/current/auth-pg-hba-conf.html
    type: документация
  - title: PostgreSQL Docs — GRANT
    url: https://www.postgresql.org/docs/19/sql-grant.html
    type: документация
---

# PostgreSQL — установка и настройка

DevOps-инженер не пишет бизнес-логику на SQL, но **поднимает и настраивает** базу, даёт доступы, делает бэкапы и реплики, следит за здоровьем. В практике Linux вы уже поставили PostgreSQL для своего приложения — здесь разбираемся, как это устроено.

## Версии и установка

Новая мажорная версия выходит раз в год (осенью) и поддерживается **5 лет**. В ноябре 2026 года вышла PostgreSQL 19, а поддержка 14-й закончилась. В репозиториях дистрибутивов версия часто старее — для актуальной используют официальный репозиторий **PGDG** (apt.postgresql.org / yum.postgresql.org).

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt install -y postgresql-18
```

В Debian/Ubuntu действует обёртка **postgresql-common** — можно держать несколько **кластеров** (экземпляров) разных версий:

```bash
pg_lsclusters
sudo pg_ctlcluster 18 main restart
sudo systemctl status postgresql@18-main
```

| Что | Debian/Ubuntu | RHEL-подобные |
| --- | --- | --- |
| Конфиги | `/etc/postgresql/18/main/` | `/var/lib/pgsql/18/data/` |
| Данные (PGDATA) | `/var/lib/postgresql/18/main/` | `/var/lib/pgsql/18/data/` |
| Логи | `/var/log/postgresql/` | `$PGDATA/log/` |

Подключение администратора — через локального пользователя ОС `postgres` (метод `peer`):

```bash
sudo -u postgres psql
```

Полезные команды psql: `\l` (базы), `\c db` (подключиться), `\du` (роли), `\dt` (таблицы), `\dn` (схемы), `\x` (вертикальный вывод), `\conninfo`, `\q`.

## postgresql.conf

| Параметр | Смысл | Отправная точка |
| --- | --- | --- |
| `listen_addresses` | На каких адресах слушать | `localhost` по умолчанию; `'*'` или IP — для удалённых клиентов |
| `port` | Порт | 5432 |
| `max_connections` | Максимум соединений | 100; каждое — отдельный процесс, лучше пул, чем 1000 |
| `shared_buffers` | Кэш страниц PostgreSQL | ~25% RAM |
| `effective_cache_size` | Подсказка планировщику, сколько кэша у ОС | ~50–75% RAM |
| `work_mem` | Память на одну сортировку/хеш в запросе | 4–64 МБ, осторожно: умножается на число операций и соединений |
| `maintenance_work_mem` | Для VACUUM, CREATE INDEX | 256 МБ – 1 ГБ |
| `wal_level` | Сколько писать в WAL | `replica` (нужно для реплик и PITR) |
| `password_encryption` | Хеширование паролей | `scram-sha-256` |
| `log_min_duration_statement` | Логировать медленные запросы | например, 500 мс |

Как применить изменения:

- большинство параметров — **reload** без разрыва соединений: `SELECT pg_reload_conf();` или `systemctl reload postgresql`;
- некоторые (`shared_buffers`, `listen_addresses`, `max_connections`) — только **restart**;
- проверить: `SHOW shared_buffers;`, `SELECT name, setting, pending_restart FROM pg_settings WHERE pending_restart;`
- `ALTER SYSTEM SET work_mem = '32MB';` пишет в `postgresql.auto.conf` (он перекрывает postgresql.conf).

Для подбора значений есть калькуляторы вроде PGTune — но понимайте, что меняете.

## pg_hba.conf — кто и откуда может подключаться

```
# TYPE   DATABASE     USER        ADDRESS          METHOD
local    all          postgres                     peer
local    all          all                          scram-sha-256
host     app          app         10.0.1.0/24      scram-sha-256
hostssl  all          all         0.0.0.0/0        scram-sha-256
host     replication  replicator  10.0.1.20/32     scram-sha-256
host     all          all         0.0.0.0/0        reject
```

- Строки проверяются **сверху вниз**, срабатывает **первая подходящая** (по типу, базе, пользователю, адресу). Порядок важен.
- Типы: `local` (Unix-сокет), `host` (TCP), `hostssl` (только TLS), `hostnossl`.
- Методы: `peer` (имя пользователя ОС = имя роли, только local), `scram-sha-256` (пароль, современный), `md5` (устаревший — переходите на SCRAM), `trust` (**без пароля — никогда в проде**), `reject`, `cert`, `ldap`.
- Специальная «база» `replication` — для подключений реплик и pg_basebackup.
- После правки — **reload**. Проверка ошибок: `SELECT * FROM pg_hba_file_rules WHERE error IS NOT NULL;`

Ошибка `no pg_hba.conf entry for host "10.0.1.5", user "app", database "app"` — для такого сочетания нет строки (или подключение без SSL при `hostssl`).

Чтобы подключиться извне, нужны **три** вещи: `listen_addresses`, строка в `pg_hba.conf` и открытый порт в файрволе (только для нужных адресов!).

## Роли и привилегии

В PostgreSQL пользователи и группы — это **роли**. Роль с `LOGIN` — «пользователь», без — «группа».

```sql
CREATE ROLE app LOGIN PASSWORD 'S3cr3t!';
CREATE DATABASE app OWNER app;

CREATE ROLE readonly NOLOGIN;
GRANT CONNECT ON DATABASE app TO readonly;
\c app
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE app IN SCHEMA public GRANT SELECT ON TABLES TO readonly;

CREATE ROLE analyst LOGIN PASSWORD '...' IN ROLE readonly;
REVOKE CONNECT ON DATABASE app FROM PUBLIC;
```

Уровни прав: **база** (`CONNECT`, `CREATE`) → **схема** (`USAGE`, `CREATE`) → **объекты** (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`…).

- `GRANT ... ON ALL TABLES` действует только на **существующие** таблицы; для будущих — `ALTER DEFAULT PRIVILEGES`.
- У объекта один **владелец** с полными правами; приложение обычно — владелец своей базы (или схемы).
- `SUPERUSER` — только администраторам; приложению — никогда.
- С PostgreSQL 15 право `CREATE` в схеме `public` больше не выдаётся всем (`PUBLIC`) по умолчанию.
- Есть встроенные роли: `pg_read_all_data`, `pg_write_all_data`, `pg_monitor` (для мониторинга).

## Пул соединений

Каждое соединение — отдельный процесс ОС с памятью. Сотни подов × пул приложения = тысячи соединений. Решение — **PgBouncer** (режим `transaction`) между приложениями и базой: тысячи клиентских соединений → десятки серверных.

## Практика

- [ ] Установить PostgreSQL из репозитория PGDG, посмотреть `pg_lsclusters`, найти каталоги конфигов и данных
- [ ] Поменять `log_min_duration_statement` и применить через `pg_reload_conf()`; поменять `shared_buffers` и убедиться, что нужен restart (`pending_restart`)
- [ ] Разрешить подключение к базе `app` с другой ВМ: `listen_addresses`, строка в pg_hba.conf, файрвол только для IP приложения
- [ ] Разобрать ошибку `no pg_hba.conf entry` и посмотреть `pg_hba_file_rules`
- [ ] Создать роли app (владелец базы), readonly (группа) и analyst (входит в readonly); проверить права на чтение и запрет записи
- [ ] Создать новую таблицу после выдачи прав и убедиться, что без `ALTER DEFAULT PRIVILEGES` readonly её не видит
- [ ] Поставить PgBouncer перед базой и подключиться через него

## Тест

### Какие три условия нужны, чтобы к PostgreSQL можно было подключиться с другого сервера?
- [x] listen_addresses включает нужный адрес (а не только localhost)
- [x] В pg_hba.conf есть подходящая строка для базы, пользователя и адреса клиента
- [x] Порт открыт в файрволе для этого клиента
- [ ] Клиент установлен на той же машине
> Не открывайте 5432 всему интернету.

### Как PostgreSQL выбирает строку в pg_hba.conf для подключения?
- [ ] Самую строгую
- [x] Первую сверху, которая подходит по типу подключения, базе, пользователю и адресу
- [ ] Последнюю подходящую
- [ ] Случайную
> Порядок строк важен.

### Какой метод аутентификации по паролю рекомендуется сейчас?
= scram-sha-256
> md5 устарел, trust без пароля — недопустим в проде.

### Что означает метод peer в pg_hba.conf?
- [ ] Вход без пароля для всех
- [x] Для локальных подключений через сокет имя пользователя ОС должно совпадать с именем роли
- [ ] Вход по сертификату
- [ ] Подключение реплики
> Так sudo -u postgres psql входит без пароля.

### Как применить изменение pg_hba.conf или большинства параметров postgresql.conf без разрыва соединений?
- [ ] Перезагрузить сервер
- [x] Выполнить reload: SELECT pg_reload_conf() или systemctl reload postgresql
- [ ] Пересоздать базу
- [ ] Изменения применяются сами мгновенно
> Некоторые параметры, например shared_buffers, требуют restart.

### Какой ориентир для shared_buffers обычно берут на выделенном сервере?
- [ ] 1% RAM
- [x] Около 25% оперативной памяти
- [ ] 90% RAM
- [ ] Всегда 128 МБ
> Остальную память использует кэш ОС — это учитывает effective_cache_size.

### Почему не стоит ставить max_connections в несколько тысяч?
- [ ] PostgreSQL не поддерживает больше 100
- [x] Каждое соединение — отдельный процесс с памятью; при тысячах соединений растут накладные расходы, лучше пул соединений вроде PgBouncer
- [ ] Это замедляет только бэкапы
- [ ] Это отключает репликацию
> PgBouncer в режиме transaction сводит тысячи клиентов к десяткам соединений с базой.

### Вы выдали readonly GRANT SELECT ON ALL TABLES, но новую таблицу эта роль не видит. Почему?
- [ ] Ошибка PostgreSQL
- [x] GRANT ON ALL TABLES действует только на уже существующие таблицы; для будущих нужен ALTER DEFAULT PRIVILEGES
- [ ] Новые таблицы всегда закрыты для всех
- [ ] Нужно перезапустить сервер
> Default privileges задаются для роли, которая будет создавать таблицы.

### Чем роль с LOGIN отличается от роли без LOGIN?
- [x] Роль с LOGIN может подключаться к базе — это «пользователь»
- [x] Роль без LOGIN используют как группу, объединяющую права
- [ ] Роль без LOGIN — суперпользователь
- [ ] Разницы нет
> В PostgreSQL пользователи и группы — это роли.

### Какие уровни прав нужны роли, чтобы читать таблицу в схеме public базы app?
- [x] CONNECT на базу app
- [x] USAGE на схему public
- [x] SELECT на таблицу
- [ ] SUPERUSER
> Права проверяются на каждом уровне.

### Какую специальную «базу» указывают в pg_hba.conf для подключений реплик и pg_basebackup?
= replication
> Пользователь должен иметь атрибут REPLICATION.

### Почему нельзя давать приложению роль SUPERUSER?
- [ ] Приложение будет работать медленнее
- [x] Суперпользователь обходит все проверки прав и может, например, выполнять команды ОС; при взломе приложения злоумышленник получит полный контроль над сервером базы
- [ ] Суперпользователь не может создавать таблицы
- [ ] Это запрещено лицензией
> Приложению достаточно прав владельца своей базы или схемы.
