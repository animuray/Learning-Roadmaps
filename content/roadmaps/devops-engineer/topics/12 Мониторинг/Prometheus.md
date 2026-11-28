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

## Лаборатория

Prometheus установлен из пакетов Ubuntu: служба `prometheus`, конфиг `/etc/prometheus/prometheus.yml`, веб-интерфейс и API — `http://localhost:9090`. Учебное приложение **shop-app** отдаёт метрики на `http://127.0.0.1:8099/metrics`.

```bash lib
# Prometheus 2.45 из пакетов Ubuntu: служба prometheus (порт 9090), node-exporter (9100), alertmanager (9093).
# Учебное приложение shop-app отдаёт метрики на 127.0.0.1:8099/metrics: счётчики растут с постоянной скоростью.
lab_shop_exporter() {
  [ "$(systemctl is-active lab-shop-exporter 2>/dev/null)" = active ] && return
  mkdir -p /opt/lab
  cat > /opt/lab/shop-exporter.py <<'EOF'
import math, time
from http.server import BaseHTTPRequestHandler, HTTPServer
START = time.time()
RATES = {('/api', '200'): 10, ('/api', '500'): 1, ('/login', '200'): 2, ('/login', '404'): 0.5}
BUCKETS = [('0.1', 5), ('0.25', 8), ('0.5', 10), ('1', 11.5), ('+Inf', 13.5)]
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        t = time.time() - START
        out = ['# HELP http_requests_total Requests by path and status', '# TYPE http_requests_total counter']
        for (p, s), r in RATES.items():
            out.append(f'http_requests_total{{path="{p}",status="{s}"}} {r * t:.3f}')
        out += ['# HELP request_duration_seconds Request latency', '# TYPE request_duration_seconds histogram']
        for le, r in BUCKETS:
            out.append(f'request_duration_seconds_bucket{{le="{le}"}} {r * t:.3f}')
        out += [f'request_duration_seconds_sum {3 * t:.3f}', f'request_duration_seconds_count {13.5 * t:.3f}',
                '# HELP queue_size Orders waiting in queue', '# TYPE queue_size gauge', f'queue_size {int(50 + 40 * math.sin(t / 60))}']
        body = ("\n".join(out) + "\n").encode()
        self.send_response(200); self.send_header("Content-Type", "text/plain; version=0.0.4"); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 8099), H).serve_forever()
EOF
  systemctl reset-failed lab-shop-exporter 2>/dev/null
  systemd-run -q --unit=lab-shop-exporter python3 /opt/lab/shop-exporter.py
}
# lab_prom_base [с_shop] — исходный prometheus.yml (prometheus + node; с аргументом — и shop-app), правила из /etc/prometheus/rules
lab_prom_base() {
  pkill -u student -f 'ssh .*-L *([^ ]*:)?9090:' 2>/dev/null
  mkdir -p /etc/prometheus/rules
  cat > /etc/prometheus/prometheus.yml <<'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files: []

scrape_configs:
  - job_name: prometheus
    scrape_interval: 5s
    static_configs:
      - targets: ['localhost:9090']
  - job_name: node
    static_configs:
      - targets: ['localhost:9100']
EOF
  if [ -n "$1" ]; then
    printf '  - job_name: shop-app\n    scrape_interval: 5s\n    static_configs:\n      - targets: ["127.0.0.1:8099"]\n' >> /etc/prometheus/prometheus.yml
    sed -i 's#^rule_files: \[\]#rule_files:\n  - /etc/prometheus/rules/*.yml#' /etc/prometheus/prometheus.yml
  fi
  chown root:root /etc/prometheus/prometheus.yml; chmod 644 /etc/prometheus/prometheus.yml
  sed -i 's/^ARGS=.*/ARGS="--web.enable-lifecycle"/' /etc/default/prometheus
  systemctl enable -q prometheus prometheus-node-exporter 2>/dev/null
  systemctl restart prometheus-node-exporter prometheus
  for i in $(seq 40); do curl -s localhost:9090/-/ready | grep -qi ready && break; sleep 0.25; done
}
# lab_promq 'запрос' [время] — значение запроса через HTTP API (JSON)
lab_promq() { curl -s --get localhost:9090/api/v1/query --data-urlencode "query=$1" ${2:+--data-urlencode "time=$2"}; }
# lab_promcmp файл_с_запросом 'эталонный запрос' — сравнить результаты в один момент времени
lab_promcmp() {
  python3 - "$1" "$2" <<'EOF'
import json, sys, time, urllib.parse, urllib.request
path, ref = sys.argv[1], sys.argv[2]
try:
    q = open(path).read().strip()
except OSError:
    print(f"✗ Нет файла {path}"); sys.exit(1)
if not q:
    print(f"✗ Файл {path} пуст"); sys.exit(1)
t = time.time()
def run(query):
    u = "http://localhost:9090/api/v1/query?" + urllib.parse.urlencode({"query": query, "time": t})
    try:
        d = json.load(urllib.request.urlopen(u, timeout=10))
    except urllib.error.HTTPError as e:
        d = json.load(e)
    if d.get("status") != "success":
        return None, d.get("error", "ошибка")
    res = d["data"]["result"]
    if d["data"]["resultType"] == "scalar":
        return {(): float(res[1])}, None
    return {tuple(sorted((k, v) for k, v in r["metric"].items() if k != "__name__")): float(r["value"][1]) for r in res}, None
got, err = run(q)
if got is None:
    print(f"✗ Prometheus не может выполнить запрос: {err}"); sys.exit(1)
want, _ = run(ref)
if not want:
    print("✗ Данных ещё мало — подождите полминуты и проверьте снова"); sys.exit(1)
if set(got) != set(want):
    print(f"✗ Запрос возвращает не тот набор рядов: {len(got)} шт. с метками {sorted(dict(k) for k in got)[:3]}"); sys.exit(1)
for k, v in want.items():
    if abs(got[k] - v) > max(abs(v) * 0.03, 1e-6):
        print(f"✗ Значение {got[k]:.4g} для {dict(k) or 'результата'} неверное"); sys.exit(1)
print("✓ " + "; ".join(f"{dict(k) or 'итог'}: {v:.4g}" for k, v in sorted(got.items())))
EOF
}
```

### Подключить приложение к мониторингу

Добавьте в Prometheus задание сбора **`shop-app`**: цель `127.0.0.1:8099`, интервал сбора **10 секунд**, каждому ряду этого задания — метка **`env="lab"`**. Конфиг должен проходить проверку `promtool`, а Prometheus — применить его **без перезапуска** службы. Цель должна быть в состоянии UP.

```bash setup
lab_shop_exporter
lab_prom_base
systemctl show -p MainPID --value prometheus > /var/lib/lab/prom-pid
```

```bash check
promtool check config /etc/prometheus/prometheus.yml >/dev/null 2>&1 || fail "promtool check config находит ошибки в /etc/prometheus/prometheus.yml"
[ "$(systemctl show -p MainPID --value prometheus)" = "$(cat /var/lib/lab/prom-pid)" ] || fail "Prometheus перезапускали — конфиг нужно было применить без перезапуска"
cfg=$(curl -s localhost:9090/api/v1/status/config | jq -r .data.yaml)
echo "$cfg" | grep -q 'job_name: shop-app' || fail "Работающий Prometheus не знает о задании shop-app — конфиг не применён"
for i in $(seq 30); do t=$(curl -s localhost:9090/api/v1/targets | jq -c '[.data.activeTargets[] | select(.labels.job == "shop-app")][0]'); [ "$(echo "$t" | jq -r .health)" = up ] && break; sleep 1; done
[ "$(echo "$t" | jq -r .health)" = up ] || fail "Цель shop-app не UP: $(echo "$t" | jq -r '.health + " " + .lastError')"
[ "$(echo "$t" | jq -r .scrapeInterval)" = 10s ] || fail "Интервал сбора shop-app — $(echo "$t" | jq -r .scrapeInterval)"
[ "$(echo "$t" | jq -r .labels.env)" = lab ] || fail "У рядов shop-app нет метки env=\"lab\""
ok "shop-app UP, каждые 10s, env=lab"
```

```text hint
1. В списке заданий сбора — новое задание: имя, интервал, статическая цель и метки, которые добавятся ко всем её рядам.
2. Проверить файл утилитой promtool перед применением.
3. Prometheus перечитывает конфиг по сигналу «перечитать» (или через HTTP-адрес перезагрузки — он здесь включён). Состояние целей — на странице Status → Targets.
```

```bash solution
sudo tee -a /etc/prometheus/prometheus.yml >/dev/null <<'EOF'
  - job_name: shop-app
    scrape_interval: 10s
    static_configs:
      - targets: ['127.0.0.1:8099']
        labels:
          env: lab
EOF
promtool check config /etc/prometheus/prometheus.yml
sudo systemctl reload prometheus || curl -s -X POST localhost:9090/-/reload
sleep 12
curl -s localhost:9090/api/v1/targets | jq -r '.data.activeTargets[] | "\(.labels.job) \(.health)"'
```

```text review
Эталон — задание `shop-app` в `scrape_configs` → `promtool check config` → `systemctl reload prometheus` (SIGHUP) или `POST /-/reload`.

- Prometheus сам ходит за метриками (**pull**): удобно видеть, что цель умерла (`up == 0`), и не нужно настраивать отправку в каждом приложении. Короткоживущие задачи отдают метрики через Pushgateway.
- Статические цели — для простого случая. В реальности — service discovery: `kubernetes_sd_configs`, `consul_sd_configs`, облачные, `file_sd_configs` (Ansible генерирует список целей файлом).
- Метки `env`, `team`, `service` на уровне цели — основа для дашбордов и маршрутизации алертов. Не кладите в метки уникальные значения (user_id, URL с параметрами): каждая комбинация меток — отдельный ряд, и Prometheus «взорвётся» по памяти (высокая кардинальность).
```

```text notes
systemctl\s+restart\s+prometheus => Prometheus перезапускали — данные не теряются, но сбор прерывается. Конфиг применяют reload-ом.
```

### Срок хранения метрик

Метрики нужны **7 дней** — дольше хранить негде. Настройте срок хранения TSDB у Prometheus и примените. Сам параметр задаётся ключом запуска; для пакета Ubuntu ключи пишут в `/etc/default/prometheus` (переменная `ARGS`).

```bash setup
lab_shop_exporter
lab_prom_base
```

```bash check
r=$(curl -s localhost:9090/api/v1/status/flags | jq -r '.data["storage.tsdb.retention.time"]')
[ "$r" = 7d ] || [ "$r" = 1w ] || fail "Срок хранения у работающего Prometheus — ${r:-по умолчанию 15d}"
grep -qE 'retention\.time[= ]7d' /etc/default/prometheus || fail "Срок хранения не сохранён в /etc/default/prometheus — после перезапуска вернётся по умолчанию"
grep -q -- '--web.enable-lifecycle' /etc/default/prometheus || fail "Из ARGS пропал ключ --web.enable-lifecycle"
ok "retention 7d"
```

```text hint
1. Флаг срока хранения TSDB — в справке prometheus --help (раздел storage.tsdb).
2. Добавить его к существующим ключам в переменной ARGS, не удаляя их.
3. Ключи запуска применяются только при перезапуске службы. Текущие флаги видны на странице Status → Command-Line Flags.
```

```bash solution
sudo sed -i 's/^ARGS="\(.*\)"$/ARGS="\1 --storage.tsdb.retention.time=7d"/' /etc/default/prometheus
cat /etc/default/prometheus | grep ^ARGS
sudo systemctl restart prometheus
sleep 2
curl -s localhost:9090/api/v1/status/flags | jq -r '.data["storage.tsdb.retention.time"]'
```

```text review
Эталон: `--storage.tsdb.retention.time=7d` в ARGS → `systemctl restart prometheus`.

- По умолчанию 15 дней. Ещё есть `--storage.tsdb.retention.size=10GB` — что наступит раньше.
- Ключи запуска (флаги) меняются только перезапуском, конфиг (`prometheus.yml`) — reload-ом. Это частый вопрос «почему reload не помог».
- Долгое хранение и общий взгляд на несколько Prometheus — Thanos, Grafana Mimir, VictoriaMetrics (remote_write).
```

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
