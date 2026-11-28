---
title: Redis
slug: redis
description: Redis и Valkey — хранилище в памяти, типы данных, TTL и паттерны кэша, maxmemory и политики вытеснения, персистентность RDB и AOF, репликация, Sentinel и Cluster, безопасность и диагностика через redis-cli.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: Redis Docs — Redis persistence
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
    type: документация
  - title: Redis Blog — What is Valkey (лицензии и форк)
    url: https://redis.io/blog/what-is-valkey/
    type: статья
---

# Redis

**Redis** — хранилище ключ-значение **в оперативной памяти**: ответы за доли миллисекунды. Применения:

- **кэш** перед базой или медленным API;
- **сессии** пользователей;
- счётчики, лимиты запросов (rate limiting), блокировки;
- очереди и pub/sub (для серьёзных очередей — RabbitMQ/Kafka, тема впереди);
- рейтинги (sorted sets), гео-запросы.

> [!note] Redis и Valkey
> В 2024 году Redis сменил лицензию на несвободную, и под эгидой Linux Foundation появился форк **Valkey** (лицензия BSD), который поддержали крупные облака. С Redis 8 снова доступна открытая лицензия AGPLv3. Valkey совместим по протоколу и командам; многие облачные «managed Redis» сейчас работают на Valkey. Всё ниже относится к обоим.

## Типы данных

```
SET user:42:name "Аня"
GET user:42:name
INCR page:views
SET session:abc '{"user":42}' EX 3600

HSET user:42 name "Аня" email "a@example.com"
HGET user:42 email
HGETALL user:42

LPUSH queue:emails "msg1"
RPOP queue:emails

SADD online:users 42 43
SISMEMBER online:users 42

ZADD leaderboard 1500 "anya" 900 "boris"
ZREVRANGE leaderboard 0 9 WITHSCORES

XADD events * type login user 42
```

| Тип | Что это | Пример |
| --- | --- | --- |
| String | Строка или число | Кэш страницы, счётчик |
| Hash | Словарь полей | Профиль пользователя |
| List | Список (очередь) | Простая очередь задач |
| Set | Множество уникальных | Онлайн-пользователи |
| Sorted set | Множество с весами | Рейтинги, очереди с приоритетом |
| Stream | Журнал событий с группами потребителей | Лента событий |

Ключи принято называть с пространством имён: `объект:id:поле`.

## TTL и кэширование

```
SET cache:product:7 "..." EX 300
EXPIRE session:abc 1800
TTL session:abc
PERSIST session:abc
```

`TTL` вернёт оставшиеся секунды, `-1` — без срока, `-2` — ключа нет.

Паттерн **cache-aside**: приложение ищет в Redis → нет → читает из базы → кладёт в Redis с TTL. Проблемы кэша:

- **инвалидация** — при изменении данных удалить или обновить ключ;
- **cache stampede** — популярный ключ истёк, и тысяча запросов одновременно идут в базу (решения: блокировка на пересчёт, «джиттер» TTL);
- кэш **не источник истины** — данные должны восстанавливаться из базы.

## Память и вытеснение

Redis хранит всё в RAM — нужно ограничение:

```
maxmemory 2gb
maxmemory-policy allkeys-lru
```

| Политика | Что удаляет при нехватке памяти |
| --- | --- |
| `noeviction` | Ничего — запись возвращает ошибку (значение по умолчанию в открытом Redis) |
| `allkeys-lru` / `allkeys-lfu` | Давно / редко использовавшиеся ключи среди всех — **для чистого кэша** |
| `volatile-lru` / `volatile-lfu` / `volatile-ttl` | Только ключи с TTL |
| `allkeys-random` / `volatile-random` | Случайные |

Для кэша — `allkeys-lru`/`lfu`. Если в Redis есть данные, которые нельзя терять (очереди, сессии без резерва), — `noeviction` или `volatile-*` и запас памяти.

## Персистентность

| Режим | Как | Плюсы | Минусы |
| --- | --- | --- | --- |
| **RDB** | Снимок всех данных раз в N минут (`save 900 1`, `BGSAVE`) | Компактный файл, быстрый рестарт, удобно для бэкапа | Потеря изменений после последнего снимка |
| **AOF** | Журнал всех операций записи (`appendonly yes`, `appendfsync everysec`) | Теряется максимум ~1 секунда | Файл больше, нужна перезапись (rewrite) |
| RDB + AOF | Оба | Надёжность и быстрый рестарт | — |
| Без персистентности | — | Максимальная скорость | После рестарта пусто — нормально для чистого кэша |

`BGSAVE` и перезапись AOF делают `fork()` — в пике нужно до ×2 памяти при активной записи (copy-on-write). Оставляйте запас RAM и не запускайте Redis с RAM «впритык».

## Высокая доступность и масштаб

- **Репликация**: `REPLICAOF host port` — асинхронные реплики для чтения и резерва.
- **Sentinel** — следит за primary, автоматически повышает реплику, сообщает клиентам новый адрес (кворум из 3 Sentinel).
- **Cluster** — шардирование на **16384 слота** между несколькими primary (каждый со своими репликами); ключи распределяются по хешу. Мультиключевые операции — только для ключей в одном слоте (hash tags `{user42}`).
- В Kubernetes — операторы или Helm-чарты; в облаке — managed-сервисы.

## Безопасность

- **Никогда не открывайте 6379 в интернет** — открытые Redis массово взламывают (запись SSH-ключей, майнеры).
- `bind` на внутренний адрес, `protected-mode yes`, пароль (`requirepass`) или **ACL** с пользователями и правами, TLS.
- Переименовать или запретить опасные команды (`FLUSHALL`, `CONFIG`, `KEYS`) через ACL.

## Диагностика

```bash
redis-cli -h redis -a "$PASS" PING
redis-cli INFO memory
redis-cli INFO replication
redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses|evicted_keys"
redis-cli SLOWLOG GET 10
redis-cli --bigkeys
redis-cli --latency
redis-cli --scan --pattern 'session:*' | head
```

- **`KEYS *` в проде — нельзя**: Redis выполняет команды в одном потоке, и перебор миллионов ключей заблокирует все остальные запросы. Используйте `SCAN`.
- Hit ratio = hits / (hits + misses) — эффективность кэша.
- `evicted_keys` растёт — не хватает памяти.
- Метрики для Prometheus — redis_exporter.

## Практика

- [ ] Запустить Redis (или Valkey) в Docker, поработать со строками, хешами, списками, множествами и sorted set через redis-cli
- [ ] Поставить ключам TTL и проверить TTL, EXPIRE и PERSIST
- [ ] Реализовать в своём приложении кэш-aside для тяжёлого запроса и измерить время ответа до и после
- [ ] Ограничить `maxmemory 10mb` с `allkeys-lru`, заполнить данными и посмотреть `evicted_keys`; затем с `noeviction` получить ошибку записи
- [ ] Включить AOF, записать данные, перезапустить контейнер и проверить, что данные сохранились
- [ ] Настроить реплику через REPLICAOF и проверить INFO replication
- [ ] Включить пароль и ACL-пользователя только с правами на чтение
- [ ] Сравнить `KEYS *` и `SCAN` на миллионе ключей

## Лаборатория

Redis 7 установлен из пакетов и работает как служба `redis-server`, конфиг — `/etc/redis/redis.conf`. Клиент — `redis-cli`.

### Пароль и лимит памяти

Настройте Redis как кэш:

- **пароль** `cache-pass-91` для подключения;
- **лимит памяти** 64 МБ;
- при достижении лимита вытесняются **наименее давно использованные ключи из всех** (не только с TTL).

Настройки должны действовать сейчас и **сохраниться в конфиге** после перезапуска службы.

```bash setup
sed -i -E '/^(requirepass|maxmemory|maxmemory-policy|user default)\s/d' /etc/redis/redis.conf
systemctl restart redis-server
for i in $(seq 20); do redis-cli ping 2>/dev/null | grep -q PONG && break; sleep 0.25; done
```

```bash check
r() { redis-cli -a cache-pass-91 --no-auth-warning "$@" 2>/dev/null; }
redis-cli ping 2>&1 | grep -q PONG && fail "Redis отвечает без пароля"
[ "$(r ping)" = PONG ] || fail "С паролем cache-pass-91 Redis не отвечает"
[ "$(r config get maxmemory | tail -1)" = 67108864 ] || fail "maxmemory = $(r config get maxmemory | tail -1)"
[ "$(r config get maxmemory-policy | tail -1)" = allkeys-lru ] || fail "Политика вытеснения — $(r config get maxmemory-policy | tail -1)"
grep -qE '^requirepass\s+"?cache-pass-91"?' /etc/redis/redis.conf || fail "Пароль не сохранён в /etc/redis/redis.conf — пропадёт после перезапуска"
grep -qE '^maxmemory\s+(64mb|67108864)' /etc/redis/redis.conf || fail "maxmemory не сохранён в конфиге"
grep -qE '^maxmemory-policy\s+allkeys-lru' /etc/redis/redis.conf || fail "maxmemory-policy не сохранена в конфиге"
ok "пароль, maxmemory 64mb, allkeys-lru — сейчас и в конфиге"
```

```text hint
1. Параметры можно поменять на лету командой «установить параметр конфигурации», а затем попросить Redis переписать свой конфиг с текущими значениями. Либо поправить конфиг и перезапустить службу.
2. Политик вытеснения несколько: по LRU, LFU, случайно; одни выбирают из всех ключей, другие — только из ключей с TTL.
3. После установки пароля все команды клиента — с паролем.
```

```bash solution
redis-cli config set maxmemory 64mb
redis-cli config set maxmemory-policy allkeys-lru
redis-cli config set requirepass cache-pass-91
redis-cli -a cache-pass-91 --no-auth-warning config rewrite
grep -E '^(requirepass|maxmemory)' /etc/redis/redis.conf
```

```text review
Эталон: `CONFIG SET` × 3 → `CONFIG REWRITE` (записывает текущие значения в redis.conf).

- Redis без пароля, открытый в сеть, — классическая дыра: через `CONFIG SET dir` и `SAVE` записывают ключ SSH на сервер. Минимум: `bind 127.0.0.1` или приватная сеть, пароль (`requirepass`) или ACL-пользователи (`ACL SETUSER`), отключённые опасные команды.
- Без `maxmemory` кэш съест всю память сервера и придёт OOM killer. `allkeys-lru` — для кэша; `volatile-lru` — вытесняет только ключи с TTL (если в Redis ещё и данные без TTL); `noeviction` — ошибки на запись (для очередей и сессий, которые нельзя терять).
- Посмотреть потребление: `INFO memory` (`used_memory_human`, `evicted_keys` в `INFO stats`).
```

### Сессии без срока жизни

В Redis (пароль уже стоит: `cache-pass-91`) накопились ключи сессий `session:*`: у части из них **нет срока жизни**, и они висят вечно. Найдите все такие ключи и поставьте им TTL **3600 секунд**. Ключи с другими префиксами и сессии, у которых срок уже есть, не трогайте. Используйте `SCAN`, а не `KEYS` — на большом Redis `KEYS` блокирует сервер.

```bash setup
sed -i -E '/^(requirepass|maxmemory|maxmemory-policy|user default)\s/d' /etc/redis/redis.conf
echo 'requirepass cache-pass-91' >> /etc/redis/redis.conf
systemctl restart redis-server
for i in $(seq 20); do redis-cli -a cache-pass-91 --no-auth-warning ping 2>/dev/null | grep -q PONG && break; sleep 0.25; done
r() { redis-cli -a cache-pass-91 --no-auth-warning "$@" >/dev/null; }
redis-cli -a cache-pass-91 --no-auth-warning flushall >/dev/null
for i in $(seq 1 300); do r set "session:$i" "user$i"; done
for i in $(seq 1 300); do [ $((i % 3)) = 0 ] && r expire "session:$i" 600; done
for i in $(seq 1 50); do r set "product:$i" "item$i"; done
```

```bash check
r() { redis-cli -a cache-pass-91 --no-auth-warning "$@" 2>/dev/null; }
bad=0; set3600=0; kept=0
for i in $(seq 1 300); do
  t=$(r ttl "session:$i")
  [ "$t" = -1 ] && bad=$((bad + 1))
  if [ $((i % 3)) = 0 ]; then [ "$t" -le 600 ] && kept=$((kept + 1)); else [ "$t" -gt 3000 ] && set3600=$((set3600 + 1)); fi
done
[ $bad = 0 ] || fail "Ключей session:* без срока жизни осталось: $bad"
[ $set3600 = 200 ] || fail "TTL около 3600 стоит у $set3600 из 200 сессий без срока"
[ $kept = 100 ] || fail "Изменён срок у сессий, у которых он уже был"
[ "$(r ttl product:1)" = -1 ] || fail "Задеты ключи product:*"
ok "200 сессий получили TTL 3600, остальные ключи не тронуты"
```

```text hint
1. Перебор ключей по шаблону без блокировки — команда SCAN с курсором; у redis-cli есть режим, который сам делает этот перебор по шаблону.
2. Для каждого ключа узнать оставшийся срок жизни: значение -1 означает «без срока».
3. Поставить срок только таким ключам.
```

```bash solution
export REDISCLI_AUTH=cache-pass-91
redis-cli --scan --pattern 'session:*' | while read -r k; do
  [ "$(redis-cli ttl "$k")" = -1 ] && redis-cli expire "$k" 3600 >/dev/null
done
redis-cli --scan --pattern 'session:*' | head -3 | xargs -I{} redis-cli ttl {}
```

```text review
Эталон: `redis-cli --scan --pattern 'session:*'` → для ключей с `TTL = -1` — `EXPIRE key 3600`.

- `KEYS session:*` перебирает всё пространство ключей за одну команду — Redis однопоточный, и на миллионах ключей он «замирает» на секунды. `SCAN` отдаёт порциями.
- TTL: `-1` — срока нет, `-2` — ключа нет, иначе — секунды до удаления. Ставить TTL нужно сразу при записи: `SET key value EX 3600`.
- `REDISCLI_AUTH` вместо `-a`: пароль не светится в списке процессов и истории.
- Для массовых операций быстрее Lua-скрипт (`EVAL`) или конвейер (`--pipe`): здесь на каждый ключ — отдельное соединение.
```

```text notes
\bkeys\s+['"]?session => Использовалась команда KEYS — на большой базе она блокирует Redis. Перебор — через SCAN (redis-cli --scan).
```

## Тест

### Где Redis хранит данные во время работы?
- [ ] На диске, как PostgreSQL
- [x] В оперативной памяти — поэтому он очень быстрый, а объём ограничен RAM
- [ ] В облаке
- [ ] В браузере пользователя
> Персистентность (RDB, AOF) — дополнительная копия на диске.

### Какой тип данных подходит для рейтинга игроков по очкам?
= sorted set
= zset
> ZADD и ZREVRANGE с WITHSCORES.

### Что вернёт команда TTL для ключа без срока жизни?
- [ ] 0
- [x] -1
- [ ] -2
- [ ] NULL
> -2 означает, что ключа не существует.

### Как работает паттерн cache-aside?
- [ ] База сама кладёт данные в Redis
- [x] Приложение ищет данные в кэше, при промахе читает из базы и кладёт результат в кэш с TTL
- [ ] Redis сам ходит в базу
- [ ] Данные пишутся только в Redis
> Кэш не должен быть единственным источником истины.

### Какую политику вытеснения выбрать для Redis, используемого только как кэш?
- [ ] noeviction
- [x] allkeys-lru или allkeys-lfu
- [ ] volatile-ttl
- [ ] Никакую, Redis не ограничивает память
> noeviction при нехватке памяти начнёт возвращать ошибки записи.

### Чем RDB отличается от AOF?
- [x] RDB — периодические снимки всех данных: компактно, но теряются изменения после последнего снимка
- [x] AOF — журнал всех операций записи: при appendfsync everysec теряется максимум около секунды
- [ ] AOF хранит данные только в памяти
- [ ] RDB невозможно восстановить
> Их можно включить одновременно.

### Почему команду KEYS * нельзя запускать в продакшене?
- [ ] Она удаляет ключи
- [x] Redis выполняет команды в одном потоке, и перебор всех ключей блокирует остальные запросы
- [ ] Она требует перезапуска
- [ ] Она доступна только в Cluster
> Используйте SCAN — он перебирает ключи порциями.

### Почему Redis нельзя открывать в интернет без защиты?
- [x] Открытые экземпляры массово сканируют и взламывают — записывают SSH-ключи, ставят майнеры, удаляют данные
- [x] По умолчанию у Redis может не быть пароля
- [ ] Redis не поддерживает TCP
- [ ] Это замедляет репликацию
> bind на внутренний адрес, пароль или ACL, файрвол, TLS.

### Что делает Redis Sentinel?
- [ ] Шардирует данные
- [x] Следит за primary и при его отказе автоматически повышает реплику, сообщая клиентам новый адрес
- [ ] Шифрует данные
- [ ] Делает бэкапы
> Шардирование — задача Redis Cluster.

### На сколько слотов Redis Cluster делит пространство ключей?
= 16384
> Каждый primary кластера отвечает за часть слотов.

### Что такое Valkey?
- [ ] Платная версия Redis
- [x] Открытый форк Redis под эгидой Linux Foundation, созданный после смены лицензии Redis; совместим по протоколу и командам
- [ ] Клиент для Redis
- [ ] Модуль шифрования Redis
> Лицензия Valkey — BSD; Redis 8 снова доступен под открытой AGPLv3.

### Почему серверу с Redis нужен запас оперативной памяти сверх maxmemory?
- [ ] Redis всегда занимает в 10 раз больше
- [x] При BGSAVE и перезаписи AOF выполняется fork, и при активной записи копирование страниц (copy-on-write) может временно удвоить потребление памяти
- [ ] Для логов
- [ ] Для кэша ОС не нужно
> Без запаса возможен OOM Killer.
