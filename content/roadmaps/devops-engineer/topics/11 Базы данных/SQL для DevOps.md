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
