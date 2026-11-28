---
title: PromQL
slug: promql
description: Язык запросов Prometheus — instant и range vector, селекторы и матчеры меток, rate, irate и increase, агрегации sum, avg, max, count и topk с by и without, арифметика и сравнения, histogram_quantile, offset, predict_linear, recording rules и типовые запросы.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Prometheus Docs — Querying basics
    url: https://prometheus.io/docs/querying/basics/
    type: документация
  - title: Grafana Docs — Prometheus query editor (примеры запросов)
    url: https://grafana.com/docs/grafana/latest/datasources/prometheus/query-editor/
    type: документация
  - title: Prometheus Docs — Understanding metric types
    url: https://prometheus.io/docs/tutorials/understanding_metric_types/
    type: документация
---

# PromQL

**PromQL** — язык запросов Prometheus. На нём строят графики в Grafana и пишут правила алертов. Важнее понять **логику** (ряды → функции → агрегация), чем выучить все функции.

## Типы результатов

- **Instant vector** — по одному значению каждого ряда в момент времени: `node_load1`.
- **Range vector** — значения каждого ряда за отрезок: `node_cpu_seconds_total[5m]`. Его нельзя нарисовать напрямую — его передают в функцию (`rate`, `avg_over_time`).
- **Scalar** — просто число: `5`.

## Селекторы

```promql
http_requests_total
http_requests_total{job="api", status="500"}
http_requests_total{status=~"5.."}
http_requests_total{status!="200", method!~"GET|HEAD"}
http_requests_total{job="api"}[5m]
http_requests_total offset 1d
```

| Матчер | Смысл |
| --- | --- |
| `=` | Равно |
| `!=` | Не равно |
| `=~` | Соответствует регулярному выражению (целиком) |
| `!~` | Не соответствует регулярке |

## rate, irate, increase — работа со счётчиками

Значение счётчика (`10234` запроса с момента старта) само по себе бесполезно. Нужна **скорость**:

```promql
rate(http_requests_total[5m])
increase(http_requests_total[1h])
irate(http_requests_total[1m])
```

- **`rate(x[5m])`** — средняя скорость роста в секунду за 5 минут. Учитывает сброс счётчика при рестарте. Главная функция для графиков и алертов.
- **`increase(x[1h])`** — прирост за интервал (≈ `rate × секунды`): «сколько ошибок за час».
- **`irate`** — по двум последним точкам: очень «дёрганый», только для детальных графиков.
- Окно должно быть хотя бы в **4 раза больше** `scrape_interval` (при 15 с — минимум 1m, обычно 5m). В Grafana используют `$__rate_interval`.
- **Правило: сначала `rate`, потом `sum`**. `sum` по сырому счётчику, а потом `rate` ломается на рестартах.
- Не применяйте `rate` к gauge — результат бессмысленный.

## Агрегации

```promql
sum(rate(http_requests_total[5m]))
sum by (status) (rate(http_requests_total[5m]))
sum without (instance, pod) (rate(http_requests_total[5m]))
avg by (instance) (node_load1)
max by (mountpoint) (node_filesystem_avail_bytes)
count by (job) (up == 1)
topk(5, sum by (route) (rate(http_requests_total[5m])))
```

- `by (метки)` — оставить только эти метки, по остальным свернуть.
- `without (метки)` — свернуть только по этим.
- Операторы: `sum`, `avg`, `min`, `max`, `count`, `topk`, `bottomk`, `quantile`, `count_values`, `stddev`.
- Функции «по времени» для gauge: `avg_over_time(x[1h])`, `max_over_time`, `min_over_time`.

## Арифметика и сравнения

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m])) * 100

node_filesystem_avail_bytes / node_filesystem_size_bytes * 100 < 10

up == 0
```

- Операции между векторами сопоставляют ряды с **одинаковыми метками**. Если метки разные — `on (...)` / `ignoring (...)`, для «многие к одному» — `group_left`.
- Сравнение (`<`, `>`, `==`) **фильтрует**: остаются только ряды, где условие истинно. Это и есть основа алертов.

## Перцентили из гистограммы

```promql
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m])))

histogram_quantile(0.99,
  sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))
```

Метку **`le`** (верхняя граница корзины) обязательно оставляют в `by`. Средняя задержка: `rate(..._sum[5m]) / rate(..._count[5m])`.

## Шпаргалка инженера

```promql
100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100

(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

100 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes * 100

predict_linear(node_filesystem_avail_bytes[6h], 4 * 3600) < 0

sum by (instance) (rate(node_network_receive_bytes_total[5m])) * 8

sum by (namespace) (rate(container_cpu_usage_seconds_total[5m]))

increase(kube_pod_container_status_restarts_total[1h]) > 3

absent(up{job="api"})
```

- `predict_linear` — линейный прогноз: «диск закончится через 4 часа».
- `absent()` — ряд вообще пропал (например, target исчез из discovery).
- `offset 1w` — сравнить с прошлой неделей.

## Recording rules

Тяжёлые выражения заранее вычисляют и сохраняют как новые ряды — дашборды и алерты работают быстрее:

```yaml
groups:
  - name: api.rules
    rules:
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))
```

Соглашение об именах: `уровень:метрика:операции`.

## Практика

- [ ] В интерфейсе Prometheus выполнить простые селекторы с матчерами `=`, `!=`, `=~`, `!~` по метрикам самого Prometheus и node_exporter
- [ ] Сравнить на графике сырой счётчик, `rate` и `irate` для `node_network_receive_bytes_total`
- [ ] Написать запросы: загрузка CPU в % по инстансам, использование памяти в %, заполненность дисков в %
- [ ] Посчитать запросы в секунду и долю ошибок 5xx своего приложения, разбить по маршруту через `sum by`
- [ ] Посчитать p95 задержки через `histogram_quantile`, сначала без `le` в `by` (получить ошибку), потом правильно
- [ ] Написать прогноз заполнения диска через `predict_linear`
- [ ] Вынести тяжёлый запрос в recording rule и использовать новый ряд в Grafana

## Лаборатория

Prometheus (`http://localhost:9090`) собирает метрики учебного приложения **shop-app** (задание `shop-app`):

- `http_requests_total{path, status}` — счётчик запросов;
- `request_duration_seconds_bucket{le}` — гистограмма времени ответа;
- `queue_size` — текущая длина очереди.

Пишите запросы в файлы — проверка выполнит их в Prometheus и сравнит результат с правильным. Удобно сначала отладить запрос в веб-интерфейсе (Graph) или через `curl -s --get localhost:9090/api/v1/query --data-urlencode 'query=...' | jq`.

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

```bash setup
lab_shop_exporter
curl -s localhost:9090/api/v1/status/config | jq -r .data.yaml | grep -q 'job_name: shop-app' || lab_prom_base shop
mkdir -p /home/student/promql && chown student:student /home/student/promql
# данных для rate() нужно хотя бы две точки в окне
for i in $(seq 60); do [ "$(lab_promq 'count(rate(http_requests_total{job="shop-app"}[1m]))' | jq -r '.data.result[0].value[1] // 0')" = 4 ] && break; sleep 0.5; done
```

### Запросы в секунду по кодам ответа

Напишите в `~/promql/rps.promql` запрос: **сколько запросов в секунду** обрабатывает shop-app **в разбивке по коду ответа** (`status`), усреднённо за последнюю минуту.

```bash setup
rm -f /home/student/promql/rps.promql
```

```bash check
lab_promcmp /home/student/promql/rps.promql 'sum by (status) (rate(http_requests_total{job="shop-app"}[1m]))'
```

```text hint
1. Счётчик только растёт — сам по себе он бесполезен. Нужна функция скорости роста за окно.
2. Затем сложить ряды, оставив только метку кода ответа.
```

```bash solution
echo 'sum by (status) (rate(http_requests_total{job="shop-app"}[1m]))' > ~/promql/rps.promql
```

```text review
Эталон: `sum by (status) (rate(http_requests_total[1m]))`.

- `rate()` — средняя скорость в секунду за окно, корректно переживает сброс счётчика при перезапуске приложения. `irate()` — по двум последним точкам (резкие всплески), `increase()` — прирост за окно (`increase(...[1h])` — запросов за час).
- Сначала `rate`, потом `sum`: `sum(...)` от счётчиков, а потом `rate` — ошибка (сбросы одного ряда ломают сумму).
- Окно `rate` — минимум 4× интервал сбора, иначе в окне окажется меньше двух точек и ряд пропадёт.
```

### Процент ошибок

Напишите в `~/promql/errors.promql` запрос: **какая доля** запросов к shop-app за последние **5 минут** завершилась ошибкой сервера (**коды 5xx**), **в процентах** (одно число).

```bash setup
rm -f /home/student/promql/errors.promql
```

```bash check
lab_promcmp /home/student/promql/errors.promql 'sum(rate(http_requests_total{job="shop-app",status=~"5.."}[5m])) / sum(rate(http_requests_total{job="shop-app"}[5m])) * 100'
```

```text hint
1. Числитель — скорость запросов с кодом, подходящим под шаблон «5 и две любые цифры» (оператор сравнения по регулярному выражению), суммарно.
2. Знаменатель — скорость всех запросов, суммарно.
3. Отношение умножить на 100.
```

```bash solution
echo 'sum(rate(http_requests_total{job="shop-app",status=~"5.."}[5m])) / sum(rate(http_requests_total{job="shop-app"}[5m])) * 100' > ~/promql/errors.promql
```

```text review
Эталон: `sum(rate(...{status=~"5.."}[5m])) / sum(rate(...[5m])) * 100`.

- Это основа SLO и алертов: «доля ошибок > 1% в течение 5 минут». Абсолютное число ошибок без знаменателя бессмысленно — ночью и днём трафик разный.
- `=~` — регулярное выражение (полное совпадение), `!~` — не совпадает, `!=` — не равно.
- Деление векторов идёт по совпадающим меткам. Если метки разные — `sum` с одинаковым `by (...)` в обеих частях или `on(...)`/`ignoring(...)`.
```

### 95-й перцентиль времени ответа

Напишите в `~/promql/p95.promql` запрос: **95-й перцентиль** времени ответа shop-app за последние **5 минут** по гистограмме `request_duration_seconds` (одно число, в секундах).

```bash setup
rm -f /home/student/promql/p95.promql
```

```bash check
lab_promcmp /home/student/promql/p95.promql 'histogram_quantile(0.95, sum by (le) (rate(request_duration_seconds_bucket{job="shop-app"}[5m])))'
```

```text hint
1. Перцентиль по гистограмме считает отдельная функция: ей передают долю (0.95) и скорость роста корзин.
2. Корзины нужно просуммировать, сохранив метку границы корзины — без неё функция не сможет посчитать.
```

```bash solution
echo 'histogram_quantile(0.95, sum by (le) (rate(request_duration_seconds_bucket{job="shop-app"}[5m])))' > ~/promql/p95.promql
```

```text review
Эталон: `histogram_quantile(0.95, sum by (le) (rate(request_duration_seconds_bucket[5m])))`.

- Перцентили, а не среднее: среднее скрывает «хвост» — 5% пользователей с ответом в 3 секунды. SLO формулируют как «p95 < 300 мс».
- Гистограмма даёт оценку по границам корзин (`le`): точность зависит от того, насколько удачно выбраны границы.
- Перцентили нельзя усреднять между экземплярами — суммируют корзины (`sum by (le)`), а потом считают перцентиль. В разрезе сервисов: `sum by (le, service)`.
```

## Тест

### Что вернёт rate(http_requests_total[5m])?
- [ ] Общее число запросов за всё время
- [x] Среднюю скорость роста счётчика в секунду за последние 5 минут для каждого ряда
- [ ] Число запросов за последнюю секунду ровно
- [ ] Максимальное значение за 5 минут
> rate учитывает сбросы счётчика при рестарте.

### Какой матчер выбирает ряды, у которых метка соответствует регулярному выражению?
- [ ] `=`
- [ ] `!=`
- [x] `=~`
- [ ] `!~`
> Например, status=~"5.." — все коды 5xx.

### Чем отличается результат запроса с [5m] от запроса без него?
- [x] С [5m] получается range vector — набор значений за 5 минут, его передают в функции вроде rate
- [x] Без диапазона — instant vector, по одному значению каждого ряда на момент запроса
- [ ] Ничем
- [ ] С [5m] запрос выполняется 5 минут
> Range vector нельзя нарисовать на графике напрямую.

### Какая функция показывает прирост счётчика за интервал, например «сколько ошибок за час»?
= increase
> По сути это rate, умноженный на длину интервала.

### В каком порядке правильно применять rate и sum к счётчикам?
- [ ] Сначала sum, потом rate
- [x] Сначала rate для каждого ряда, затем sum
- [ ] Порядок не важен
- [ ] rate нельзя использовать с sum
> Иначе сброс счётчика на одном инстансе исказит результат.

### Что делает sum by (status) (rate(http_requests_total[5m]))?
- [ ] Удаляет метку status
- [x] Суммирует скорость запросов по всем рядам, оставляя разбивку только по метке status
- [ ] Считает число статусов
- [ ] Сортирует по статусу
> without, наоборот, перечисляет метки, которые нужно убрать.

### Как посчитать 95-й перцентиль задержки из гистограммы?
- [ ] `avg(http_request_duration_seconds)`
- [x] `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))`
- [ ] `max(http_request_duration_seconds_bucket)`
- [ ] `rate(http_request_duration_seconds_sum[5m])`
> Метку le нужно сохранить при агрегации.

### Что произойдёт с запросом `node_filesystem_avail_bytes / node_filesystem_size_bytes * 100 < 10`?
- [ ] Вернёт true или false для каждого диска
- [x] Вернёт только те файловые системы, где свободно меньше 10% — остальные ряды отфильтруются
- [ ] Ошибка синтаксиса
- [ ] Вернёт 10
> Сравнения в PromQL фильтруют ряды — так строятся условия алертов.

### Какая функция помогает построить алерт «диск заполнится через 4 часа»?
= predict_linear
> Она экстраполирует тренд за указанное окно.

### Почему не стоит брать окно rate меньше нескольких интервалов опроса?
- [ ] Prometheus запрещает
- [x] В окне окажется слишком мало точек (нужно минимум две), и результат будет пустым или скачущим; ориентир — не меньше 4 × scrape_interval
- [ ] Это замедляет Prometheus
- [ ] Окно должно быть ровно 1h
> В Grafana для этого есть переменная $__rate_interval.

### Как найти пять маршрутов с наибольшим числом запросов в секунду?
- [ ] `max(5, rate(http_requests_total[5m]))`
- [x] `topk(5, sum by (route) (rate(http_requests_total[5m])))`
- [ ] `sort(http_requests_total)[5]`
- [ ] `limit 5 http_requests_total`
> bottomk — наоборот, наименьшие.

### Зачем нужны recording rules?
- [ ] Для записи логов
- [x] Чтобы заранее вычислять тяжёлые выражения и сохранять их как новые ряды — дашборды и алерты работают быстрее
- [ ] Для отправки алертов
- [ ] Для бэкапа TSDB
> Имена обычно в формате уровень:метрика:операции.

### Можно ли применять rate к gauge, например к node_memory_MemAvailable_bytes?
- [ ] Да, это рекомендуемый способ
- [x] Синтаксически можно, но результат бессмысленный: rate предназначен для счётчиков; для gauge используют avg_over_time, deriv или delta
- [ ] Нет, будет ошибка
- [ ] Только с irate
> PromQL не проверяет тип метрики.
