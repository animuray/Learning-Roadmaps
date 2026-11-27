---
title: Prometheus
slug: prometheus
description: Архитектура Prometheus — сервер, TSDB, экспортеры, Pushgateway, Alertmanager, service discovery; pull-модель и формат /metrics, типы метрик counter, gauge, histogram и summary; prometheus.yml, scrape_configs, relabeling, хранение и масштабирование.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Prometheus Docs — Overview
    url: https://prometheus.io/docs/
    type: документация
  - title: Prometheus Docs — Metric types
    url: https://prometheus.io/docs/concepts/metric_types/
    type: документация
  - title: Prometheus Blog — Announcing Prometheus 3.0
    url: https://prometheus.io/blog/2024/11/14/prometheus-3-0/
    type: статья
---

# Prometheus

**Prometheus** — открытая система мониторинга и алертинга, созданная в SoundCloud, второй проект CNCF после Kubernetes. Стандарт де-факто для метрик в мире контейнеров. Текущая линейка — **3.x** (3.0 вышла в ноябре 2024: новый интерфейс, приём OTLP от OpenTelemetry, UTF-8 в именах метрик, Remote Write 2.0).

## Архитектура

```
  экспортеры / приложения (/metrics)          service discovery
  node_exporter :9100, app :8080/metrics  ◄── (static, file, Kubernetes, Consul, облака)
            ▲                                        │
            │ pull (HTTP GET каждые 15–30 с)         ▼
     ┌──────┴──────────────────────────────────────────┐
     │  PROMETHEUS SERVER :9090                        │
     │  scrape → TSDB (локальный диск) → PromQL        │
     │  rules: recording + alerting                    │
     └──────┬───────────────────────┬──────────────────┘
            │ алерты                │ запросы PromQL
            ▼                       ▼
     ALERTMANAGER :9093         GRAFANA :3000
     (группировка, маршрутизация → Telegram, почта, Slack)

  короткие задачи → push → PUSHGATEWAY :9091 ← pull
```

- **Prometheus server** — опрашивает цели, хранит ряды в локальной **TSDB**, выполняет PromQL и правила.
- **Экспортеры** — переводят метрики систем (Linux, PostgreSQL, Nginx) в формат Prometheus.
- **Приложения** с клиентской библиотекой отдают свои метрики сами.
- **Alertmanager** — отдельный сервис: принимает алерты, группирует, отправляет уведомления.
- **Pushgateway** — для коротких задач, которые не дождутся опроса.
- **Service discovery** — автоматический поиск целей (поды Kubernetes, ВМ в облаке).

## Pull-модель и формат /metrics

Prometheus каждые `scrape_interval` делает `GET /metrics` у цели. Ответ — простой текст:

```
# HELP http_requests_total Total HTTP requests.
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 10234
http_requests_total{method="GET",status="500"} 12
# HELP process_resident_memory_bytes Resident memory size.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 5.4e+07
```

Для каждой цели Prometheus сам добавляет ряд **`up`**: 1 — опрос удался, 0 — цель недоступна. Это первый алерт, который стоит настроить.

## Типы метрик

| Тип | Что это | Примеры | Как использовать |
| --- | --- | --- | --- |
| **Counter** | Только растёт (сбрасывается в 0 при рестарте) | `http_requests_total`, `node_network_receive_bytes_total` | Само значение бесполезно — смотрят `rate()`/`increase()` |
| **Gauge** | Может расти и падать | Температура, свободная память, число соединений, длина очереди | Смотрят как есть, `avg_over_time`, `max` |
| **Histogram** | Распределение по «корзинам» (buckets) + `_sum` и `_count` | `http_request_duration_seconds_bucket{le="0.5"}` | Перцентили через `histogram_quantile()`; агрегируется между инстансами |
| **Summary** | Перцентили, посчитанные на клиенте | `rpc_duration_seconds{quantile="0.99"}` | Дешевле, но перцентили **нельзя агрегировать** между инстансами |

- Не используйте counter для значения, которое может уменьшаться (число процессов — это gauge).
- Имена: `snake_case`, единицы в имени (`_seconds`, `_bytes`), счётчики оканчиваются на `_total`.
- Для задержек обычно выбирают **histogram**. В 3.x развиваются **native histograms** — корзины без ручной настройки.

## prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: prod

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']

  - job_name: node
    static_configs:
      - targets: ['10.0.1.10:9100', '10.0.1.11:9100']
        labels:
          env: prod

  - job_name: app
    metrics_path: /metrics
    scrape_interval: 10s
    file_sd_configs:
      - files: ['/etc/prometheus/targets/app-*.json']

  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
```

- **job** — группа однотипных целей; **instance** — конкретная цель (`host:port`). Метки `job` и `instance` добавляются автоматически.
- **relabel_configs** — переписывание меток **до** опроса (фильтрация целей, новые метки из метаданных); **metric_relabel_configs** — после (выбросить лишние метрики).
- Проверка и перезагрузка: `promtool check config prometheus.yml`, `kill -HUP <pid>` или `POST /-/reload` (с флагом `--web.enable-lifecycle`).
- Вкладка **Status → Targets** в интерфейсе показывает состояние каждой цели и ошибку опроса.

## Хранение и масштабирование

- Локальная TSDB, срок хранения — `--storage.tsdb.retention.time=15d` (по умолчанию 15 дней) или по размеру.
- Один Prometheus — без кластера: для HA запускают **два одинаковых**, а Alertmanager убирает дубли алертов.
- Долгосрочное хранение и глобальный вид — через **remote_write** в Thanos, Grafana Mimir, VictoriaMetrics.
- В Kubernetes — **Prometheus Operator** / `kube-prometheus-stack`: цели описывают ресурсами `ServiceMonitor` и `PodMonitor`, правила — `PrometheusRule`.

## Свои метрики приложения

```python
from prometheus_client import Counter, Histogram, start_http_server

REQUESTS = Counter("app_requests_total", "Requests", ["route", "status"])
LATENCY = Histogram("app_request_duration_seconds", "Latency", ["route"])

start_http_server(8000)
```

Клиентские библиотеки есть для Go, Java, Python, Node.js и других; во многих фреймворках метрики включаются одной строкой.

## Практика

- [ ] Запустить Prometheus в Docker с собственным prometheus.yml, открыть :9090 и посмотреть Status → Targets
- [ ] Открыть /metrics самого Prometheus и найти примеры counter, gauge и histogram по строкам TYPE
- [ ] Добавить job для node_exporter на своей ВМ и проверить ряд `up`
- [ ] Остановить экспортер и увидеть `up == 0` и ошибку на странице Targets
- [ ] Вынести цели в file_sd_configs и добавить новую цель без перезапуска Prometheus
- [ ] Добавить в своё приложение счётчик запросов и гистограмму задержки через клиентскую библиотеку
- [ ] Проверить конфиг через `promtool check config` и перезагрузить его через `/-/reload`

## Тест

### Как Prometheus получает метрики от целей?
- [ ] Цели отправляют метрики по SMTP
- [x] Сам периодически опрашивает HTTP-эндпоинт /metrics у каждой цели (pull)
- [ ] Читает логи
- [ ] Подключается по SSH
> Интервал задаёт scrape_interval.

### Какой компонент отвечает за отправку уведомлений об алертах в Telegram или на почту?
= Alertmanager
> Prometheus только вычисляет правила и отправляет сработавшие алерты в Alertmanager.

### Для чего нужен Pushgateway?
- [ ] Для замены Prometheus
- [x] Для коротких задач (cron, батчи), которые завершаются раньше, чем Prometheus успеет их опросить
- [ ] Для хранения логов
- [ ] Для отправки алертов
> Для долгоживущих сервисов его не используют.

### Что показывает ряд up, который Prometheus создаёт для каждой цели?
- [ ] Время работы сервера
- [x] 1 — последний опрос цели прошёл успешно, 0 — цель недоступна
- [ ] Число запросов
- [ ] Версию экспортера
> Алерт на up == 0 — один из первых.

### Чем counter отличается от gauge?
- [x] Counter только растёт (сбрасывается при рестарте), к нему применяют rate() или increase()
- [x] Gauge может расти и падать, его смотрят как текущее значение
- [ ] Gauge только растёт
- [ ] Counter хранит текст
> Число процессов — gauge, число обработанных запросов — counter.

### Какой тип метрики выбрать для свободной памяти на сервере?
= gauge
> Значение может как расти, так и уменьшаться.

### Почему для задержек в распределённой системе обычно выбирают histogram, а не summary?
- [ ] Histogram точнее всегда
- [x] Корзины гистограмм можно складывать между инстансами и считать общий перцентиль, а квантили summary агрегировать нельзя
- [ ] Summary не поддерживается в Prometheus
- [ ] Histogram не занимает места
> Перцентиль считают через histogram_quantile().

### Какие метки Prometheus автоматически добавляет каждой цели?
- [x] job
- [x] instance
- [ ] env
- [ ] cluster
> env и cluster задают вручную через labels или external_labels.

### Чем relabel_configs отличается от metric_relabel_configs?
- [x] relabel_configs применяется до опроса — фильтрует цели и формирует их метки
- [x] metric_relabel_configs применяется к уже собранным метрикам — например, чтобы выбросить лишние
- [ ] Это одно и то же
- [ ] metric_relabel_configs меняет алерты
> Relabeling — главный инструмент работы с service discovery.

### Как проверить конфигурацию Prometheus перед применением?
- [ ] prometheus --test
- [x] promtool check config prometheus.yml
- [ ] curl /metrics
- [ ] systemctl check prometheus
> Для правил — promtool check rules.

### Как обеспечить высокую доступность и долгое хранение метрик Prometheus?
- [x] Запустить два одинаковых Prometheus, а Alertmanager уберёт дубли алертов
- [x] Отправлять данные через remote_write в Thanos, Grafana Mimir или VictoriaMetrics
- [ ] Включить встроенный кластерный режим Prometheus
- [ ] Хранить TSDB в Git
> Сам Prometheus — одиночный сервер с локальным хранилищем.

### Как в Kubernetes с Prometheus Operator описывают, какие сервисы опрашивать?
- [ ] Через ConfigMap с prometheus.yml вручную
- [x] Ресурсами ServiceMonitor и PodMonitor
- [ ] Через Ingress
- [ ] Через annotations Deployment обязательно
> Правила алертов описывают ресурсом PrometheusRule.
