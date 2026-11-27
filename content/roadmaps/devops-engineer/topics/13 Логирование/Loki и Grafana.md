---
title: Loki и Grafana
slug: loki-i-grafana
description: Grafana Loki — логи «как Prometheus», индекс только по меткам, потоки и кардинальность, сбор через Grafana Alloy вместо устаревшего Promtail, LogQL — селекторы потоков, фильтры строк, парсеры json и logfmt, метрики из логов, алерты по логам, хранение в объектном хранилище.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Grafana Loki Docs — Query Loki (LogQL)
    url: https://grafana.com/docs/loki/latest/query/
    type: документация
  - title: Grafana Loki Docs — Understand labels
    url: https://grafana.com/docs/loki/latest/getting-started/labels/
    type: документация
  - title: Grafana Loki Docs — Promtail agent (EOL)
    url: https://grafana.com/docs/loki/latest/send-data/promtail/
    type: документация
  - title: Grafana Alloy Docs — Migrate from Promtail
    url: https://grafana.com/docs/alloy/next/set-up/migrate/from-promtail/
    type: документация
---

# Loki и Grafana

**Grafana Loki** — система хранения логов, устроенная «как Prometheus, только для логов». Главная идея: **индексировать только метки**, а не содержимое строк. Поэтому Loki намного дешевле Elasticsearch в хранении и эксплуатации, а поиск по тексту — это быстрый «распределённый grep» по нужным потокам.

```
 Alloy (DaemonSet / на серверах) ──push──► Loki ──► объектное хранилище (S3, MinIO, GCS)
   метки: job, namespace, app                  индекс меток + сжатые чанки строк
                                                  ▲
                                         Grafana (Explore, дашборды, алерты) — LogQL
```

## Потоки и метки

- **Поток** (stream) — все строки с одинаковым набором меток, например `{namespace="prod", app="api"}`.
- Индексируются **только метки** и время. Текст строки хранится сжатыми чанками без индекса.
- Запрос: сначала по меткам выбрать потоки, затем пройти по их строкам фильтрами.

**Кардинальность — главное правило Loki.** Метки должны быть с **ограниченным** числом значений: `env`, `cluster`, `namespace`, `app`, `job`. Нельзя делать меткой `user_id`, `request_id`, `ip`, `trace_id`, даже `level` часто лучше фильтровать по тексту. Слишком много потоков → огромный индекс, мелкие чанки, медленные запросы. По умолчанию Loki ограничивает число меток в индексе (15). Для полей высокой кардинальности есть **structured metadata** — данные рядом со строкой, без индекса.

## Сбор логов: Alloy вместо Promtail

> [!warning] Promtail больше не развивается
> Раньше стандартным агентом Loki был **Promtail**. Он устарел, а **2 марта 2026 года достиг конца жизни (EOL)** — обновлений и поддержки больше нет. Используйте **Grafana Alloy** (дистрибутив OpenTelemetry Collector от Grafana): он собирает логи, метрики и трейсы. Старый конфиг конвертируется командой `alloy convert --source-format=promtail`. Также Loki принимает логи от Fluent Bit, Fluentd, Vector, OpenTelemetry Collector.

Пример конфигурации Alloy для файлов на сервере (`config.alloy`):

```alloy
local.file_match "system" {
  path_targets = [
    {"__path__" = "/var/log/nginx/*.log", "job" = "nginx", "host" = "web-1"},
  ]
}

loki.source.file "system" {
  targets    = local.file_match.system.targets
  forward_to = [loki.write.default.receiver]
}

loki.source.journal "journal" {
  forward_to = [loki.write.default.receiver]
  labels     = {"job" = "journal", "host" = "web-1"}
}

loki.write "default" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

В Kubernetes Alloy ставят Helm-чартом как DaemonSet: он находит поды через `discovery.kubernetes` и добавляет метки `namespace`, `pod`, `container`, `app`.

## LogQL

Запрос = **селектор потоков** + **конвейер** (pipeline):

```logql
{namespace="prod", app="api"}
{namespace="prod", app=~"api|worker"} |= "error"
{app="api"} |= "error" != "healthcheck"
{app="api"} |~ "timeout|refused"
{app="api"} | json | level="error" | duration_ms > 1000
{app="nginx"} | logfmt | status >= 500
{app="nginx"} | pattern `<ip> - - [<_>] "<method> <path> <_>" <status> <_>` | status = "502"
{app="api"} | json | line_format "{{.level}} {{.msg}}"
```

| Элемент | Смысл |
| --- | --- |
| `{...}` | Селектор потоков — **обязателен**, хотя бы одна метка |
| `\|=` / `!=` | Строка содержит / не содержит текст |
| `\|~` / `!~` | Строка соответствует / не соответствует регулярке |
| `\| json`, `\| logfmt`, `\| pattern`, `\| regexp` | Парсеры: извлечь поля из строки |
| `\| level="error"` | Фильтр по извлечённому полю |
| `\| line_format` | Изменить вид строки |

Порядок для скорости: узкий селектор → текстовые фильтры `|=` → парсер → фильтры по полям.

### Метрики из логов

```logql
sum by (app) (rate({namespace="prod"} |= "error" [5m]))

sum by (status) (count_over_time({app="nginx"} | logfmt [1m]))

topk(5, sum by (path) (count_over_time({app="nginx"} | json | status >= 500 [1h])))

quantile_over_time(0.95, {app="api"} | json | unwrap duration_ms [5m]) by (route)
```

Так строят графики «ошибки в логах по сервисам» и **алерты по логам** — через Loki ruler или Grafana Alerting, в том же стиле, что правила Prometheus.

## Grafana + Loki

- **Explore**: выбрать Loki, построить запрос в конструкторе или коде, переключаться между метриками и логами одного периода (split view).
- **Logs Drilldown** — исследование логов без написания запросов.
- Панель **Logs** на дашборде рядом с графиками метрик; переменные `$namespace`, `$app`.
- Связь логов с трейсами: из строки с `trace_id` — переход в Tempo.

## Эксплуатация

- Режимы развёртывания: **monolithic** (один бинарник — для старта), **simple scalable** (read/write/backend), **microservices** (для больших объёмов).
- Хранилище — **объектное** (S3/MinIO) — дёшево и надёжно; на локальном диске — только для тестов.
- **Retention** — срок хранения через compactor (`retention_period`).
- Лимиты на приём и запросы (`limits_config`), чтобы один шумный сервис не положил всех.
- Мультиарендность: заголовок `X-Scope-OrgID`.

## Loki или ELK

| | Loki | ELK / OpenSearch |
| --- | --- | --- |
| Индекс | Только метки | Полнотекстовый по всем полям |
| Стоимость хранения | Низкая (объектное хранилище) | Высокая (быстрые диски, RAM) |
| Поиск по произвольному тексту | Перебор строк выбранных потоков | Мгновенно по индексу |
| Сложная аналитика по полям | Ограниченно | Сильная |
| Связь с метриками | Нативно с Prometheus и Grafana | Через Kibana |

## Практика

- [ ] Поднять Loki и Grafana в Docker Compose, подключить Loki как источник данных
- [ ] Настроить Grafana Alloy на сбор /var/log/nginx и journald с метками job и host
- [ ] Включить Docker-логи контейнеров в сбор и найти логи одного контейнера по метке
- [ ] Написать LogQL-запросы: все ошибки сервиса, ошибки без healthcheck, разбор JSON с фильтром по полю duration_ms
- [ ] Построить график числа ошибок по сервисам из логов через rate и sum by
- [ ] Настроить алерт: больше 10 ошибок оплаты за 5 минут — уведомление в Telegram
- [ ] Специально добавить метку с высокой кардинальностью (например, request_id) на тестовом стенде и посмотреть число потоков через logcli series
- [ ] В Kubernetes поставить Loki и Alloy через Helm и найти логи пода по namespace и app

## Тест

### Что индексирует Loki?
- [ ] Каждое слово в каждой строке лога
- [x] Только метки потоков и время, содержимое строк хранится сжатыми чанками без индекса
- [ ] Только ошибки
- [ ] Ничего не индексирует
> Поэтому Loki дешевле Elasticsearch, а поиск по тексту — перебор выбранных потоков.

### Что такое поток (stream) в Loki?
- [ ] Один лог-файл
- [x] Все строки логов с одинаковым набором меток
- [ ] Соединение с Grafana
- [ ] Очередь Kafka
> Каждая новая комбинация меток создаёт новый поток.

### Какие метки подходят для Loki?
- [x] namespace
- [x] app
- [x] env
- [ ] request_id
- [ ] user_id
> Метки должны иметь ограниченное число значений.

### Каким агентом сейчас рекомендуют собирать логи для Loki вместо Promtail?
= Grafana Alloy
= Alloy
> Promtail достиг конца жизни 2 марта 2026 года; конфиг конвертируется командой alloy convert.

### Какая часть LogQL-запроса обязательна?
- [ ] Парсер json
- [x] Селектор потоков в фигурных скобках хотя бы с одной меткой
- [ ] Функция rate
- [ ] Фильтр по тексту
> Без него Loki не знает, какие потоки читать.

### Что делает запрос с фильтром строк вида `{app="api"} |= "error" != "healthcheck"`?
- [ ] Удаляет строки из Loki
- [x] Выбирает строки сервиса api, содержащие error и не содержащие healthcheck
- [ ] Считает число ошибок
- [ ] Ищет по всем сервисам
> `|=` — содержит, `!=` — не содержит.

### Зачем в LogQL нужен парсер `| json`?
- [ ] Чтобы сохранить логи в JSON
- [x] Чтобы извлечь поля из JSON-строки и затем фильтровать по ним, например по level или duration_ms
- [ ] Чтобы ускорить селектор
- [ ] Для отправки логов
> Аналогично работают logfmt, pattern и regexp.

### Как построить график числа строк с ошибками в секунду по сервисам?
- [ ] `{app="api"} |= "error"`
- [x] `sum by (app) (rate({namespace="prod"} |= "error" [5m]))`
- [ ] `count(error)`
- [ ] `rate(errors_total[5m])`
> Метрические запросы LogQL похожи на PromQL.

### Почему метка с высокой кардинальностью вредна для Loki?
- [ ] Loki её проигнорирует
- [x] Она создаёт огромное число потоков: индекс раздувается, чанки становятся мелкими, запросы и запись замедляются
- [ ] Она шифрует логи
- [ ] Она уменьшает объём хранения
> Для таких значений есть structured metadata или фильтр по тексту.

### Где обычно хранят данные Loki в продакшене?
- [ ] В PostgreSQL
- [x] В объектном хранилище — S3, MinIO, GCS
- [ ] Только в оперативной памяти
- [ ] В etcd
> Локальный диск — для тестов и небольших установок.

### В чём главное отличие Loki от Elasticsearch?
- [x] Loki индексирует только метки и дёшев в хранении
- [x] Elasticsearch строит полнотекстовый индекс и быстро ищет по любому полю, но дороже по ресурсам
- [ ] Loki не умеет искать по тексту
- [ ] Elasticsearch не хранит логи
> Выбор зависит от требований к поиску и бюджета.

### Как в Grafana удобно сопоставить график метрик и логи за тот же период?
- [ ] Экспортировать всё в CSV
- [x] Использовать Explore со split view или поставить панель Logs на дашборд рядом с графиками
- [ ] Открыть Kibana
- [ ] Это невозможно
> Из строки с trace_id можно перейти к трейсу в Tempo.
