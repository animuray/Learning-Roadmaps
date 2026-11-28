---
title: SQL для DevOps
slug: sql-dlya-devops
description: Минимум SQL для инженера эксплуатации — CREATE TABLE, INSERT, SELECT с WHERE, JOIN и GROUP BY, UPDATE и DELETE, индексы и EXPLAIN, транзакции, а также служебные запросы — активные сессии, блокировки, размеры, отмена запросов, VACUUM.
duration: 90
level: Основы
quizSize: 10
materials:
  - title: PostgreSQL Docs — GRANT
    url: https://www.postgresql.org/docs/19/sql-grant.html
    type: документация
  - title: PostgreSQL Docs — pg_dump (в т.ч. экспорт данных)
    url: https://www.postgresql.org/docs/19/app-pgdump.html
    type: документация
---

# SQL для DevOps

Задачи DevOps-инженера с SQL: проверить, что данные есть после восстановления; найти, кто «повесил» базу; понять, почему запрос медленный; посмотреть размер таблиц; выдать права; выполнить миграцию руками в аварийной ситуации.

## Таблицы и данные

```sql
CREATE TABLE users (
    id         bigserial PRIMARY KEY,
    email      text NOT NULL UNIQUE,
    name       text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id       bigserial PRIMARY KEY,
    user_id  bigint NOT NULL REFERENCES users(id),
    amount   numeric(10,2) NOT NULL,
    status   text NOT NULL DEFAULT 'new'
);

INSERT INTO users (email, name) VALUES ('a@example.com', 'Аня'), ('b@example.com', 'Борис');
INSERT INTO orders (user_id, amount) VALUES (1, 1500), (1, 300), (2, 990);

ALTER TABLE users ADD COLUMN phone text;
DROP TABLE IF EXISTS tmp_import;
```

## Чтение

```sql
SELECT id, email FROM users WHERE created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 10;

SELECT count(*) FROM orders WHERE status = 'new';

SELECT u.email, count(o.id) AS orders, sum(o.amount) AS total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.email
HAVING sum(o.amount) > 1000
ORDER BY total DESC;
```

- `WHERE` — фильтр строк, `GROUP BY` — группировка, `HAVING` — фильтр групп.
- `JOIN` (внутреннее) — только совпавшие строки; `LEFT JOIN` — все строки левой таблицы, даже без пары.
- Сравнение с NULL — `IS NULL`, а не `= NULL`.

## Изменение — осторожно

```sql
BEGIN;
UPDATE orders SET status = 'cancelled' WHERE id = 42;
SELECT * FROM orders WHERE id = 42;
COMMIT;

BEGIN;
DELETE FROM orders WHERE status = 'test';
ROLLBACK;
```

> [!warning] UPDATE и DELETE без WHERE
> `DELETE FROM orders;` удалит **всё**. Правило для прода: сначала `SELECT` с тем же `WHERE`, потом изменение **в транзакции**, проверка, затем `COMMIT`. В psql можно включить `\set AUTOCOMMIT off`.

`TRUNCATE` очищает таблицу мгновенно (без построчного удаления) — и тоже без возможности «передумать» после коммита.

## Индексы и EXPLAIN

```sql
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders (user_id);
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 1;
```

- `Seq Scan` по большой таблице для выборки нескольких строк — повод для индекса.
- `EXPLAIN` показывает план, `EXPLAIN ANALYZE` — ещё и выполняет запрос (осторожно с UPDATE/DELETE!).
- `CREATE INDEX CONCURRENTLY` строит индекс без блокировки записи — для живых таблиц в проде.
- Индексы ускоряют чтение, но замедляют запись и занимают место.

## Служебные запросы — шпаргалка эксплуатации

```sql
SELECT pid, usename, datname, state, now() - query_start AS duration, left(query, 80)
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY duration DESC;

SELECT pg_cancel_backend(12345);
SELECT pg_terminate_backend(12345);

SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;

SELECT pg_size_pretty(pg_database_size('app'));
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;

SELECT blocked.pid AS blocked_pid, blocking.pid AS blocking_pid, left(blocked.query, 60)
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));

SELECT version();
SELECT now(), pg_is_in_recovery();
```

- `pg_cancel_backend` — отменить текущий запрос, `pg_terminate_backend` — разорвать соединение.
- Состояние `idle in transaction` — открытая транзакция, которую приложение забыло закрыть: держит блокировки и мешает VACUUM.
- `pg_is_in_recovery()` = true — вы на **реплике**.

## VACUUM и ANALYZE

PostgreSQL при UPDATE/DELETE не перезаписывает строку на месте, а оставляет старую версию (MVCC). **VACUUM** освобождает место от «мёртвых» строк, **ANALYZE** собирает статистику для планировщика. Обычно всё делает **autovacuum** — его нельзя отключать. Признаки проблем: таблицы растут («bloat»), запросы деградируют, предупреждения о wraparound.

```sql
SELECT relname, n_dead_tup, last_autovacuum FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
VACUUM (VERBOSE, ANALYZE) orders;
```

## Выгрузка данных

```sql
\copy (SELECT * FROM orders WHERE status = 'new') TO 'orders.csv' WITH CSV HEADER
```

`\copy` в psql пишет файл на **клиенте**, `COPY ... TO '/path'` — на сервере (нужны права).

## Практика

- [ ] Создать таблицы users и orders, заполнить тестовыми данными (например, через `generate_series` на 1 млн строк)
- [ ] Написать запросы: последние 10 пользователей; число заказов по статусам; топ-5 пользователей по сумме заказов с JOIN и GROUP BY
- [ ] Выполнить UPDATE и DELETE в транзакции, проверить результат и откатить через ROLLBACK
- [ ] Сравнить `EXPLAIN ANALYZE` запроса по user_id до и после `CREATE INDEX CONCURRENTLY`
- [ ] Открыть транзакцию с UPDATE в одной сессии, такую же — во второй; найти блокировку через `pg_blocking_pids` и снять её
- [ ] Найти 10 самых больших таблиц и самые долгие активные запросы
- [ ] Выгрузить результат запроса в CSV через `\copy`

## Лаборатория

PostgreSQL 16 на стенде, база **`shop`**. Подключение администратором: `sudo -u postgres psql -d shop`.

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

### Самая большая таблица

Диск базы растёт. Найдите в базе `shop` таблицу, которая занимает **больше всего места вместе с индексами и TOAST**, и запишите её имя в `~/biggest-table.txt`, а её полный размер в байтах — в `~/biggest-size.txt`.

```bash setup
lab_shopdb
rm -f /home/student/biggest-table.txt /home/student/biggest-size.txt
```

```bash check
want=$(lab_psql -d shop -c "select relname from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 1")
size=$(lab_psql -d shop -c "select pg_total_relation_size('$want')")
[ -f /home/student/biggest-table.txt ] || fail "Нет ~/biggest-table.txt"
got=$(tr -d '[:space:]' < /home/student/biggest-table.txt); got=${got#public.}
[ "$got" = "$want" ] || fail "В ~/biggest-table.txt «$got» — это не самая большая таблица"
[ -f /home/student/biggest-size.txt ] || fail "Нет ~/biggest-size.txt"
gs=$(tr -d '[:space:]' < /home/student/biggest-size.txt)
[[ "$gs" =~ ^[0-9]+$ ]] || fail "В ~/biggest-size.txt должно быть число байт"
d=$(( gs > size ? gs - size : size - gs )); [ $d -le $(( size / 20 )) ] || fail "Размер $gs байт не совпадает с полным размером таблицы"
ok "$want: $(lab_psql -d shop -c "select pg_size_pretty(pg_total_relation_size('$want'))")"
```

```text hint
1. Список пользовательских таблиц есть в системном представлении статистики.
2. Полный размер (с индексами и TOAST) считает отдельная функция; для удобного вида — функция «красивый размер».
3. Отсортировать по размеру и взять первую.
```

```bash solution
sudo -u postgres psql -d shop -c "select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_stat_user_tables order by pg_total_relation_size(relid) desc"
sudo -u postgres psql -d shop -qXtA -c "select relname from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 1" > ~/biggest-table.txt
sudo -u postgres psql -d shop -qXtA -c "select pg_total_relation_size('$(cat ~/biggest-table.txt)')" > ~/biggest-size.txt
```

```text review
Эталон: `pg_total_relation_size(relid)` по `pg_stat_user_tables`.

- `pg_relation_size` — только данные таблицы, `pg_indexes_size` — индексы, `pg_total_relation_size` — всё вместе с TOAST (длинные значения хранятся отдельно). Размер базы — `pg_database_size('shop')`, в psql — `\l+` и `\dt+`.
- Обычные виновники роста: журналы и аудит без ротации (чистят партициями по месяцам: `DROP` старой партиции мгновенно освобождает место), «распухание» (bloat) после массовых UPDATE/DELETE, неиспользуемые индексы (`pg_stat_user_indexes.idx_scan = 0`).
- `DELETE` не возвращает место системе — только `VACUUM FULL` (блокирует таблицу) или `pg_repack`.
```

### Зависший запрос

На сервере висит **долгий запрос** от приложения `report-job` — он съедает ресурсы. Найдите его и **завершите**, не перезапуская PostgreSQL и не трогая другие подключения.

```bash setup
lab_shopdb
pkill -f 'application_name=report-job' 2>/dev/null; pkill -f 'application_name=web-app' 2>/dev/null
systemctl stop lab-pg-report lab-pg-web 2>/dev/null; systemctl reset-failed lab-pg-report lab-pg-web 2>/dev/null
systemd-run -q --unit=lab-pg-report -p User=postgres psql "dbname=shop application_name=report-job" -c "select pg_sleep(100000)"
systemd-run -q --unit=lab-pg-web -p User=postgres psql "dbname=shop application_name=web-app" -c "select pg_sleep(100000)"
sleep 1
lab_psql -c "select pg_postmaster_start_time()" > /var/lib/lab/pg-start
```

```bash check
[ "$(lab_psql -c 'select pg_postmaster_start_time()')" = "$(cat /var/lib/lab/pg-start)" ] || fail "PostgreSQL перезапускали — по условию нельзя"
n=$(lab_psql -c "select count(*) from pg_stat_activity where application_name = 'report-job'")
[ "$n" = 0 ] || fail "Запрос report-job всё ещё выполняется"
[ "$(lab_psql -c "select count(*) from pg_stat_activity where application_name = 'web-app'")" = 1 ] || fail "Завершено и подключение web-app — его трогать было не нужно"
ok "report-job завершён, остальные подключения на месте"
```

```text hint
1. Активные подключения и их запросы — в системном представлении активности: имя приложения, состояние, начало запроса, сам запрос, PID.
2. У PostgreSQL есть функции «отменить запрос» и «завершить подключение» по PID обслуживающего процесса.
3. Отфильтровать по имени приложения, а не убивать процессы из операционной системы.
```

```bash solution
sudo -u postgres psql -c "select pid, application_name, state, now() - query_start as duration, query from pg_stat_activity where state = 'active' order by duration desc"
sudo -u postgres psql -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'report-job'"
```

```text review
Эталон: `pg_stat_activity` → `pg_terminate_backend(pid)` (или мягче — `pg_cancel_backend(pid)`: отменить запрос, оставив подключение).

- Не убивайте процессы postgres через `kill -9`: postmaster сочтёт это аварией и перезапустит **все** подключения с восстановлением.
- Полезные колонки: `state` (`active`, `idle`, `idle in transaction` — опасные «висящие» транзакции), `wait_event_type` (ждёт блокировку, диск, клиента), `now() - xact_start` — длительность транзакции.
- Защита на будущее: `statement_timeout` для роли приложения (`ALTER ROLE report SET statement_timeout = '5min'`), `idle_in_transaction_session_timeout`.
```

```text notes
kill\s+(-9\s+)?[0-9] => Процесс завершали через kill из системы — для PostgreSQL безопаснее pg_cancel_backend/pg_terminate_backend; kill -9 обслуживающего процесса перезапускает все подключения.
```

### Кто держит блокировку

Обновление цены в таблице `settings` базы `shop` от приложения `billing` **зависло**: оно ждёт блокировку. Найдите подключение, которое её **держит**, и завершите **именно его** — после этого обновление `billing` должно само выполниться (значение `vat` станет `22`).

```bash setup
lab_shopdb
for u in lab-pg-holder lab-pg-billing; do systemctl stop $u 2>/dev/null; systemctl reset-failed $u 2>/dev/null; done
systemd-run -q --unit=lab-pg-holder -p User=postgres sh -c 'printf "BEGIN;\nUPDATE settings SET value = value WHERE key = '"'"'vat'"'"';\nSELECT pg_sleep(100000);\n" | psql "dbname=shop application_name=admin-console"'
sleep 1
systemd-run -q --unit=lab-pg-billing -p User=postgres psql "dbname=shop application_name=billing" -c "UPDATE settings SET value = '22' WHERE key = 'vat'"
sleep 1
lab_psql -c "select pg_postmaster_start_time()" > /var/lib/lab/pg-start
```

```bash check
[ "$(lab_psql -c 'select pg_postmaster_start_time()')" = "$(cat /var/lib/lab/pg-start)" ] || fail "PostgreSQL перезапускали"
for i in $(seq 10); do v=$(lab_psql -d shop -c "select value from settings where key = 'vat'"); [ "$v" = 22 ] && break; sleep 0.5; done
[ "$v" = 22 ] || fail "Обновление billing так и не выполнилось (vat = $v)"
[ "$(lab_psql -c "select count(*) from pg_stat_activity where application_name = 'admin-console'")" = 0 ] || fail "Подключение, державшее блокировку, всё ещё живо"
ok "блокировку держал admin-console — завершён, billing обновил vat"
```

```text hint
1. В представлении активности у ждущего запроса видно, что он ждёт блокировку (тип события ожидания).
2. Есть функция, которая по PID ждущего процесса возвращает массив PID тех, кто его блокирует.
3. Завершить блокирующее подключение и проверить значение.
```

```bash solution
sudo -u postgres psql -c "select pid, application_name, state, wait_event_type, pg_blocking_pids(pid) as blocked_by, query from pg_stat_activity where datname = 'shop'"
sudo -u postgres psql -c "select pg_terminate_backend(b) from pg_stat_activity a, unnest(pg_blocking_pids(a.pid)) b where a.application_name = 'billing'"
sleep 1
sudo -u postgres psql -d shop -c "select * from settings"
```

```text review
Эталон: `pg_blocking_pids(<PID billing>)` → `pg_terminate_backend(<блокирующий>)`.

- Классика: кто-то открыл транзакцию в консоли (`BEGIN; UPDATE ...`) и ушёл пить кофе — состояние `idle in transaction`. Его блокировки держатся до `COMMIT`/`ROLLBACK`, а за ним выстраивается очередь.
- Хуже всего, когда в очереди `ALTER TABLE` (миграция): он ждёт эксклюзивную блокировку, и **все** следующие запросы к таблице встают за ним. Поэтому миграциям ставят `SET lock_timeout = '5s'`.
- Защита: `idle_in_transaction_session_timeout`, короткие транзакции в приложении, мониторинг `pg_locks` и длительности транзакций.
```

## Тест

### Чем опасен запрос DELETE FROM orders без WHERE?
- [ ] Он ничего не сделает
- [x] Он удалит все строки таблицы
- [ ] Он удалит таблицу
- [ ] Он удалит только первую строку
> Перед изменением выполните SELECT с тем же условием и работайте в транзакции.

### Как безопасно выполнить ручное изменение данных в проде?
- [x] Сначала SELECT с тем же WHERE, чтобы увидеть затрагиваемые строки
- [x] Выполнить изменение внутри BEGIN, проверить результат, затем COMMIT или ROLLBACK
- [ ] Выполнить сразу без транзакции
- [ ] Отключить бэкапы
> Перед крупными изменениями — свежий бэкап.

### Чем LEFT JOIN отличается от обычного JOIN?
- [ ] Ничем
- [x] LEFT JOIN возвращает все строки левой таблицы, даже если для них нет совпадений справа; обычный JOIN — только совпавшие
- [ ] LEFT JOIN быстрее
- [ ] LEFT JOIN удаляет несовпавшие строки
> Например, пользователи без заказов попадут в результат с NULL.

### Чем WHERE отличается от HAVING?
- [x] WHERE фильтрует строки до группировки
- [x] HAVING фильтрует группы после GROUP BY, например по sum или count
- [ ] Это одно и то же
- [ ] HAVING работает только с JOIN
> Пример: HAVING sum(amount) > 1000.

### Как найти самые долгие выполняющиеся запросы?
- [ ] SELECT * FROM pg_tables
- [x] Через представление pg_stat_activity, отсортировав по now() - query_start
- [ ] Через pg_dump
- [ ] Через SHOW ALL
> Там же видны состояние, пользователь и текст запроса.

### Чем pg_cancel_backend отличается от pg_terminate_backend?
- [x] pg_cancel_backend отменяет текущий запрос, соединение остаётся
- [x] pg_terminate_backend разрывает соединение целиком
- [ ] Это одно и то же
- [ ] pg_terminate_backend перезапускает сервер
> Начинайте с отмены запроса.

### Что делает EXPLAIN ANALYZE?
- [ ] Только показывает план без выполнения
- [x] Выполняет запрос и показывает фактический план с временем и числом строк
- [ ] Создаёт индекс
- [ ] Удаляет статистику
> Для UPDATE и DELETE запускайте его внутри транзакции с ROLLBACK.

### Почему в проде индексы создают через CREATE INDEX CONCURRENTLY?
- [ ] Так индекс получается меньше
- [x] Индекс строится без блокировки записи в таблицу, и приложение продолжает работать
- [ ] Так индекс создаётся быстрее
- [ ] Это единственный способ создать индекс
> Цена — сборка идёт дольше и её нельзя выполнять внутри транзакции.

### Что означает состояние idle in transaction в pg_stat_activity?
- [ ] Соединение закрыто
- [x] Сессия открыла транзакцию и ничего не делает, но держит блокировки и мешает VACUUM
- [ ] Идёт бэкап
- [ ] Это реплика
> Частая ошибка приложений; помогает idle_in_transaction_session_timeout.

### Для чего нужен VACUUM?
- [ ] Для удаления базы
- [x] Чтобы освобождать место от старых версий строк, оставшихся после UPDATE и DELETE (MVCC), и предотвращать проблемы с переполнением счётчика транзакций
- [ ] Для создания бэкапа
- [ ] Для сжатия WAL
> Обычно его выполняет autovacuum, который нельзя отключать.

### Как проверить, что вы подключены к реплике, а не к primary?
= SELECT pg_is_in_recovery()
= pg_is_in_recovery()
> На реплике функция возвращает true.

### Как правильно сравнить колонку с NULL?
- [ ] WHERE phone = NULL
- [x] WHERE phone IS NULL
- [ ] WHERE phone == NULL
- [ ] WHERE NULL(phone)
> Любое сравнение с NULL через = даёт NULL, а не true.
