---
title: ELK и OpenSearch
slug: elk-i-opensearch
description: Стек ELK — Elasticsearch, Logstash, Kibana и Beats; индексы, документы, шарды и реплики, маппинг, пайплайн Logstash с grok, поиск в Kibana на KQL, жизненный цикл индексов ILM, лицензии Elastic и форк OpenSearch, ресурсы и эксплуатация кластера.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Logstash Docs — How Logstash Works
    url: https://www.elastic.co/guide/en/logstash/8.19/pipeline.html
    type: документация
  - title: Logstash Docs — Parsing Logs with Logstash
    url: https://www.elastic.co/guide/en/logstash/8.19/advanced-pipeline.html
    type: документация
  - title: Linux Foundation — OpenSearch Software Foundation
    url: https://www.linuxfoundation.org/press/linux-foundation-announces-opensearch-software-foundation-to-foster-open-collaboration-in-search-and-analytics
    type: статья
  - title: Elastic — Elasticsearch and Kibana are open source again (AGPL)
    url: https://www.elastic.co/blog/devrel-newsletter-september-2024
    type: статья
---

# ELK и OpenSearch

**ELK** — классический стек для логов и поиска:

- **E**lasticsearch — распределённое хранилище с полнотекстовым поиском;
- **L**ogstash — обработка и преобразование событий;
- **K**ibana — интерфейс: поиск, дашборды, алерты.

Плюс **Beats** (Filebeat и др.) — лёгкие агенты на серверах. Вместе их называют **Elastic Stack**.

```
 Filebeat (на серверах) ──► Logstash (парсинг, обогащение) ──► Elasticsearch (индексы) ◄── Kibana (:5601)
        :5044 beats                                               :9200 REST API
```

Logstash необязателен: Filebeat может слать прямо в Elasticsearch и парсить через **ingest pipelines** самого Elasticsearch.

## Лицензии и OpenSearch

- В 2021 году Elastic перевёл Elasticsearch и Kibana с Apache 2.0 на несвободные лицензии (SSPL, Elastic License).
- AWS в ответ сделал форк **OpenSearch** (+ OpenSearch Dashboards вместо Kibana) под **Apache 2.0**; в сентябре 2024 года проект передан в **OpenSearch Software Foundation** под эгидой Linux Foundation.
- В 2024 году Elastic добавил для открытой части кода **AGPLv3** — Elasticsearch и Kibana снова open source.
- Для DevOps-инженера концепции почти одинаковы: индексы, шарды, запросы. Различаются плагины, часть API и платные функции. В облаках чаще встречается managed OpenSearch.

## Как Elasticsearch хранит данные

| Понятие | Что это | Аналог в SQL |
| --- | --- | --- |
| **Документ** | JSON-объект (одна запись лога) | Строка |
| **Индекс** | Коллекция документов, например `logs-app-2026.11.27` | Таблица |
| **Маппинг** | Типы полей (keyword, text, date, long, ip) | Схема |
| **Шард** | Часть индекса (отдельный индекс Lucene) | Партиция |
| **Реплика** | Копия шарда на другом узле | Реплика |

- **Инвертированный индекс**: для каждого слова — список документов, где оно встречается. Поэтому поиск по тексту быстрый, но индексирование дорогое (CPU, диск, память).
- `text` — полнотекстовый поиск по словам; `keyword` — точное значение для фильтров и агрегаций (статус, хост).
- Шарды распределяются по узлам; **реплики** дают отказоустойчивость и масштабирование чтения. Реплика никогда не лежит на одном узле со своим основным шардом.
- Слишком много мелких шардов — частая проблема производительности; ориентир — шарды в десятки гигабайт.

Здоровье кластера:

```bash
curl -s localhost:9200/_cluster/health?pretty
curl -s 'localhost:9200/_cat/nodes?v'
curl -s 'localhost:9200/_cat/indices?v&s=store.size:desc' | head
curl -s 'localhost:9200/_cat/shards?v' | grep UNASSIGNED
```

Статус: **green** — все шарды и реплики размещены; **yellow** — основные шарды есть, но не все реплики (например, кластер из одного узла); **red** — часть основных шардов недоступна, данные частично потеряны для поиска.

## Logstash

Пайплайн: **input → filter → output**.

```
input {
  beats {
    port => 5044
  }
}

filter {
  if [service] == "nginx" {
    grok {
      match => { "message" => "%{COMBINEDAPACHELOG}" }
    }
    date {
      match => [ "timestamp", "dd/MMM/yyyy:HH:mm:ss Z" ]
    }
    geoip {
      source => "clientip"
    }
  }
  if [message] =~ /^\{/ {
    json {
      source => "message"
    }
  }
  mutate {
    remove_field => [ "agent", "ecs" ]
  }
}

output {
  elasticsearch {
    hosts => ["https://es:9200"]
    index => "logs-%{[service]}-%{+YYYY.MM.dd}"
  }
}
```

- **grok** — разбор неструктурированного текста по шаблонам (`%{IP:client}`, `%{NUMBER:bytes}`); готовые шаблоны для nginx/apache/syslog.
- **dissect** — быстрее grok для строк с фиксированными разделителями.
- **date** — взять время события из строки лога, а не время получения.
- **mutate**, **json**, **geoip**, условия `if`.
- Logstash написан на JRuby и требует заметно памяти (JVM). Для лёгкого сбора на узлах его заменяют Filebeat, Fluent Bit, Vector.

## Kibana

- **Discover** — поиск по логам за период, выбор полей, просмотр документа.
- **KQL** (Kibana Query Language):

```
level: "error" and service: "payments"
status >= 500 and not url: "/health"
message: *timeout*
kubernetes.namespace: "prod" and host.name: web-*
```

- **Data view** (раньше index pattern) — какие индексы смотреть, например `logs-*`.
- Дашборды и визуализации (Lens), алерты, роли и пространства.

## Жизненный цикл индексов (ILM)

Логи постоянно растут, поэтому индексы делят по времени и управляют их жизнью:

```
hot (новые, быстрые диски, запись) → warm (только чтение, дешевле) → cold/frozen (архив, S3) → delete (через 30 дней)
```

**ILM** (в OpenSearch — **ISM**) автоматически делает rollover (новый индекс по размеру или возрасту), переносит и удаляет старые индексы. Современный подход — **data streams**: один «поток» для записи поверх серии скрытых индексов.

## Эксплуатация

- Elasticsearch — **JVM**: heap ~50% RAM узла, но не больше ~31 ГБ; остальное — кэш файловой системы.
- `vm.max_map_count=262144` на хостах (иначе не запустится), отключить swap.
- Минимум **3 master-eligible** узла для кворума в продакшене.
- Безопасность включена по умолчанию с 8.x: TLS и пароли. Никогда не открывайте 9200 в интернет — открытые кластеры массово утекают.
- Бэкап — **snapshots** в S3-совместимое хранилище.
- Дорого по ресурсам: полнотекстовый индекс всех полей. Если полнотекстовый поиск не критичен, дешевле Loki или ClickHouse.

## Практика

- [ ] Поднять Elasticsearch (или OpenSearch) и Kibana (OpenSearch Dashboards) в Docker Compose с одним узлом, проверить `_cluster/health` и понять, почему статус yellow
- [ ] Отправить логи nginx через Filebeat в Logstash, распарсить их grok-шаблоном и записать в индекс по дате
- [ ] Создать data view `logs-*` в Kibana и найти все ответы 5xx за последний час на KQL
- [ ] Отправить JSON-логи своего приложения и убедиться, что поля разобраны без grok
- [ ] Построить дашборд: число ошибок по сервисам и топ URL с 5xx
- [ ] Настроить политику ILM/ISM: rollover по размеру и удаление индексов старше 7 дней
- [ ] Сделать snapshot индекса в MinIO или S3 и восстановить его

## Тест

### Что означают буквы ELK?
- [x] Elasticsearch — хранилище и поиск
- [x] Logstash — обработка событий
- [x] Kibana — интерфейс для поиска и дашбордов
- [ ] Linux Kernel
> Вместе с Beats это называют Elastic Stack.

### Что такое OpenSearch?
- [ ] Платная версия Elasticsearch
- [x] Открытый форк Elasticsearch и Kibana под Apache 2.0, созданный AWS и переданный в фонд под эгидой Linux Foundation
- [ ] Плагин для Grafana
- [ ] Сборщик логов
> Интерфейс в нём называется OpenSearch Dashboards.

### Из каких этапов состоит пайплайн Logstash?
- [ ] scrape, store, query
- [x] input, filter, output
- [ ] build, test, deploy
- [ ] pull, push, merge
> Filter необязателен.

### Какой фильтр Logstash разбирает неструктурированные строки логов по шаблонам вроде %{COMBINEDAPACHELOG}?
= grok
> Для строк с фиксированными разделителями быстрее dissect.

### Что означает статус кластера Elasticsearch yellow?
- [ ] Кластер недоступен
- [x] Все основные шарды размещены, но часть реплик — нет (например, кластер из одного узла)
- [ ] Часть данных потеряна
- [ ] Кластер перегружен по CPU
> red — недоступна часть основных шардов.

### Чем поле типа keyword отличается от text?
- [x] keyword хранит точное значение — для фильтров, сортировки и агрегаций
- [x] text разбивается на слова для полнотекстового поиска
- [ ] keyword нельзя искать
- [ ] Это синонимы
> Статус ответа и имя хоста — keyword, сообщение — text.

### Зачем нужны реплики шардов?
- [ ] Чтобы ускорить запись
- [x] Для отказоустойчивости и распределения нагрузки на чтение — копия шарда на другом узле
- [ ] Чтобы уменьшить размер индекса
- [ ] Для хранения маппинга
> Реплика не размещается на одном узле со своим основным шардом.

### Для чего нужен ILM (или ISM в OpenSearch)?
- [ ] Для авторизации
- [x] Для автоматического управления жизнью индексов: rollover, перенос на дешёвые узлы и удаление старых
- [ ] Для парсинга логов
- [ ] Для мониторинга CPU
> Без него индексы логов растут бесконечно.

### Какой запрос KQL найдёт ошибки сервиса payments?
- [ ] `SELECT * FROM logs WHERE level=error`
- [x] `level: "error" and service: "payments"`
- [ ] `{service="payments"}` с фильтром `"error"`
- [ ] `grep error payments`
> Третий вариант похож на LogQL — язык Loki.

### Какой максимальный размер heap обычно рекомендуют для узла Elasticsearch?
- [ ] Вся оперативная память
- [x] Около половины RAM, но не больше ~31 ГБ; остальное отдают кэшу файловой системы
- [ ] 512 МБ всегда
- [ ] Heap не нужен
> Elasticsearch работает на JVM.

### Почему ELK может оказаться дорогим для хранения логов?
- [ ] Он платный всегда
- [x] Полнотекстовый индекс всех полей требует много CPU, памяти и диска при индексировании и хранении
- [ ] Он хранит данные только в памяти
- [ ] Он не сжимает данные
> Если полнотекстовый поиск не критичен, дешевле Loki или ClickHouse.

### Как делают бэкап данных Elasticsearch?
- [ ] Копируют каталог данных работающего узла
- [x] Через snapshots в репозиторий, например S3-совместимое хранилище
- [ ] Через pg_dump
- [ ] Бэкап не нужен, хватает реплик
> Реплики не защищают от удаления индекса по ошибке.
