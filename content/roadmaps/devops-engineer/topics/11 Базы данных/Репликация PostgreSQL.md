---
title: Репликация PostgreSQL
slug: replikaciya-postgresql
description: Физическая потоковая репликация — primary и standby, hot standby, настройка через pg_basebackup -R, слоты репликации, синхронный и асинхронный режим, мониторинг отставания, ручное переключение и Patroni, логическая репликация.
duration: 90
level: Продвинутый
quizSize: 10
materials:
  - title: PostgreSQL Docs — Log-Shipping Standby Servers (Streaming Replication)
    url: https://www.postgresql.org/docs/18/warm-standby.html
    type: документация
  - title: PostgreSQL Wiki — Streaming Replication
    url: https://wiki.postgresql.org/wiki/Streaming_Replication
    type: документация
  - title: PostgreSQL Docs — pg_hba.conf (replication)
    url: https://www.postgresql.org/docs/current/auth-pg-hba-conf.html
    type: документация
---

# Репликация PostgreSQL

Репликация решает две задачи:

- **отказоустойчивость** — умер primary, реплику повышают до primary за минуты;
- **масштабирование чтения** — отчёты и тяжёлые SELECT уходят на реплики.

## Как работает потоковая репликация

```
 приложение ──запись──► PRIMARY ──WAL по TCP (walsender → walreceiver)──► STANDBY (hot standby: только чтение)
                           │                                                │
                       pg_wal/                                         проигрывает WAL
```

Primary пишет все изменения в WAL и **потоком** отправляет его репликам. Реплика непрерывно проигрывает WAL и остаётся побайтовой копией кластера (все базы). Это **физическая** репликация: та же мажорная версия, только чтение на реплике (**hot standby**).

## Настройка

На **primary**:

```
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
listen_addresses = '*'
```

```sql
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'S3cr3t!';
```

`pg_hba.conf`:

```
host  replication  replicator  10.0.1.20/32  scram-sha-256
```

На **standby** (пустой каталог данных, сервер остановлен):

```bash
sudo systemctl stop postgresql
sudo -u postgres rm -rf /var/lib/postgresql/18/main/*
sudo -u postgres pg_basebackup -h 10.0.1.10 -U replicator \
  -D /var/lib/postgresql/18/main -X stream -R -C -S standby1 -P
sudo systemctl start postgresql
```

- `-R` — записать `primary_conninfo` в `postgresql.auto.conf` и создать файл **`standby.signal`** (признак реплики, PostgreSQL 12+).
- `-C -S standby1` — создать **слот репликации**.
- `hot_standby = on` (по умолчанию) — разрешить чтение на реплике.

## Слоты репликации

**Слот** заставляет primary хранить WAL, пока реплика его не получит. Реплика отстала или выключилась на час — догонит без пересоздания.

Обратная сторона: **заброшенный слот** (реплику удалили, а слот нет) держит WAL бесконечно, и `pg_wal` заполнит диск. Ограничение — `max_slot_wal_keep_size`.

```sql
SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained
FROM pg_replication_slots;
SELECT pg_drop_replication_slot('old_standby');
```

## Синхронная и асинхронная

| | Асинхронная (по умолчанию) | Синхронная |
| --- | --- | --- |
| COMMIT на primary ждёт реплику? | Нет | Да (подтверждение записи WAL на реплике) |
| Потеря данных при падении primary | Возможна (последние транзакции) | Нет (для подтверждённых транзакций) |
| Задержка записи | Минимальная | Растёт на сетевой круг до реплики |
| Если реплика недоступна | Ничего | Запись **останавливается**, пока нет синхронной реплики |

```
synchronous_standby_names = 'ANY 1 (standby1, standby2)'
synchronous_commit = on
```

Синхронную ставят как минимум с **двумя** репликами (`ANY 1`), чтобы отказ одной не остановил запись.

## Мониторинг

На primary:

```sql
SELECT client_addr, state, sync_state,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS lag_bytes,
       replay_lag
FROM pg_stat_replication;
```

На реплике:

```sql
SELECT pg_is_in_recovery(), now() - pg_last_xact_replay_timestamp() AS replay_delay;
SELECT status, sender_host FROM pg_stat_wal_receiver;
```

Алертить: реплика отключилась, отставание больше N секунд/МБ, растёт размер WAL у слотов.

## Переключение (failover)

Ручное повышение реплики:

```sql
SELECT pg_promote();
```

(или `pg_ctl promote`). После этого:

1. Переключить приложения на новый primary (DNS, VIP, балансировщик, PgBouncer).
2. **Старый primary не должен вернуться как primary** — иначе **split-brain**: две базы принимают запись. Его пересоздают репликой (`pg_rewind` или новый `pg_basebackup`).

Автоматический failover делают инструменты:

- **Patroni** — стандарт де-факто: хранит лидерство в etcd/Consul/Kubernetes, сам повышает реплику, предотвращает split-brain; часто вместе с HAProxy/PgBouncer;
- **CloudNativePG** в Kubernetes; managed-базы в облаках;
- repmgr, pg_auto_failover.

## Логическая репликация

`PUBLICATION` на источнике + `SUBSCRIPTION` на приёмнике: реплицируются **изменения строк** выбранных таблиц, а не файлы.

```sql
CREATE PUBLICATION app_pub FOR TABLE users, orders;
CREATE SUBSCRIPTION app_sub CONNECTION 'host=old-db dbname=app user=replicator' PUBLICATION app_pub;
```

Применение: **обновление мажорной версии почти без простоя**, перенос части таблиц, интеграции. Ограничения: DDL (изменения схемы) не реплицируется, нужны первичные ключи, последовательности — отдельно.

## Практика

- [ ] Поднять две ВМ (или два контейнера) с PostgreSQL одной версии и настроить потоковую репликацию через `pg_basebackup -R -C -S`
- [ ] Создать таблицу на primary и убедиться, что она появилась на реплике; попробовать записать на реплике и получить ошибку read-only
- [ ] Посмотреть `pg_stat_replication` на primary и задержку на реплике
- [ ] Остановить реплику на время, сделать много записей и посмотреть, как растёт удержанный слотом WAL; запустить реплику и дождаться догоняния
- [ ] Включить синхронную репликацию с одной репликой, выключить реплику и убедиться, что запись на primary встала; вернуть асинхронный режим
- [ ] Выполнить ручной failover через `pg_promote()` и пересоздать старый primary как реплику
- [ ] Настроить логическую репликацию одной таблицы между двумя базами (по желанию — между разными мажорными версиями)
- [ ] Прочитать документацию Patroni и описать, как он предотвращает split-brain

## Лаборатория

Главный сервер — кластер `16/main` на порту 5432. Реплику поднимите **вторым кластером на этом же стенде** — `16/replica` на порту **5433** (в жизни это отдельный сервер; команды те же).

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

### Потоковая реплика

Настройте потоковую репликацию:

1. на главном — роль **`replicator`** с правом репликации и паролем `repl-pass` (правило в `pg_hba.conf` для репликации с localhost по паролю уже есть);
2. кластер **`16/replica`** на порту **5433** — копия главного, сделанная **`pg_basebackup`**, работает как **реплика в режиме восстановления** и получает изменения потоком.

Проверка: на главном в `pg_stat_replication` есть реплика в состоянии `streaming`, а строка, вставленная в главный, появляется на реплике.

```bash setup
pg_dropcluster 16 replica --stop >/dev/null 2>&1; rm -rf /var/lib/postgresql/16/replica /etc/postgresql/16/replica
lab_psql -c "DROP ROLE IF EXISTS replicator" >/dev/null
lab_shopdb
```

```bash check
pg_lsclusters | awk '$2 == "replica" && $3 == 5433' | grep -q . || fail "Кластера 16/replica на порту 5433 нет"
pg_lsclusters | awk '$2 == "replica"' | grep -q online || fail "Кластер 16/replica не запущен"
[ "$(sudo -u postgres psql -p 5433 -qXtA -c 'select pg_is_in_recovery()' 2>/dev/null)" = t ] || fail "16/replica не в режиме восстановления — это самостоятельный сервер, а не реплика"
st=$(lab_psql -c "select state from pg_stat_replication where application_name <> '' limit 1")
[ "$st" = streaming ] || fail "На главном в pg_stat_replication нет реплики в состоянии streaming (сейчас: ${st:-нет записей})"
[ "$(lab_psql -c "select rolreplication from pg_roles where rolname = 'replicator'")" = t ] || fail "Нет роли replicator с правом репликации"
mark="probe-$RANDOM$RANDOM"
lab_psql -d shop -c "INSERT INTO settings VALUES ('$mark', 'x')" >/dev/null
for i in $(seq 20); do [ "$(sudo -u postgres psql -p 5433 -d shop -qXtA -c "select count(*) from settings where key = '$mark'" 2>/dev/null)" = 1 ] && break; sleep 0.25; done
[ "$(sudo -u postgres psql -p 5433 -d shop -qXtA -c "select count(*) from settings where key = '$mark'" 2>/dev/null)" = 1 ] || fail "Строка, вставленная в главный, не появилась на реплике"
lab_psql -d shop -c "DELETE FROM settings WHERE key = '$mark'" >/dev/null
ok "реплика 5433 streaming, отставание: $(lab_psql -c "select coalesce(replay_lag::text, '0') from pg_stat_replication limit 1")"
```

```text hint
1. На главном создать роль с правами входа и репликации.
2. Создать пустой кластер Debian-утилитой с нужным именем и портом, не запуская его, и очистить его каталог данных.
3. Залить в этот каталог копию главного утилитой физического бэкапа: от имени роли репликации, с потоковой передачей WAL и ключом, который сам запишет настройки подключения к главному и пометит кластер как реплику.
4. Запустить кластер-реплику и посмотреть статус репликации на главном.
```

```bash solution
sudo -u postgres psql -c "CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'repl-pass'"
sudo pg_createcluster 16 replica -p 5433 >/dev/null
sudo find /var/lib/postgresql/16/replica -mindepth 1 -delete
sudo -u postgres env PGPASSWORD=repl-pass pg_basebackup -h 127.0.0.1 -p 5432 -U replicator -D /var/lib/postgresql/16/replica -R -X stream -P
sudo pg_ctlcluster 16 replica start
sleep 2
sudo -u postgres psql -c "select application_name, state, sent_lsn, replay_lsn from pg_stat_replication"
```

```text review
Эталон: роль `REPLICATION` → `pg_createcluster 16 replica -p 5433` → `pg_basebackup -R -X stream` в пустой каталог → запуск.

- Ловушка: `sudo rm -rf /var/lib/postgresql/16/replica/*` не очистит каталог — звёздочку раскрывает **ваша** оболочка, а у вас нет прав на чтение каталога postgres. Нужно `sudo find ... -mindepth 1 -delete` или `sudo -u postgres sh -c 'rm -rf .../*'`.
- `pg_basebackup` копирует весь кластер на уровне файлов; `-R` создаёт `standby.signal` и `primary_conninfo` в `postgresql.auto.conf` — сервер стартует как реплика.
- Реплика — read-only: на ней можно читать (отчёты, аналитика) и с неё переключаются при аварии (`pg_ctlcluster 16 replica promote` / `SELECT pg_promote()`).
- Мониторинг: `pg_stat_replication` на главном (`state`, `*_lag`), `pg_stat_wal_receiver` на реплике. Отставание растёт — тяжёлые запросы на реплике или узкий канал.
- Репликация — **не бэкап**: `DROP TABLE` на главном мгновенно уедет на реплику. Автоматическое переключение и кластер — Patroni + etcd.
- Слоты репликации (`-S slot --create-slot`) не дадут главному удалить WAL, пока реплика его не забрала, — но отставшая навсегда реплика со слотом заполнит диск главного.
```

## Тест

### Что передаёт primary реплике при потоковой физической репликации?
- [ ] SQL-запросы приложения
- [x] Поток WAL-записей, которые реплика проигрывает
- [ ] Дампы pg_dump
- [ ] Только изменённые таблицы
> Реплика остаётся побайтовой копией всего кластера.

### Что такое hot standby?
- [ ] Реплика, недоступная для подключений
- [x] Реплика, которая проигрывает WAL и одновременно обслуживает запросы только на чтение
- [ ] Резервный сервер без PostgreSQL
- [ ] Primary с включённым бэкапом
> Warm standby не принимает подключения до повышения.

### Что делает флаг -R у pg_basebackup?
- [ ] Восстанавливает базу
- [x] Записывает параметры подключения к primary и создаёт standby.signal, чтобы сервер запустился как реплика
- [ ] Удаляет старые WAL
- [ ] Включает синхронную репликацию
> -C -S дополнительно создают слот репликации.

### Чем полезен и чем опасен слот репликации?
- [x] Полезен: primary хранит WAL, пока реплика его не получит, и отставшая реплика сможет догнать
- [x] Опасен: заброшенный слот бесконечно удерживает WAL и может переполнить диск primary
- [ ] Слот шифрует трафик репликации
- [ ] Слот делает репликацию синхронной
> Ограничение — max_slot_wal_keep_size, мониторинг — pg_replication_slots.

### Чем синхронная репликация отличается от асинхронной?
- [x] При синхронной COMMIT ждёт подтверждения от реплики — подтверждённые транзакции не теряются
- [x] При асинхронной COMMIT не ждёт реплику — быстрее, но при падении primary последние транзакции могут потеряться
- [ ] Синхронная работает только в облаке
- [ ] Асинхронная копирует только схему
> Синхронную настраивают с запасом реплик, чтобы отказ одной не останавливал запись.

### Что произойдёт при синхронной репликации с единственной синхронной репликой, если она станет недоступна?
- [ ] Ничего
- [x] Транзакции на primary будут ждать подтверждения, и запись фактически остановится
- [ ] Primary станет репликой
- [ ] Реплика удалится
> Поэтому используют ANY 1 из нескольких реплик.

### Как посмотреть состояние и отставание реплик на primary?
= pg_stat_replication
= select * from pg_stat_replication
> На реплике — pg_stat_wal_receiver и pg_last_xact_replay_timestamp().

### Что такое split-brain и как его избежать?
- [ ] Разделение базы на шарды
- [x] Ситуация, когда два сервера одновременно принимают запись как primary; избегают с помощью инструментов вроде Patroni и не возвращая старый primary без пересоздания репликой
- [ ] Отставание реплики
- [ ] Ошибка в pg_hba.conf
> Данные двух «primary» затем почти невозможно свести.

### Как вручную повысить реплику до primary?
- [ ] DROP DATABASE на primary
- [x] SELECT pg_promote() (или pg_ctl promote) на реплике
- [ ] Перезапустить primary
- [ ] Удалить postgresql.conf
> Затем переключить приложения и пересоздать старый primary репликой.

### Какой инструмент — стандарт де-факто для автоматического failover PostgreSQL на ВМ?
= Patroni
> Он хранит информацию о лидере в etcd, Consul или Kubernetes.

### Для чего чаще всего используют логическую репликацию?
- [ ] Для создания побайтовой копии кластера
- [x] Для переноса данных между разными мажорными версиями (обновление почти без простоя) и репликации отдельных таблиц
- [ ] Для бэкапа WAL
- [ ] Для чтения с реплики
> Изменения схемы (DDL) при этом не реплицируются.

### Можно ли реплицировать физически между PostgreSQL 17 и 18?
- [ ] Да, всегда
- [x] Нет: физическая репликация требует одинаковой мажорной версии; между версиями используют логическую репликацию
- [ ] Только синхронно
- [ ] Только через pg_dump
> Обновление мажорной версии — pg_upgrade или логическая репликация.
