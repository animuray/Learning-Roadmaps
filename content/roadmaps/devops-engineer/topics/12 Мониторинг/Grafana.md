---
title: Grafana
slug: grafana
description: Grafana для визуализации — источники данных, дашборды и панели, типы визуализаций, переменные и шаблонизация, импорт из публичной библиотеки дашбордов, provisioning как код, Explore, папки и права, alerting в Grafana.
duration: 75
level: Основы
quizSize: 10
materials:
  - title: Grafana Docs — Variables
    url: https://grafana.com/docs/grafana/latest/variables/templates-and-variables/
    type: документация
  - title: Grafana Dashboards — Node Exporter Full (ID 1860)
    url: https://grafana.com/grafana/dashboards/1860-node-exporter-full/
    type: инструмент
  - title: Grafana Docs — Provision Grafana
    url: https://grafana.com/docs/grafana/next/administration/provisioning/
    type: документация
---

# Grafana

**Grafana** — платформа визуализации: подключается к источникам данных и строит дашборды, графики, таблицы, алерты. Сама данные не хранит (кроме своих настроек) — только запрашивает. Порт по умолчанию **3000**, логин `admin`/`admin` при первом входе (сразу смените).

## Источники данных (Data sources)

- **Prometheus** — метрики (самый частый).
- **Loki** — логи, **Tempo/Jaeger** — трейсы.
- PostgreSQL, MySQL, ClickHouse, Elasticsearch/OpenSearch, InfluxDB, облачные мониторинги.

Один дашборд может показывать панели из разных источников: метрики рядом с логами за тот же период.

## Дашборды и панели

**Дашборд** — набор **панелей** (panels), сгруппированных в ряды (rows). У каждой панели есть запрос, визуализация и настройки.

| Визуализация | Для чего |
| --- | --- |
| Time series | Графики во времени — основная |
| Stat | Одно большое число (текущее значение, uptime) |
| Gauge / Bar gauge | Заполненность (диск 73%) |
| Table | Таблица (топ запросов, список хостов) |
| Heatmap | Распределение задержек из гистограмм |
| Logs | Логи из Loki |
| State timeline | Состояния во времени (up/down) |

Полезные настройки панели:

- **Unit** — единицы (bytes, percent, seconds, req/s) — Grafana сама переведёт `5368709120` в `5 GB`;
- **Legend** — `{{instance}}` подставит метку в подпись линии;
- **Thresholds** — цвета: зелёный до 70%, жёлтый до 90%, красный выше;
- **Min/Max**, **Decimals**, **Overrides** для отдельных рядов.

## Переменные (шаблонизация)

Переменные — выпадающие списки вверху дашборда. Вместо десяти копий дашборда для каждого сервера — один с переменной:

```
Переменная: instance
Тип: Query
Запрос: label_values(node_uname_info{job="node"}, instance)
Multi-value: да, Include All: да
```

Использование в запросе панели:

```promql
100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle", instance=~"$instance"}[$__rate_interval])) * 100
```

- Типы: **Query** (значения из источника), **Custom** (список вручную), **Interval**, **Data source**, **Constant**, **Text box**, **Ad hoc filters**.
- Цепочки: переменная `job` → `instance` зависит от выбранного `job`.
- Для multi-value используйте `=~` в селекторе.
- Встроенные: `$__interval`, `$__rate_interval`, `$__range`, `$__from`/`$__to`.
- **Repeat** — панель или ряд автоматически повторяется для каждого значения переменной.

## Библиотека готовых дашбордов

На **grafana.com/grafana/dashboards** тысячи готовых дашбордов. Импорт: **Dashboards → New → Import → ID** → выбрать источник данных.

Самый известный — **1860** (Node Exporter Full). Для PostgreSQL, cAdvisor, blackbox_exporter и Kubernetes тоже есть популярные дашборды — ищите по имени экспортера и смотрите на число загрузок и дату обновления. В `kube-prometheus-stack` набор дашбордов для Kubernetes ставится сразу.

Готовый дашборд — хороший старт, но под себя его упрощают: оставляют главное (золотые сигналы, USE), убирают десятки ненужных графиков.

## Provisioning — Grafana как код

Источники и дашборды можно описать файлами и хранить в Git, а не настраивать мышкой:

`/etc/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

`/etc/grafana/provisioning/dashboards/default.yml`:

```yaml
apiVersion: 1
providers:
  - name: default
    folder: Infrastructure
    type: file
    disableDeletion: false
    options:
      path: /var/lib/grafana/dashboards
```

JSON дашбордов кладут в `/var/lib/grafana/dashboards` (экспорт: **Share → Export → Save to file**). Пароли в provisioning — через переменные окружения (`$DB_PASSWORD`). Другие подходы: Terraform-провайдер Grafana, Grafonnet/Jsonnet, Git Sync в новых версиях; в Kubernetes — sidecar, который подхватывает дашборды из ConfigMap.

## Прочее

- **Explore** — режим разовых запросов и расследований без создания дашборда; удобно сравнивать метрики и логи.
- **Папки и права**: команды видят свои дашборды; роли Viewer, Editor, Admin.
- **Annotations** — отметки на графиках (например, время деплоя из CI) — сразу видно, после какого релиза всё сломалось.
- **Grafana Alerting** — свои правила алертов и точки контакта (Telegram, почта, Slack); альтернатива или дополнение к Alertmanager.
- Аутентификация: встроенная, LDAP, OAuth (GitLab, Google, Keycloak).

## Практика

- [ ] Запустить Grafana в Docker Compose рядом с Prometheus, сменить пароль admin
- [ ] Подключить Prometheus как источник данных и выполнить пару запросов в Explore
- [ ] Импортировать дашборд Node Exporter Full (ID 1860) и разобраться, откуда берутся его графики
- [ ] Собрать свой дашборд: CPU, память, диск, сеть, uptime — с правильными единицами и порогами
- [ ] Добавить переменную instance с multi-value и использовать её во всех панелях
- [ ] Посмотреть публичную библиотеку и импортировать дашборд для PostgreSQL или cAdvisor
- [ ] Описать источник данных и дашборды через provisioning и проверить, что после пересоздания контейнера всё на месте

## Лаборатория

Prometheus работает на стенде (`http://localhost:9090`). Grafana запустите в Docker (образ `grafana/grafana-oss:11.3.0` уже скачан). Из контейнера стенд виден по имени `host.docker.internal`, если при запуске добавить `--add-host=host.docker.internal:host-gateway`.

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
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
```

### Grafana как код

Запустите контейнер **`grafana`** (порт **3300** стенда → 3000, пароль администратора **`admin`** через переменную `GF_SECURITY_ADMIN_PASSWORD`) с **provisioning** из каталога `~/grafana/provisioning` (подключите его в `/etc/grafana/provisioning`):

1. источник данных **Prometheus** (адрес `http://host.docker.internal:9090`, по умолчанию);
2. провайдер дашбордов, который загружает JSON из `/var/lib/grafana/dashboards` (подключите туда `~/grafana/dashboards`);
3. дашборд с `uid` **`server`** и названием **`Сервер`** — в нём хотя бы одна панель с запросом `node_load1`.

Ничего не создавайте руками в интерфейсе — всё должно появиться из файлов при старте.

```bash setup
lab_prom_base
lab_img grafana/grafana-oss:11.3.0
lab_drm grafana
# порт 3300 мог остаться за Grafana из практики «мониторинг-стек в Compose»
docker rm -f $(docker ps -aq --filter label=com.docker.compose.project=monitoring) >/dev/null 2>&1
rm -rf /home/student/grafana
mkdir -p /home/student/grafana/provisioning /home/student/grafana/dashboards
chown -R student:student /home/student/grafana
```

```bash check
[ "$(docker inspect -f '{{.State.Running}}' grafana 2>/dev/null)" = true ] || fail "Контейнер grafana не запущен"
for i in $(seq 40); do curl -s localhost:3300/api/health 2>/dev/null | grep -q '"database": *"ok"' && break; sleep 1; done
a() { curl -s -u admin:admin "localhost:3300$1"; }
ds=$(a /api/datasources)
echo "$ds" | jq -e 'type == "array"' >/dev/null 2>&1 || fail "Grafana на localhost:3300 не пускает admin/admin"
echo "$ds" | jq -e '.[] | select(.type == "prometheus" and .isDefault == true and (.url | test("host.docker.internal:9090")))' >/dev/null || fail "Нет источника Prometheus по умолчанию с адресом host.docker.internal:9090"
[ "$(echo "$ds" | jq -r '.[] | select(.type == "prometheus") | .readOnly')" = true ] || fail "Источник создан вручную, а не через provisioning"
db=$(a /api/dashboards/uid/server)
[ "$(echo "$db" | jq -r .dashboard.title)" = "Сервер" ] || fail "Нет дашборда с uid server и названием «Сервер»"
[ "$(echo "$db" | jq -r .meta.provisioned)" = true ] || fail "Дашборд создан вручную, а не загружен из файла"
echo "$db" | jq -r '[.. | .expr? // empty] | join(" ")' | grep -q node_load1 || fail "В дашборде нет панели с запросом node_load1"
uid=$(echo "$ds" | jq -r '.[] | select(.type == "prometheus") | .uid')
h=$(a "/api/datasources/uid/$uid/health" | jq -r .status)
[ "$h" = OK ] || fail "Grafana не может достучаться до Prometheus (проверка источника: $h)"
ok "Grafana: источник Prometheus и дашборд «Сервер» из файлов"
```

```text hint
1. В каталоге provisioning — подкаталоги для источников данных и для провайдеров дашбордов, в каждом YAML-файл со списком.
2. Дашборд — JSON-файл: uid, название, список панелей; у панели — тип, источник и цели с выражением запроса. Минимальный JSON можно написать руками.
3. Запуск контейнера: имя, порт, переменная пароля, дополнительный хост и три тома (provisioning, дашборды и при желании том данных).
```

```bash solution
g=~/grafana
mkdir -p $g/provisioning/datasources $g/provisioning/dashboards $g/dashboards
cat > $g/provisioning/datasources/prometheus.yml <<'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://host.docker.internal:9090
    isDefault: true
EOF
cat > $g/provisioning/dashboards/files.yml <<'EOF'
apiVersion: 1
providers:
  - name: files
    type: file
    options:
      path: /var/lib/grafana/dashboards
EOF
cat > $g/dashboards/server.json <<'EOF'
{
  "uid": "server",
  "title": "Сервер",
  "schemaVersion": 39,
  "panels": [
    {
      "type": "timeseries",
      "title": "Load average 1m",
      "gridPos": {"x": 0, "y": 0, "w": 12, "h": 8},
      "targets": [{"expr": "node_load1", "refId": "A"}]
    }
  ]
}
EOF
docker run -d --name grafana -p 3300:3000 -e GF_SECURITY_ADMIN_PASSWORD=admin \
  --add-host=host.docker.internal:host-gateway \
  -v $g/provisioning:/etc/grafana/provisioning:ro -v $g/dashboards:/var/lib/grafana/dashboards:ro \
  grafana/grafana-oss:11.3.0
sleep 15
curl -s -u admin:admin localhost:3300/api/search | jq -r '.[].title'
```

```text review
Эталон — в «Решении».

- Provisioning превращает Grafana в «конфигурацию как код»: источники и дашборды в Git, пересоздание контейнера ничего не теряет, а правки проходят ревью. Источники с provisioning помечены read-only — в интерфейсе их не сломать.
- Готовые дашборды (Node Exporter Full — 1860) скачивают JSON-ом с grafana.com и кладут в этот же каталог.
- В Kubernetes то же делает kube-prometheus-stack: ConfigMap с меткой `grafana_dashboard` подхватываются sidecar-ом.
- Хороший дашборд отвечает на вопрос «всё ли хорошо и где плохо»: сверху — золотые сигналы (трафик, ошибки, задержки, насыщение), ниже — детали.
```

## Тест

### Хранит ли Grafana сами метрики?
- [ ] Да, во встроенной TSDB
- [x] Нет, она запрашивает данные у источников (Prometheus, Loki, базы) и визуализирует их
- [ ] Да, в PostgreSQL
- [ ] Только последние 24 часа
> Grafana хранит лишь свои настройки, пользователей и дашборды.

### На каком порту Grafana работает по умолчанию?
= 3000
> Первый вход — admin/admin, пароль нужно сразу сменить.

### Зачем в дашборде нужны переменные?
- [ ] Для хранения паролей
- [x] Чтобы один дашборд показывал данные для выбранного сервера, окружения или сервиса без копий дашборда
- [ ] Для ускорения Prometheus
- [ ] Для отправки алертов
> Переменные отображаются выпадающими списками вверху.

### Каким запросом получить список значений метки instance для переменной из Prometheus?
- [ ] `SELECT instance FROM node`
- [x] `label_values(node_uname_info, instance)`
- [ ] `count(instance)`
- [ ] `sum by (instance)`
> Это функция источника Prometheus для переменных типа Query.

### Какой матчер нужно использовать в PromQL для переменной с несколькими выбранными значениями?
- [ ] `=`
- [x] `=~`
- [ ] `!=`
- [ ] `==`
> Grafana подставит значения в виде регулярного выражения a|b|c.

### Как быстро получить готовый дашборд для node_exporter?
- [ ] Написать все панели вручную
- [x] Импортировать готовый дашборд из библиотеки grafana.com по ID, например 1860 (Node Exporter Full)
- [ ] Скачать его из Docker Hub
- [ ] Grafana создаёт его автоматически
> Затем его стоит упростить под свои задачи.

### Что такое provisioning в Grafana?
- [ ] Выдача прав пользователям
- [x] Описание источников данных, дашбордов и алертов файлами (YAML, JSON), которые можно хранить в Git
- [ ] Обновление Grafana
- [ ] Резервное копирование
> Это подход «Grafana как код».

### Какая визуализация лучше подходит для одного текущего значения, например uptime?
- [ ] Time series
- [x] Stat
- [ ] Heatmap
- [ ] Logs
> Gauge — для заполненности, Heatmap — для распределения задержек.

### Зачем настраивать Unit в панели?
- [ ] Для ускорения запроса
- [x] Чтобы Grafana показывала значения в понятных единицах: байты как ГБ, доли как проценты, секунды как мс
- [ ] Для фильтрации рядов
- [ ] Для подписи осей не нужно
> Без единиц 5368709120 трудно прочитать как 5 ГБ.

### Для чего удобен режим Explore?
- [ ] Для импорта дашбордов
- [x] Для разовых запросов и расследований — например, сравнить метрики и логи за период — без создания дашборда
- [ ] Для управления пользователями
- [ ] Для бэкапов
> Из Explore можно перейти от графика к логам того же периода.

### Чем полезны аннотации деплоев на графиках?
- [ ] Они ускоряют деплой
- [x] Показывают момент релиза на графике, и видно, совпала ли деградация с выкаткой
- [ ] Они заменяют алерты
- [ ] Они удаляют старые данные
> Аннотации можно создавать через API Grafana из CI.

### Какие источники данных можно подключить к Grafana?
- [x] Prometheus для метрик
- [x] Loki для логов
- [x] PostgreSQL или ClickHouse
- [ ] Только Prometheus
> На одном дашборде могут быть панели из разных источников.
