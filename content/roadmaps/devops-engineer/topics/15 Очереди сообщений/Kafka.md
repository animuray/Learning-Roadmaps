---
title: Kafka
slug: kafka
description: Apache Kafka — брокеры и кластер, KRaft вместо ZooKeeper, топики и партиции, оффсеты, продюсеры и ключи, acks и идемпотентность, консьюмеры и consumer group, ребалансировка, репликация, лидер и ISR, хранение и retention, compaction, CLI-инструменты, эксплуатация и мониторинг lag.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Confluent — Introduction to Apache Kafka
    url: https://docs.confluent.io/platform/current/kafka/introduction.html
    type: документация
  - title: Apache Kafka 4.0.0 Release Announcement
    url: https://kafka.apache.org/blog/2025/03/18/apache-kafka-4.0.0-release-announcement/
    type: статья
  - title: Apache Kafka — Upgrading (4.3)
    url: https://kafka.apache.org/43/getting-started/upgrade/
    type: документация
---

# Kafka

**Apache Kafka** — распределённая платформа потоковой передачи событий. По сути — **распределённый, реплицируемый журнал (лог)**: продюсеры дописывают события в конец, консьюмеры читают с нужной позиции. События **не удаляются после чтения**, а хранятся заданное время.

Применения: шина событий между микросервисами, сбор логов и метрик, CDC (изменения из баз через Debezium), аналитика в реальном времени, буфер перед ClickHouse/Elasticsearch.

## Кластер и KRaft

- **Брокер** — сервер Kafka; несколько брокеров образуют **кластер**. Подключившись к любому (bootstrap server), клиент узнаёт обо всём кластере.
- Метаданные кластера (топики, лидеры, конфигурация) раньше хранились в **ZooKeeper**. С **Kafka 4.0** (март 2025) ZooKeeper полностью удалён: используется встроенный протокол **KRaft** (Raft), отдельные **контроллеры** (обычно 3) хранят метаданные. Текущая линейка — 4.x, работает только в режиме KRaft. В старых инструкциях вы ещё встретите `--zookeeper` — это устарело.

## Топики, партиции, оффсеты

```
 Топик orders (3 партиции)
 Партиция 0: [0][1][2][3][4][5] ← запись в конец
 Партиция 1: [0][1][2][3]
 Партиция 2: [0][1][2][3][4]
              ▲ оффсет — номер сообщения в партиции
```

- **Топик** — именованный поток событий (`orders`, `payments`, `logs.app`).
- **Партиция** — упорядоченная часть топика; единица параллелизма и масштабирования. Партиции распределены по брокерам.
- **Оффсет** — порядковый номер сообщения внутри партиции. Порядок гарантирован **только внутри партиции**.
- **Сообщение (record)**: ключ, значение, заголовки, время.
- Число партиций легко увеличить, но нельзя уменьшить, а при увеличении меняется распределение ключей. Планируйте заранее.

## Продюсеры

- Продюсер выбирает партицию: по **хешу ключа** (одинаковый ключ → одна партиция → сохраняется порядок, например, все события заказа 1001) или равномерно, если ключа нет.
- **acks**: `0` — не ждать подтверждения (быстро, возможны потери); `1` — ждать лидера; **`all`** — ждать все синхронные реплики (надёжно, по умолчанию в новых версиях).
- **Идемпотентный продюсер** (`enable.idempotence=true`, по умолчанию) — повторная отправка при сбое не создаёт дублей в партиции.
- **Транзакции** — атомарная запись в несколько партиций и exactly-once в связке «прочитал → обработал → записал» внутри Kafka.
- Батчи и сжатие (`linger.ms`, `batch.size`, `compression.type=zstd/lz4`) — для пропускной способности.

## Консьюмеры и consumer group

```
 Топик orders: P0  P1  P2  P3
 Группа stock:      c1(P0,P1)  c2(P2,P3)       ← каждая партиция — ровно одному консьюмеру группы
 Группа notify:     c1(P0,P1,P2,P3)            ← другая группа читает ВСЕ сообщения независимо
```

- Консьюмеры объединяются в **consumer group** (`group.id`). Партиции топика делятся между участниками группы: **каждая партиция читается только одним консьюмером группы**.
- Разные группы читают топик **независимо** — так реализуется pub/sub.
- Консьюмеров в группе больше, чем партиций, — лишние **простаивают**. Число партиций = потолок параллелизма группы.
- **Ребалансировка** — перераспределение партиций при входе и выходе консьюмеров. Новый протокол групп (KIP-848, GA в Kafka 4.0) делает её быстрее и без «остановки мира».
- Консьюмер **коммитит оффсет** (в служебный топик `__consumer_offsets`): «обработал до сюда». Коммит после обработки → at-least-once; до обработки → at-most-once. При рестарте чтение продолжается с закоммиченного оффсета.
- `auto.offset.reset=earliest|latest` — откуда читать новой группе, у которой ещё нет оффсетов.
- **Consumer lag** = последний оффсет партиции − закоммиченный оффсет группы. Главная метрика здоровья потребителей.
- Kafka 4.x добавляет **share groups** (очереди поверх Kafka): несколько консьюмеров могут делить одну партицию, с подтверждением каждого сообщения.

## Репликация

- У каждой партиции **replication factor** копий (обычно **3**) на разных брокерах: один **лидер** (все чтения и записи) и **фолловеры**.
- **ISR** (in-sync replicas) — реплики, которые не отстают от лидера. Лидер упал → новым лидером становится реплика из ISR.
- `min.insync.replicas=2` + `acks=all` + RF=3: запись подтверждается, когда её получили минимум 2 реплики; переживаем потерю одного брокера без потери данных. Если в ISR осталась одна реплика — запись отклоняется (лучше ошибка, чем потеря).
- `unclean.leader.election.enable=false` — не выбирать лидером отставшую реплику (иначе потеря данных).

## Хранение

- Данные — на диске брокера сегментами. **Retention** по времени (`retention.ms`, например 7 дней) или размеру (`retention.bytes`); старые сегменты удаляются **независимо от того, прочитаны ли они**.
- **Compaction** (`cleanup.policy=compact`) — хранить только последнее значение для каждого ключа (состояние: профиль пользователя, настройки).
- Kafka быстрая благодаря последовательной записи на диск и page cache ОС — дайте брокерам RAM и быстрые диски.

## CLI

```bash
kafka-topics.sh --bootstrap-server kafka:9092 --create --topic orders --partitions 6 --replication-factor 3
kafka-topics.sh --bootstrap-server kafka:9092 --describe --topic orders
kafka-topics.sh --bootstrap-server kafka:9092 --list

kafka-console-producer.sh --bootstrap-server kafka:9092 --topic orders --property parse.key=true --property key.separator=:
kafka-console-consumer.sh --bootstrap-server kafka:9092 --topic orders --from-beginning --group debug --property print.key=true

kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group stock
kafka-consumer-groups.sh --bootstrap-server kafka:9092 --group stock --topic orders --reset-offsets --to-earliest --execute

kafka-configs.sh --bootstrap-server kafka:9092 --alter --entity-type topics --entity-name orders --add-config retention.ms=259200000
```

`--describe` у топика показывает для каждой партиции **Leader**, **Replicas** и **Isr**. У группы — `CURRENT-OFFSET`, `LOG-END-OFFSET` и **`LAG`**. Сброс оффсетов — только при остановленных консьюмерах группы.

Удобные инструменты: **kcat** (kafkacat), веб-интерфейсы Kafbat UI (бывший Kafka UI), AKHQ, Redpanda Console.

## Эксплуатация

- Минимум 3 брокера и 3 контроллера для продакшена, RF=3, `min.insync.replicas=2`.
- Мониторинг: consumer lag (kafka_exporter, Burrow), under-replicated partitions, offline partitions, диск, сеть, запросы, задержка.
- Безопасность: TLS, SASL (SCRAM, OAuth), ACL на топики и группы.
- В Kubernetes — оператор **Strimzi**; в облаке — managed Kafka (Yandex, Selectel, Confluent Cloud, AWS MSK).
- Совместимые альтернативы: Redpanda (C++, без JVM), а в облаке — Kafka-совместимые сервисы.

## Практика

- [ ] Запустить Kafka 4.x в режиме KRaft в Docker (один брокер для начала) и создать топик с 3 партициями
- [ ] Отправить сообщения с ключами через console-producer и прочитать их console-consumer с выводом ключей и партиций
- [ ] Запустить два консьюмера в одной группе и один в другой; посмотреть распределение партиций и что получает каждая группа
- [ ] Остановить консьюмеров, отправить сообщения и посмотреть LAG через kafka-consumer-groups.sh --describe
- [ ] Сбросить оффсеты группы на начало и перечитать историю
- [ ] Поднять кластер из 3 брокеров, создать топик с RF=3, остановить брокер-лидер и посмотреть смену лидера и ISR
- [ ] Включить compaction на топике и проверить, что остаётся последнее значение по ключу
- [ ] Подключить kafka_exporter к Prometheus и построить график lag

## Лаборатория

Kafka 3.8 работает в контейнере **`kafka`** (один брокер в режиме KRaft, без ZooKeeper), адрес `localhost:9092`. Утилиты Kafka — внутри контейнера: `docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 ...`.

```bash lib
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
K=/opt/kafka/bin
# lab_kafka — брокер Kafka (контейнер kafka, порт 9092)
lab_kafka() {
  lab_img apache/kafka:3.8.1
  if [ "$(docker inspect -f '{{.State.Running}}' kafka 2>/dev/null)" != true ]; then
    docker rm -f kafka >/dev/null 2>&1
    docker run -d --name kafka -p 127.0.0.1:9092:9092 -e KAFKA_HEAP_OPTS="-Xmx384m -Xms384m" apache/kafka:3.8.1 >/dev/null
  fi
  for i in $(seq 60); do docker exec kafka $K/kafka-topics.sh --bootstrap-server localhost:9092 --list >/dev/null 2>&1 && return 0; sleep 1; done
}
lab_kt() { docker exec kafka $K/kafka-topics.sh --bootstrap-server localhost:9092 "$@" 2>/dev/null; }
lab_kg() { docker exec kafka $K/kafka-consumer-groups.sh --bootstrap-server localhost:9092 "$@" 2>/dev/null; }
```

```bash setup
lab_kafka
```

### Топик для заказов

Создайте топик **`orders`**:

- **3 партиции** — чтобы заказы могли обрабатывать до трёх потребителей параллельно;
- сообщения хранятся **1 сутки** (параметр топика `retention.ms`).

Отправьте в него хотя бы одно сообщение и прочитайте его консольным потребителем.

```bash setup
lab_kt --delete --topic orders >/dev/null; sleep 2; true
```

```bash check
d=$(lab_kt --describe --topic orders) || fail "Топика orders нет"
[ -n "$d" ] || fail "Топика orders нет"
n=$(echo "$d" | grep -oE 'PartitionCount: [0-9]+' | awk '{print $2}')
[ "$n" = 3 ] || fail "Партиций в orders: $n"
r=$(docker exec kafka $K/kafka-configs.sh --bootstrap-server localhost:9092 --entity-type topics --entity-name orders --describe 2>/dev/null | grep -oE 'retention.ms=[0-9]+' | head -1 | cut -d= -f2)
[ "$r" = 86400000 ] || fail "Срок хранения сообщений в orders: ${r:-по умолчанию (7 суток)}"
off=$(docker exec kafka $K/kafka-get-offsets.sh --bootstrap-server localhost:9092 --topic orders 2>/dev/null | awk -F: '{s += $3} END {print s + 0}')
[ "$off" -ge 1 ] || fail "В топике orders нет ни одного сообщения"
ok "orders: 3 партиции, retention 1 сутки, сообщений: $off"
```

```text hint
1. Утилита управления топиками: создать топик с числом партиций и параметром конфигурации (ключ config, значение — миллисекунды).
2. Консольный продюсер читает сообщения со стандартного ввода — по строке на сообщение.
3. Консольному потребителю нужно указать «читать с начала» и ограничить число сообщений, иначе он будет ждать вечно.
```

```bash solution
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic orders --partitions 3 --config retention.ms=86400000
echo '{"order": 1, "total": 990}' | docker exec -i kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders
docker exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic orders --from-beginning --max-messages 1 --timeout-ms 10000
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic orders
```

```text review
Эталон: `kafka-topics.sh --create --topic orders --partitions 3 --config retention.ms=86400000`.

- **Партиция** — единица параллелизма: в группе потребителей каждую партицию читает один потребитель. 3 партиции = максимум 3 параллельных обработчика. Увеличить число партиций можно, уменьшить — нет.
- Порядок гарантирован только **внутри партиции**: сообщения с одним ключом (`order_id`) попадают в одну партицию — так заказ обрабатывается по порядку.
- Kafka хранит сообщения по времени или размеру (`retention.ms`, `retention.bytes`) независимо от того, прочитали их или нет: это журнал, а не очередь. Перечитать историю можно в любой момент.
- В продакшене: `--replication-factor 3` и `min.insync.replicas=2` — переживает потерю брокера без потери сообщений.
```

### Отставание потребителей

В топик **`payments`** записано 100 сообщений. Группа потребителей **`billing`** обработала только часть. Узнайте **суммарное отставание** (lag) группы `billing` по топику и запишите число в `~/lag.txt`. Затем **сбросьте смещения** группы на начало топика — нужно переобработать все платежи. Отставание после сброса должно стать равным 100.

```bash setup
lab_kt --delete --topic payments >/dev/null; sleep 2
lab_kt --create --topic payments --partitions 2 >/dev/null
seq 1 100 | sed 's/^/payment-/' | docker exec -i kafka $K/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic payments >/dev/null 2>&1
docker exec kafka $K/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic payments --group billing --from-beginning --max-messages 63 --timeout-ms 15000 >/dev/null 2>&1
lab_kg --describe --group billing | awk '$2 == "payments" {s += $6} END {print s}' > /var/lib/lab/kafka-lag
rm -f /home/student/lag.txt
```

```bash check
want=$(cat /var/lib/lab/kafka-lag)
[ -f /home/student/lag.txt ] || fail "Нет ~/lag.txt"
[ "$(tr -d '[:space:]' < /home/student/lag.txt)" = "$want" ] || fail "В ~/lag.txt «$(tr -d '[:space:]' < /home/student/lag.txt)» — это не отставание группы billing до сброса"
now=$(lab_kg --describe --group billing | awk '$2 == "payments" {s += $6} END {print s + 0}')
[ "$now" = 100 ] || fail "Отставание группы billing сейчас $now — смещения не сброшены на начало"
ok "lag был $want, после сброса — 100"
```

```text hint
1. Утилита групп потребителей показывает по каждой партиции текущее смещение группы, последнее смещение топика и разницу между ними.
2. Отставание — сумма по всем партициям топика.
3. У той же утилиты есть режим сброса смещений: на начало, на конец, на время. Без ключа «выполнить» она только показывает план.
```

```bash solution
docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group billing
docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group billing 2>/dev/null | awk '$2 == "payments" {s += $6} END {print s}' > ~/lag.txt
docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group billing --topic payments --reset-offsets --to-earliest --execute
```

```text review
Эталон: `kafka-consumer-groups.sh --describe --group billing` (колонка LAG) → `--reset-offsets --to-earliest --execute`.

- **Consumer lag** — главная метрика Kafka для эксплуатации: растёт — потребители не успевают (мало экземпляров, медленная обработка, упали). Алерт на рост lag, метрики — kafka-exporter или Burrow.
- Сброс смещений — только при **остановленных** потребителях группы, иначе Kafka откажет. Варианты: `--to-earliest`, `--to-latest` (пропустить накопившееся), `--to-datetime 2026-11-28T10:00:00.000`, `--shift-by -100`.
- Потребитель должен быть идемпотентным: при переобработке тот же платёж не должен списаться дважды.
```

## Тест

### Что такое партиция в Kafka?
- [ ] Отдельный кластер
- [x] Упорядоченная часть топика — единица параллелизма; порядок сообщений гарантирован только внутри партиции
- [ ] Копия брокера
- [ ] Группа консьюмеров
> Партиции распределяются по брокерам кластера.

### Что такое оффсет?
- [ ] Номер брокера в кластере
- [x] Порядковый номер сообщения внутри партиции
- [ ] Размер сообщения в байтах
- [ ] Время хранения сообщения
> Консьюмер коммитит оффсет, до которого обработал сообщения.

### Удаляет ли Kafka сообщение после того, как его прочитал консьюмер?
- [ ] Да, сразу
- [x] Нет: сообщения хранятся по политике retention (время или размер) независимо от чтения
- [ ] Да, после чтения всеми группами
- [ ] Только при ошибке
> Поэтому можно перечитать историю, сбросив оффсеты.

### Как Kafka распределяет партиции между консьюмерами одной consumer group?
- [ ] Каждый консьюмер получает все партиции
- [x] Каждая партиция назначается ровно одному консьюмеру группы
- [ ] Партиции назначаются случайно при каждом сообщении
- [ ] Только первый консьюмер читает данные
> Разные группы читают топик независимо друг от друга.

### В топике 4 партиции, а в группе 6 консьюмеров. Что произойдёт?
- [ ] Все 6 будут читать равномерно
- [x] 4 консьюмера получат по партиции, 2 будут простаивать
- [ ] Kafka создаст ещё 2 партиции
- [ ] Группа не запустится
> Число партиций — потолок параллелизма группы.

### Как сохранить порядок всех событий одного заказа?
- [ ] Использовать много партиций без ключа
- [x] Отправлять события с одинаковым ключом (например, id заказа) — они попадут в одну партицию
- [ ] Использовать acks=0
- [ ] Порядок нельзя сохранить
> Партиция выбирается по хешу ключа.

### Что заменило ZooKeeper в Kafka 4.x?
= KRaft
> Встроенный протокол на основе Raft; контроллеры хранят метаданные кластера.

### Какие настройки дают надёжную запись без потерь при отказе одного брокера?
- [x] Replication factor 3
- [x] acks=all у продюсера
- [x] min.insync.replicas=2
- [ ] acks=0
> Запись подтверждается, когда её получили минимум две синхронные реплики.

### Что такое ISR?
- [ ] Список консьюмеров группы
- [x] Набор реплик партиции, не отстающих от лидера; новый лидер выбирается из них
- [ ] Индекс сообщений
- [ ] Служебный топик оффсетов
> Under-replicated partitions — важная метрика мониторинга.

### Что показывает LAG в выводе kafka-consumer-groups.sh --describe?
- [ ] Задержку сети в миллисекундах
- [x] Разницу между последним оффсетом партиции и закоммиченным оффсетом группы — сколько сообщений ещё не обработано
- [ ] Число брокеров
- [ ] Размер топика в байтах
> Растущий lag — сигнал, что потребители не справляются.

### Что делает cleanup.policy=compact?
- [ ] Сжимает сообщения gzip
- [x] Оставляет в топике последнее значение для каждого ключа, удаляя старые версии
- [ ] Удаляет топик
- [ ] Объединяет партиции
> Подходит для хранения состояния по ключу.

### Когда консьюмеру лучше коммитить оффсет для гарантии at-least-once?
- [ ] До обработки сообщения
- [x] После успешной обработки сообщения
- [ ] Никогда
- [ ] Раз в сутки
> Коммит до обработки даёт at-most-once: при сбое сообщение будет пропущено.
