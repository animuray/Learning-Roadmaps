---
title: Бэкап и восстановление PostgreSQL
slug: bekap-i-vosstanovlenie-postgresql
description: Логические бэкапы pg_dump, pg_dumpall и pg_restore, форматы дампов, физические бэкапы pg_basebackup, архивирование WAL и восстановление на момент времени (PITR), инструменты pgBackRest, WAL-G, Barman, RPO, RTO и проверка восстановления.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: PostgreSQL Docs — pg_dump
    url: https://www.postgresql.org/docs/19/app-pgdump.html
    type: документация
  - title: PostgreSQL Docs — Continuous Archiving and Point-in-Time Recovery (PITR)
    url: https://www.postgresql.org/docs/18/continuous-archiving.html
    type: документация
---

# Бэкап и восстановление PostgreSQL

Бэкап, который вы ни разу не восстанавливали, — не бэкап. Главные вопросы:

- **RPO** (Recovery Point Objective) — сколько данных можно потерять: сутки? 5 минут?
- **RTO** (Recovery Time Objective) — за сколько нужно восстановиться.

От ответов зависит способ.

## Логический бэкап: pg_dump

`pg_dump` выгружает **одну базу** как SQL или архив. Делает **согласованный** снимок, не блокируя чтение и запись.

```bash
pg_dump -h db -U app -d app -Fc -f app-$(date +%F).dump
pg_dump -h db -U app -d app -Fd -j 4 -f app-dir/
pg_dump -h db -U app -d app | gzip > app.sql.gz
pg_dump -d app --schema-only > schema.sql
pg_dump -d app -t orders -Fc -f orders.dump
pg_dumpall --globals-only > globals.sql
```

| Формат | Флаг | Особенности |
| --- | --- | --- |
| plain SQL | `-Fp` (по умолчанию) | Читаемый текст, восстановление через `psql` |
| custom | `-Fc` | Сжатый архив, выборочное и параллельное восстановление через `pg_restore` — **выбор по умолчанию** |
| directory | `-Fd` | Каталог файлов; единственный формат с **параллельным дампом** `-j` |
| tar | `-Ft` | tar-архив |

**pg_dumpall** выгружает весь кластер, в том числе **роли и табличные пространства** — их `pg_dump` не сохраняет. Частая схема: `pg_dumpall --globals-only` + `pg_dump -Fc` каждой базы.

### Восстановление

```bash
createdb -h db -U postgres -O app app_restored
pg_restore -h db -U postgres -d app_restored -j 4 app-2026-11-27.dump
pg_restore -d app --clean --if-exists app.dump
pg_restore -C -d postgres app.dump
pg_restore -l app.dump > toc.list
psql -d app_restored -f app.sql
psql -f globals.sql
```

- `-C` — создать базу из дампа; `--clean` — удалить объекты перед созданием; `-j` — параллельно (для custom/directory).
- Восстанавливать дамп лучше той же или **более новой** версией клиентских утилит.
- После восстановления — `ANALYZE`.

Плюсы логического бэкапа: переносимость между версиями и платформами, выборочное восстановление таблиц. Минусы: на больших базах (сотни ГБ) медленно, RPO = время последнего дампа (обычно сутки).

## Физический бэкап: pg_basebackup

Копия **файлов всего кластера** (все базы, роли, настройки внутри PGDATA) с работающего сервера:

```bash
pg_basebackup -h db -U replicator -D /backup/base-$(date +%F) -Ft -z -X stream -P
```

- `-X stream` — сразу забрать нужные WAL, чтобы бэкап был самодостаточным.
- Пользователю нужен атрибут `REPLICATION` и строка `replication` в pg_hba.conf.
- Восстанавливается только на **ту же мажорную версию** и архитектуру.
- Конфиги вне PGDATA (в Debian — `/etc/postgresql/...`) бэкапьте отдельно.

## WAL и PITR — восстановление на момент времени

Все изменения сначала пишутся в **WAL** (журнал предзаписи, `pg_wal/`). Если сохранить **базовый бэкап** и **непрерывный архив WAL** после него, можно восстановить базу **на любую секунду** — например, на момент за минуту до `DROP TABLE`.

```
 базовый бэкап (понедельник) ── WAL ── WAL ── WAL ── ... ── «DROP TABLE» в среду 14:05
 восстановление: бэкап + проигрывание WAL до среды 14:04:59
```

Архивирование на primary (`postgresql.conf`):

```
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'
```

Восстановление (PostgreSQL 12+):

1. Остановить сервер, развернуть базовый бэкап в PGDATA.
2. В `postgresql.conf` указать:
   `restore_command = 'cp /archive/%f %p'` и `recovery_target_time = '2026-11-25 14:04:59+03'`.
3. Создать пустой файл `recovery.signal` в PGDATA и запустить сервер.
4. Проверить данные, затем `SELECT pg_wal_replay_resume();` (или завершить восстановление по настройке `recovery_target_action`).

Если архивирование отстаёт или `archive_command` падает, WAL копится в `pg_wal/`, и диск может **переполниться** — сервер остановится. Мониторьте `pg_stat_archiver`.

## Инструменты

Вручную PITR настраивают ради понимания, в проде используют:

- **pgBackRest** — полные, дифференциальные и инкрементальные бэкапы, параллельность, S3, шифрование, проверка;
- **WAL-G** — бэкапы и WAL в объектное хранилище (S3, GCS);
- **Barman** — сервер бэкапов для многих PostgreSQL;
- в Kubernetes — операторы (CloudNativePG использует barman-cloud), в облаке — managed-базы с PITR «из коробки».

## Правила

- **3-2-1**: три копии, на двух типах носителей, одна — вне площадки (другой регион, объектное хранилище).
- Шифровать бэкапы, ограничить доступ — там все данные.
- **Регулярно восстанавливать** на тестовый сервер автоматически и проверять данные (`SELECT count(*)` ключевых таблиц).
- Мониторить возраст последнего успешного бэкапа и алертить.
- Реплика — **не бэкап**: `DROP TABLE` мгновенно реплицируется.

## Практика

- [ ] Сделать дамп базы в форматах plain и custom, сравнить размер
- [ ] Восстановить custom-дамп в новую базу через `pg_restore -j`, проверить данные
- [ ] Восстановить только одну таблицу из custom-дампа
- [ ] Выгрузить роли через `pg_dumpall --globals-only`
- [ ] Сделать физический бэкап `pg_basebackup -X stream` и поднять из него второй экземпляр
- [ ] Настроить `archive_command`, сделать базовый бэкап, удалить таблицу и восстановиться на момент до удаления (PITR)
- [ ] Настроить pgBackRest или WAL-G с хранением в MinIO/S3 и ежедневный CronJob или systemd timer
- [ ] Написать скрипт автоматической проверки восстановления

## Лаборатория

PostgreSQL 16 на стенде, база **`shop`**. Утилиты `pg_dump`, `pg_restore`, `psql` запускайте от системного пользователя `postgres` (`sudo -u postgres ...`) — у него права на все базы.

```bash lib
# PostgreSQL 16 на стенде: кластер 16/main, порт 5432. Администратор — системный пользователь postgres.
lab_psql() { sudo -u postgres psql -qXtA "$@"; }
# lab_shopdb — учебная база shop: customers, orders (крупная), audit_log (самая крупная), settings
lab_shopdb() {
  lab_psql -c "DROP DATABASE IF EXISTS shop WITH (FORCE)" -c "CREATE DATABASE shop" >/dev/null
  lab_psql -d shop >/dev/null <<'EOF'
CREATE TABLE customers (id serial PRIMARY KEY, name text, city text);
CREATE TABLE orders (id serial PRIMARY KEY, customer_id int REFERENCES customers, total numeric, status text, created_at timestamptz DEFAULT now());
CREATE TABLE audit_log (id bigserial PRIMARY KEY, event text, payload text, at timestamptz DEFAULT now());
CREATE TABLE settings (key text PRIMARY KEY, value text);
INSERT INTO customers (name, city) SELECT 'customer ' || g, (ARRAY['Москва','Казань','Пермь'])[1 + g % 3] FROM generate_series(1, 2000) g;
INSERT INTO orders (customer_id, total, status) SELECT 1 + g % 2000, (g % 500) * 10, (ARRAY['new','paid','shipped'])[1 + g % 3] FROM generate_series(1, 30000) g;
INSERT INTO audit_log (event, payload) SELECT 'event ' || g, repeat(md5(g::text), 8) FROM generate_series(1, 60000) g;
INSERT INTO settings VALUES ('currency', 'RUB'), ('vat', '20');
EOF
}
```

### Бэкап и восстановление в новую базу

Сделайте **бэкап** базы `shop` в **custom-формате** в файл `/var/backups/pg/shop.dump`, а затем **восстановите** его в новую базу **`shop_restored`**. Число строк во всех таблицах должно совпасть с исходной базой.

```bash setup
lab_shopdb
lab_psql -c "DROP DATABASE IF EXISTS shop_restored WITH (FORCE)" >/dev/null
rm -rf /var/backups/pg
mkdir -p /var/backups/pg && chown postgres:postgres /var/backups/pg
```

```bash check
f=/var/backups/pg/shop.dump
[ -f $f ] || fail "Нет /var/backups/pg/shop.dump"
pg_restore -l $f >/dev/null 2>&1 || fail "shop.dump — не архив custom-формата (pg_restore -l его не читает)"
pg_restore -l $f | grep -q 'TABLE DATA public orders' || fail "В бэкапе нет данных таблицы orders"
[ "$(lab_psql -c "select 1 from pg_database where datname = 'shop_restored'")" = 1 ] || fail "Базы shop_restored нет"
for t in customers orders audit_log settings; do
  a=$(lab_psql -d shop -c "select count(*) from $t"); b=$(lab_psql -d shop_restored -c "select count(*) from $t" 2>/dev/null)
  [ "$a" = "$b" ] || fail "В $t: в shop $a строк, в shop_restored ${b:-таблицы нет}"
done
lab_psql -d shop_restored -c "select count(*) from pg_constraint where conname like '%_fkey'" | grep -qv '^0$' || fail "В восстановленной базе нет внешних ключей"
ok "бэкап $(du -h $f | cut -f1), shop_restored совпадает с shop"
```

```text hint
1. Утилита логического бэкапа: ключ формата (custom — сжатый, с оглавлением, для выборочного восстановления) и файл вывода.
2. Создать пустую базу для восстановления.
3. Утилита восстановления custom-архивов: в какую базу и из какого файла; полезен ключ «без владельцев», если ролей нет на целевом сервере.
4. Сравнить количество строк.
```

```bash solution
sudo -u postgres pg_dump -Fc -d shop -f /var/backups/pg/shop.dump
sudo -u postgres pg_restore -l /var/backups/pg/shop.dump | head -15
sudo -u postgres createdb shop_restored
sudo -u postgres pg_restore -d shop_restored --no-owner /var/backups/pg/shop.dump
sudo -u postgres psql -d shop_restored -c "select count(*) from orders"
```

```text review
Эталон: `pg_dump -Fc` → `createdb shop_restored` → `pg_restore -d shop_restored`.

- Форматы: plain SQL (`-Fp`, восстанавливается `psql`), custom (`-Fc`, сжатый, выборочное восстановление `-t таблица`, параллельность `-j`), directory (`-Fd`, параллельный дамп).
- `pg_dump` — снимок **одной базы** на момент начала, не блокирует работу. Роли и настройки кластера в него не входят — их сохраняет `pg_dumpall --globals-only`.
- **Бэкап, который не восстанавливали, — не бэкап.** Регулярно проверяйте восстановление в отдельную базу или на отдельный сервер, автоматически.
- Для больших баз и восстановления на момент времени (PITR) — физические бэкапы + WAL: `pg_basebackup`, pgBackRest, WAL-G.
```

### Восстановить одну таблицу

Кто-то выполнил `TRUNCATE settings` в базе `shop`. Есть ночной бэкап `/var/backups/pg/nightly.dump` (custom-формат). Восстановите из него **только данные таблицы `settings`** — остальные таблицы трогать нельзя: в них со времени бэкапа появились новые данные.

```bash setup
lab_shopdb
rm -rf /var/backups/pg && mkdir -p /var/backups/pg && chown postgres:postgres /var/backups/pg
sudo -u postgres pg_dump -Fc -d shop -f /var/backups/pg/nightly.dump
lab_psql -d shop -c "INSERT INTO orders (customer_id, total, status) VALUES (1, 999, 'new'), (2, 888, 'new')" -c "TRUNCATE settings" >/dev/null
lab_psql -d shop -c "select count(*) from orders" > /var/lib/lab/orders-count
```

```bash check
[ "$(lab_psql -d shop -c "select value from settings where key = 'currency'")" = RUB ] && [ "$(lab_psql -d shop -c "select count(*) from settings")" = 2 ] || fail "Данные settings не восстановлены (строк: $(lab_psql -d shop -c 'select count(*) from settings'))"
[ "$(lab_psql -d shop -c "select count(*) from orders")" = "$(cat /var/lib/lab/orders-count)" ] || fail "Изменилась таблица orders — новые заказы после бэкапа потеряны или задвоены"
ok "settings восстановлена, новые заказы на месте"
```

```text hint
1. Посмотреть оглавление архива — там видно отдельные элементы: схему таблиц и данные таблиц.
2. У утилиты восстановления есть ключи «только данные» и «только эта таблица».
3. Восстанавливать в рабочую базу shop.
```

```bash solution
sudo -u postgres pg_restore -l /var/backups/pg/nightly.dump | grep settings
sudo -u postgres pg_restore -d shop --data-only -t settings /var/backups/pg/nightly.dump
sudo -u postgres psql -d shop -c "select * from settings"
```

```text review
Эталон: `pg_restore -d shop --data-only -t settings nightly.dump`.

- Custom-формат позволяет выборочное восстановление: `-t` (таблица), `-n` (схема), `-L список.txt` (свой список элементов из `pg_restore -l`).
- Восстанавливать «поверх» живой базы опасно: если в таблице остались строки — будут конфликты ключей. Надёжнее восстановить в отдельную базу и перенести нужное (`INSERT ... SELECT` через `dblink` или выгрузку `COPY`).
- Защита от `TRUNCATE`/`DROP` по ошибке: отдельные роли без прав на DDL для приложения и людей, обязательный `BEGIN` в консоли (`\set AUTOCOMMIT off`).
```

## Тест

### Чем pg_dump отличается от pg_basebackup?
- [x] pg_dump делает логический бэкап одной базы (SQL или архив), переносимый между версиями
- [x] pg_basebackup делает физическую копию файлов всего кластера, восстанавливаемую на ту же мажорную версию
- [ ] pg_dump копирует файлы PGDATA
- [ ] pg_basebackup работает только на остановленном сервере
> Физический бэкап вместе с WAL позволяет PITR.

### Какой формат pg_dump обычно выбирают по умолчанию для бэкапов?
- [ ] plain
- [x] custom (-Fc) — сжатый, позволяет выборочное и параллельное восстановление через pg_restore
- [ ] tar всегда
- [ ] csv
> Параллельный дамп поддерживает только directory (-Fd).

### Что не сохраняет pg_dump одной базы?
- [ ] Таблицы
- [x] Глобальные объекты кластера: роли и табличные пространства
- [ ] Индексы
- [ ] Данные
> Их выгружают через pg_dumpall --globals-only.

### Чем восстанавливают дамп в формате custom?
= pg_restore
> Plain SQL восстанавливают через psql.

### Что такое PITR?
- [ ] Ежедневный дамп
- [x] Восстановление базы на любой момент времени с помощью базового бэкапа и непрерывного архива WAL
- [ ] Репликация в другой регион
- [ ] Перенос базы на новую версию
> Например, на момент за минуту до ошибочного DROP TABLE.

### Что нужно для PITR?
- [x] Базовый физический бэкап
- [x] Непрерывная цепочка архивных WAL-файлов от начала бэкапа до нужного момента
- [ ] Дамп pg_dump
- [ ] Реплика
> Логический дамп нельзя использовать с проигрыванием WAL.

### Что произойдёт, если archive_command постоянно завершается с ошибкой?
- [ ] Ничего
- [x] Неархивированные WAL-файлы будут накапливаться в pg_wal, диск может переполниться, и сервер остановится
- [ ] PostgreSQL отключит WAL
- [ ] Бэкап будет удалён
> Мониторьте pg_stat_archiver и свободное место.

### Почему реплика не заменяет бэкап?
- [ ] Реплика работает медленнее
- [x] Ошибочное удаление или порча данных сразу реплицируется на реплику
- [ ] Реплика не хранит данные
- [ ] Реплика удаляется каждую ночь
> Реплика защищает от отказа сервера, бэкап — от потери данных.

### Что означают RPO и RTO?
- [x] RPO — сколько данных допустимо потерять (точка восстановления)
- [x] RTO — за какое время нужно восстановить работу
- [ ] RPO — размер бэкапа
- [ ] RTO — число копий
> От них зависит выбор между дампами и PITR.

### Какие инструменты используют для бэкапов PostgreSQL в продакшене?
- [x] pgBackRest
- [x] WAL-G
- [x] Barman
- [ ] cron с cp каталога данных работающей базы
> Копировать файлы работающей базы без механизмов бэкапа нельзя — копия будет несогласованной.

### Что означает правило 3-2-1?
- [ ] Бэкап раз в 3 дня, хранить 2 недели, 1 проверка
- [x] Три копии данных, на двух типах носителей, одна копия вне основной площадки
- [ ] Три сервера, две реплики, один бэкап
- [ ] Три формата дампа
> Внешняя копия защищает от потери всего дата-центра.

### Как убедиться, что бэкапы действительно рабочие?
- [ ] Проверить, что файл не пустой
- [x] Регулярно автоматически восстанавливать их на тестовый сервер и проверять данные
- [ ] Посмотреть размер файла
- [ ] Это невозможно
> И алертить, если последний успешный бэкап слишком старый.
