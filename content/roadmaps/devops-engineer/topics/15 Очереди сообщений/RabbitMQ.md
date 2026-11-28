---
title: RabbitMQ
slug: rabbitmq
description: RabbitMQ — брокер AMQP, exchange, очереди и привязки, типы обменников direct, fanout, topic и headers, durable и persistent, подтверждения потребителей и publisher confirms, prefetch, dead letter и TTL, quorum queues и streams в RabbitMQ 4, кластер, management UI и rabbitmqctl, отличие от Kafka.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: RabbitMQ Tutorials
    url: https://www.rabbitmq.com/getstarted.html
    type: документация
  - title: RabbitMQ — Consumer Acknowledgements and Publisher Confirms
    url: https://www.rabbitmq.com/docs/confirms
    type: документация
  - title: RabbitMQ 4.0.1 — release notes (удаление зеркалирования classic queues)
    url: https://github.com/rabbitmq/rabbitmq-server/releases/tag/v4.0.1
    type: документация
  - title: RabbitMQ vs. Apache Kafka
    url: https://rabbitmq.com/docs/compare/kafka
    type: статья
---

# RabbitMQ

**RabbitMQ** — популярный брокер сообщений (написан на Erlang). Основной протокол — **AMQP 0-9-1**, также поддерживаются AMQP 1.0, MQTT, STOMP и собственный протокол streams. Текущая линейка — **4.x**. Сильные стороны: гибкая маршрутизация, очереди задач, подтверждения на каждое сообщение, удобный веб-интерфейс.

## Модель: exchange → binding → queue

```
 продюсер ──► EXCHANGE ──binding (routing key / шаблон)──► QUEUE ──► консьюмер
                  │
                  └──binding──► QUEUE 2 ──► консьюмер 2
```

- Продюсер публикует сообщение **не в очередь, а в exchange** (обменник) с **routing key**.
- **Binding** (привязка) — правило, по которому exchange направляет сообщения в очереди.
- **Очередь** хранит сообщения, пока консьюмер их не заберёт и не подтвердит.
- Есть **default exchange** (пустое имя): сообщение с routing key `emails` попадает в очередь `emails` — так работают простые примеры.
- **Vhost** — изолированное пространство (свои exchange, очереди, права) внутри одного брокера.

## Типы обменников

| Тип | Как маршрутизирует | Пример |
| --- | --- | --- |
| **direct** | Точное совпадение routing key и binding key | `email.send` → очередь писем |
| **fanout** | Во **все** привязанные очереди, ключ игнорируется | Рассылка события всем подписчикам |
| **topic** | По шаблону: `*` — одно слово, `#` — ноль или больше слов | `order.*.created`, `logs.#` |
| **headers** | По заголовкам сообщения | Редко |

Пример topic: ключ `order.eu.created` подходит под `order.*.created` и `order.#`, но не под `order.created`.

## Надёжность

- **Durable**-очередь и exchange переживают рестарт брокера; **persistent**-сообщение (`delivery_mode=2`) пишется на диск. Нужны оба, иначе после рестарта сообщения пропадут.
- **Подтверждения потребителя (ack)**: в ручном режиме консьюмер шлёт `basic.ack` **после** обработки. Соединение оборвалось до ack → сообщение вернётся в очередь и будет доставлено снова (at-least-once). `basic.nack`/`reject` — отказ с возвратом в очередь или без.
- **Auto-ack** — сообщение считается доставленным сразу при отправке консьюмеру: быстро, но упавший консьюмер **теряет** сообщения.
- **Publisher confirms** — брокер подтверждает продюсеру, что принял сообщение (и записал на реплики). Без них продюсер не знает, дошло ли сообщение.
- **Prefetch** (`basic.qos`) — сколько неподтверждённых сообщений брокер выдаёт одному консьюмеру. Без ограничения один консьюмер заберёт тысячи сообщений и будет держать их, пока другие простаивают. Типично 10–100.

## Dead letter, TTL, ограничения

- **Dead letter exchange (DLX)**: отклонённые без возврата, просроченные или вытесненные сообщения отправляются в указанный exchange → очередь для разбора.
- **TTL** сообщений и очередей, **max-length** очереди.
- У quorum-очередей с RabbitMQ 4.0 есть **лимит повторных доставок по умолчанию — 20**: после этого сообщение уходит в DLX или удаляется — защита от «ядовитых» сообщений.

## Типы очередей в RabbitMQ 4

| Тип | Что это | Когда |
| --- | --- | --- |
| **Classic** | Обычная очередь на одном узле, **без репликации** | Временные, некритичные данные |
| **Quorum** | Реплицируемая очередь на основе Raft (обычно 3 или 5 узлов), подтверждение после записи на большинство | **Надёжные данные** — выбор по умолчанию для важного |
| **Stream** | Журнал, как в Kafka: сообщения не удаляются после чтения, повторное чтение с оффсета, большая пропускная способность | Много потребителей одних и тех же данных, replay, большие объёмы |

> [!warning] Зеркальных classic-очередей больше нет
> В старых инструкциях высокую доступность делали **зеркалированием classic-очередей** (политика `ha-mode`). В **RabbitMQ 4.0** зеркалирование окончательно удалено после нескольких лет устаревания. Для репликации используйте **quorum queues** и **streams**.

## Кластер и эксплуатация

- Кластер из **3** (или 5) узлов; узлам нужен общий **Erlang cookie**. Quorum-очереди переживают потерю меньшинства узлов.
- **Management UI** (плагин `rabbitmq_management`, порт **15672**): очереди, скорость, консьюмеры, отправка тестовых сообщений. AMQP — порт **5672** (5671 с TLS).
- Пользователь `guest` по умолчанию может входить **только с localhost** — создайте своих пользователей с правами на vhost.
- **Алармы памяти и диска**: при нехватке памяти (`vm_memory_high_watermark`) или диска (`disk_free_limit`) брокер **блокирует продюсеров**, пока ресурсы не освободятся. Частая причина «всё встало» — очередь, которую никто не читает.
- Мониторинг: встроенный плагин `rabbitmq_prometheus` (порт 15692) + готовые дашборды Grafana. Главное: глубина очередей, число неподтверждённых, скорость publish/deliver/ack, консьюмеры на очередь, алармы, узлы кластера.
- В Kubernetes — **RabbitMQ Cluster Operator**; в облаке — managed RabbitMQ.

```bash
rabbitmqctl cluster_status
rabbitmqctl list_queues name type messages messages_unacknowledged consumers
rabbitmqctl list_connections user peer_host state
rabbitmqctl add_user app 'S3cr3t!'
rabbitmqctl add_vhost shop
rabbitmqctl set_permissions -p shop app ".*" ".*" ".*"
rabbitmq-plugins enable rabbitmq_management rabbitmq_prometheus
rabbitmq-diagnostics status
rabbitmq-diagnostics check_port_connectivity
```

Также удобен **rabbitmqadmin** (CLI через HTTP API) для объявления очередей и exchange из скриптов.

## RabbitMQ или Kafka

| | RabbitMQ | Kafka |
| --- | --- | --- |
| Модель | Брокер «умный»: маршрутизация, очередь удаляет подтверждённое | Журнал: хранит события, консьюмеры сами помнят оффсет |
| Маршрутизация | Гибкая (direct, topic, headers, DLX) | По топикам и ключам |
| Подтверждения | На каждое сообщение | Коммит оффсета (позиции) |
| Повторное чтение | В streams | Базовая возможность |
| Пропускная способность | Высокая | Очень высокая, огромные объёмы |
| Типичное применение | Очереди задач, RPC, интеграции микросервисов, приоритеты, отложенная обработка | Потоки событий, логи, аналитика, CDC, event sourcing |

## Практика

- [ ] Запустить RabbitMQ 4 с management-плагином в Docker, создать пользователя и vhost, войти в UI на 15672
- [ ] Пройти первые туториалы: Hello World и Work Queues с двумя воркерами и ручным ack
- [ ] Убить воркер во время обработки без ack и убедиться, что сообщение доставлено другому воркеру
- [ ] Настроить prefetch=1 и сравнить распределение долгих задач между воркерами
- [ ] Создать fanout- и topic-exchange и проверить маршрутизацию ключей вида order.eu.created
- [ ] Создать quorum-очередь с DLX: отклонённые сообщения уходят в очередь dead-letters
- [ ] Поднять кластер из трёх узлов, остановить один и проверить, что quorum-очередь продолжает работать
- [ ] Включить rabbitmq_prometheus и построить дашборд глубины очередей; заполнить очередь и посмотреть алармы памяти или диска

## Лаборатория

RabbitMQ установлен из пакетов (служба `rabbitmq-server`). Управление — `sudo rabbitmqctl ...`; для очередей и обменников есть `rabbitmqadmin` (работает через плагин управления, он включён: веб-интерфейс `http://localhost:15672`, пользователь `admin` / `admin`).

```bash lib
# lab_rabbit — запущенный RabbitMQ с плагином управления, пользователем admin и утилитой rabbitmqadmin
lab_rabbit() {
  systemctl is-active -q rabbitmq-server || systemctl start rabbitmq-server
  for i in $(seq 60); do rabbitmqctl -q status >/dev/null 2>&1 && break; sleep 1; done
  rabbitmq-plugins -q enable rabbitmq_management >/dev/null 2>&1
  rabbitmqctl -q list_users | grep -q '^admin' || { rabbitmqctl -q add_user admin admin >/dev/null; rabbitmqctl -q set_user_tags admin administrator >/dev/null; rabbitmqctl -q set_permissions -p / admin '.*' '.*' '.*' >/dev/null; }
  for i in $(seq 60); do curl -s -u admin:admin localhost:15672/api/overview >/dev/null 2>&1 && break; sleep 1; done
  [ -x /usr/local/bin/rabbitmqadmin ] || { curl -s -o /usr/local/bin/rabbitmqadmin localhost:15672/cli/rabbitmqadmin && chmod 755 /usr/local/bin/rabbitmqadmin; }
}
lab_ra() { rabbitmqadmin -u admin -p admin "$@" 2>/dev/null; }
```

```bash setup
lab_rabbit
```

### Отдельный виртуальный хост для приложения

Магазину нужен свой изолированный «раздел» брокера. Создайте:

- виртуальный хост **`shop`**;
- пользователя **`shop`** с паролем **`shop-pass`**;
- права пользователя `shop` **на всё внутри `shop`** — и никаких прав на виртуальный хост по умолчанию `/`.

```bash setup
rabbitmqctl -q delete_vhost shop >/dev/null 2>&1; rabbitmqctl -q delete_user shop >/dev/null 2>&1; true
```

```bash check
rabbitmqctl -q list_vhosts | grep -qx shop || fail "Виртуального хоста shop нет"
rabbitmqctl -q list_users | grep -q '^shop' || fail "Пользователя shop нет"
rabbitmqctl -q authenticate_user shop shop-pass >/dev/null 2>&1 || fail "Пользователь shop не входит с паролем shop-pass"
p=$(rabbitmqctl -q list_user_permissions shop 2>/dev/null)
echo "$p" | awk '$1 == "shop"' | grep -qE '^shop\s+\.\*\s+\.\*\s+\.\*' || fail "У shop нет полных прав (configure/write/read: .*) на vhost shop"
echo "$p" | awk '$1 == "/"' | grep -q . && fail "У пользователя shop есть права на vhost /"
curl -s -u shop:shop-pass localhost:15672/api/whoami | grep -q '"name":"shop"' || true
ok "vhost shop: права только у пользователя shop"
```

```text hint
1. Утилита управления брокером умеет создавать виртуальные хосты и пользователей.
2. Права задаются тремя регулярными выражениями — на настройку, запись и чтение ресурсов — для пары «пользователь + виртуальный хост».
```

```bash solution
sudo rabbitmqctl add_vhost shop
sudo rabbitmqctl add_user shop shop-pass
sudo rabbitmqctl set_permissions -p shop shop '.*' '.*' '.*'
sudo rabbitmqctl list_user_permissions shop
```

```text review
Эталон: `add_vhost shop` → `add_user shop shop-pass` → `set_permissions -p shop shop '.*' '.*' '.*'`.

- Виртуальный хост — изолированное пространство очередей, обменников и прав внутри одного брокера: разные приложения или окружения не видят друг друга.
- Пользователь `guest` по умолчанию пускается только с localhost — для приложений всегда создают своих пользователей.
- Права можно сузить: `^orders\..*` — только ресурсы с этим префиксом.
```

### Обменник, очередь и маршрут

В виртуальном хосте **`/`** настройте маршрутизацию заказов:

- обменник **`orders`** типа **direct**, **устойчивый** (переживает перезапуск брокера);
- устойчивая очередь **`orders.created`**;
- привязка очереди к обменнику по ключу маршрутизации **`created`**.

Сообщение, опубликованное в `orders` с ключом `created`, должно попадать в `orders.created`.

```bash setup
lab_ra delete exchange name=orders >/dev/null; lab_ra delete queue name=orders.created >/dev/null; true
```

```bash check
e=$(curl -s -u admin:admin localhost:15672/api/exchanges/%2F/orders)
[ "$(echo "$e" | jq -r .type)" = direct ] || fail "Обменника orders типа direct нет"
[ "$(echo "$e" | jq -r .durable)" = true ] || fail "Обменник orders не устойчивый — пропадёт при перезапуске брокера"
q=$(curl -s -u admin:admin localhost:15672/api/queues/%2F/orders.created)
[ "$(echo "$q" | jq -r .durable)" = true ] || fail "Очереди orders.created нет или она не устойчивая"
curl -s -u admin:admin localhost:15672/api/bindings/%2F/e/orders/q/orders.created | jq -e '.[] | select(.routing_key == "created")' >/dev/null || fail "Очередь orders.created не привязана к orders по ключу created"
lab_ra purge queue name=orders.created >/dev/null
lab_ra publish exchange=orders routing_key=created payload='{"order":42}' >/dev/null
lab_ra publish exchange=orders routing_key=paid payload='{"order":43}' >/dev/null
sleep 1
n=$(curl -s -u admin:admin localhost:15672/api/queues/%2F/orders.created | jq -r .messages)
m=$(lab_ra get queue=orders.created ackmode=ack_requeue_false count=5 -f raw_json | jq -r '.[].payload')
[ "$m" = '{"order":42}' ] || fail "В orders.created пришло не то: «$m»"
ok "orders --created--> orders.created"
```

```text hint
1. Утилита rabbitmqadmin умеет объявлять обменники, очереди и привязки — у каждого объекта свои параметры: тип, устойчивость, источник, назначение и ключ маршрутизации.
2. Проверить: опубликовать сообщение в обменник с ключом и забрать его из очереди.
```

```bash solution
rabbitmqadmin -u admin -p admin declare exchange name=orders type=direct durable=true
rabbitmqadmin -u admin -p admin declare queue name=orders.created durable=true
rabbitmqadmin -u admin -p admin declare binding source=orders destination=orders.created routing_key=created
rabbitmqadmin -u admin -p admin publish exchange=orders routing_key=created payload='{"order":1}'
rabbitmqadmin -u admin -p admin get queue=orders.created ackmode=ack_requeue_false
```

```text review
Эталон: `declare exchange orders type=direct durable=true` → `declare queue orders.created durable=true` → `declare binding ... routing_key=created`.

- Продюсер пишет в **обменник**, а не в очередь; обменник раскладывает по очередям по правилам: `direct` — точное совпадение ключа, `topic` — шаблоны (`orders.*.eu`), `fanout` — во все привязанные очереди, `headers` — по заголовкам.
- Сообщение без подходящей привязки **теряется** (ключ `paid` из проверки). Чтобы не терять — alternate exchange или флаг `mandatory`.
- Устойчивость: обменник и очередь `durable` **и** сообщения с `delivery_mode=2` (persistent). Для надёжной очереди в кластере — quorum queues.
- Необработанные сообщения отправляют в dead-letter exchange (`x-dead-letter-exchange`) — ничего не пропадает молча.
```

## Тест

### Куда продюсер публикует сообщение в RabbitMQ?
- [ ] Напрямую в очередь всегда
- [x] В exchange с routing key, а exchange по привязкам направляет его в очереди
- [ ] В партицию топика
- [ ] В базу данных
> Простые примеры используют default exchange, который выглядит как публикация прямо в очередь.

### Как работает fanout-exchange?
- [ ] По точному совпадению ключа
- [x] Отправляет сообщение во все привязанные очереди, игнорируя routing key
- [ ] По шаблону ключа
- [ ] По заголовкам
> Подходит для рассылки событий всем подписчикам.

### Под какой шаблон topic-exchange подойдёт ключ order.eu.created?
- [x] `order.*.created`
- [x] `order.#`
- [ ] `order.created`
- [ ] `*.created`
> `*` — ровно одно слово, `#` — ноль или больше слов.

### Что произойдёт с сообщением, если консьюмер упал, не отправив ack (в ручном режиме подтверждений)?
- [ ] Сообщение потеряется
- [x] Брокер вернёт сообщение в очередь и доставит его снова — этому или другому консьюмеру
- [ ] Сообщение уйдёт в Kafka
- [ ] Очередь удалится
> Поэтому обработка должна быть идемпотентной.

### Чем опасен режим auto-ack?
- [ ] Он медленный
- [x] Сообщение считается доставленным сразу при отправке консьюмеру, и при падении консьюмера оно теряется
- [ ] Он создаёт дубли
- [ ] Он отключает очереди
> Для важных данных используют ручной ack после обработки.

### Для чего нужны publisher confirms?
- [ ] Чтобы консьюмер подтвердил обработку
- [x] Чтобы брокер подтвердил продюсеру, что принял сообщение, — иначе продюсер не знает, дошло ли оно
- [ ] Для шифрования
- [ ] Для маршрутизации
> Подтверждения потребителей и publisher confirms — две независимые функции.

### Зачем настраивать prefetch?
- [ ] Чтобы ускорить сеть
- [x] Чтобы ограничить число неподтверждённых сообщений у одного консьюмера и равномерно распределять работу
- [ ] Чтобы сообщения хранились дольше
- [ ] Для включения TLS
> Без ограничения один консьюмер может забрать тысячи сообщений.

### Что нужно, чтобы сообщения пережили рестарт брокера?
- [x] Durable-очередь
- [x] Persistent-сообщения
- [ ] Auto-ack
- [ ] Fanout-exchange
> Для защиты от потери узла — ещё и реплицируемые quorum-очереди.

### Какой тип очереди в RabbitMQ 4 выбирают для надёжного хранения важных сообщений с репликацией?
= quorum
= quorum queue
> Зеркалирование classic-очередей удалено в RabbitMQ 4.0.

### Что такое dead letter exchange?
- [ ] Exchange для удаления сообщений без следа
- [x] Exchange, куда уходят отклонённые, просроченные или превысившие лимит повторов сообщения — для разбора
- [ ] Резервный брокер
- [ ] Exchange для логов RabbitMQ
> Quorum-очереди по умолчанию отправляют сообщение туда после 20 повторных доставок.

### Почему RabbitMQ может перестать принимать сообщения от продюсеров?
- [ ] Из-за слишком большого числа vhost
- [x] Сработал аларм памяти или диска — например, очередь, которую никто не читает, разрослась
- [ ] Из-за включённого management UI
- [ ] Так происходит каждую ночь
> Мониторьте глубину очередей, память и свободный диск.

### Чем streams в RabbitMQ похожи на Kafka?
- [ ] Ничем
- [x] Сообщения не удаляются после чтения, их можно перечитать с нужного оффсета многими потребителями
- [ ] Они поддерживают только fanout
- [ ] Они работают без диска
> Это ответ RabbitMQ на сценарии повторного чтения и больших объёмов.
