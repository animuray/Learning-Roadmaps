---
title: Alertmanager и алерты
slug: alertmanager-i-alerty
description: Правила алертов Prometheus — expr, for, labels, annotations, состояния inactive, pending и firing; Alertmanager — группировка, дерево маршрутизации, получатели Telegram, почта и webhook, repeat_interval, подавление inhibit_rules, тишина silences, HA; хорошие алерты и runbook.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Prometheus Docs — Alerting rules
    url: https://prometheus.io/docs/prometheus/3.9/configuration/alerting_rules/
    type: документация
  - title: Prometheus Docs — Alertmanager configuration
    url: https://prometheus.io/docs/alerting/latest/configuration/
    type: документация
  - title: Google SRE Book — Monitoring Distributed Systems
    url: https://sre.google/sre-book/monitoring-distributed-systems/
    type: книга
---

# Alertmanager и алерты

Алертинг в Prometheus разделён на две части:

1. **Prometheus** вычисляет **правила алертов** (PromQL-условия) и отправляет сработавшие алерты.
2. **Alertmanager** решает, **кому, куда и как часто** уведомлять: группирует, маршрутизирует, подавляет дубли, отправляет в Telegram, почту, Slack, PagerDuty, webhook.

## Правила алертов

`/etc/prometheus/rules/node.yml`:

```yaml
groups:
  - name: node
    rules:
      - alert: InstanceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Цель {{ $labels.instance }} недоступна"
          description: "job={{ $labels.job }} не отвечает больше 2 минут"
          runbook_url: https://wiki.example.com/runbooks/instance-down

      - alert: DiskWillFillIn4Hours
        expr: predict_linear(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}[6h], 4 * 3600) < 0
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Диск {{ $labels.mountpoint }} на {{ $labels.instance }} заполнится за 4 часа"

      - alert: HighErrorRate
        expr: |
          sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
            / sum by (job) (rate(http_requests_total[5m])) > 0.02
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "У {{ $labels.job }} больше 2% ошибок 5xx"
          description: "Сейчас {{ $value | humanizePercentage }}"
```

- **expr** — PromQL; каждый ряд результата — отдельный алерт.
- **for** — сколько условие должно выполняться непрерывно, прежде чем алерт сработает. Защищает от кратких всплесков.
- **labels** — метки для маршрутизации (`severity`, `team`).
- **annotations** — текст для человека: summary, description, ссылка на runbook; шаблоны `{{ $labels.x }}`, `{{ $value }}`.
- Подключить в `prometheus.yml` через `rule_files`, проверить: `promtool check rules node.yml`. Для правил можно писать юнит-тесты (`promtool test rules`).

Состояния алерта:

```
inactive ──условие истинно──► pending ──держится дольше for──► firing ──условие ложно──► resolved
```

Без `for` алерт переходит в firing сразу. Текущие алерты — вкладка **Alerts** в Prometheus и ряд `ALERTS`.

## Alertmanager

`alertmanager.yml`:

```yaml
global:
  smtp_smarthost: smtp.example.com:587
  smtp_from: alertmanager@example.com
  smtp_auth_username: alertmanager@example.com
  smtp_auth_password_file: /etc/alertmanager/smtp_password

route:
  receiver: telegram-default
  group_by: [alertname, job]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers:
        - severity="critical"
      receiver: telegram-oncall
      repeat_interval: 1h
    - matchers:
        - team="db"
      receiver: email-dba

receivers:
  - name: telegram-default
    telegram_configs:
      - bot_token_file: /etc/alertmanager/telegram_token
        chat_id: -1001234567890
  - name: telegram-oncall
    telegram_configs:
      - bot_token_file: /etc/alertmanager/telegram_token
        chat_id: -1009876543210
  - name: email-dba
    email_configs:
      - to: dba@example.com

inhibit_rules:
  - source_matchers:
      - alertname="InstanceDown"
    target_matchers:
      - severity="warning"
    equal: [instance]
```

### Группировка

`group_by` объединяет похожие алерты в **одно** уведомление: упал узел с 30 подами — одно сообщение «30 алертов PodDown», а не 30 сообщений.

- **group_wait** — сколько подождать, чтобы собрать группу перед первой отправкой;
- **group_interval** — как часто сообщать о новых алертах в уже отправленной группе;
- **repeat_interval** — как часто напоминать о том же, если всё ещё горит.

### Маршрутизация

**route** — дерево: алерт идёт сверху вниз и попадает в **первый подходящий** дочерний маршрут (если не указан `continue: true`). Не подошёл ни один — обрабатывается корневым `receiver`. Так критичные алерты уходят дежурному, а алерты базы — DBA.

### Inhibition и silences

- **inhibit_rules** — **подавление**: если горит «причина» (InstanceDown), не слать «следствия» (warning'и того же instance). Меньше шума.
- **Silences** — **тишина** на время: плановые работы, известная проблема. Создаётся в интерфейсе Alertmanager (:9093) или `amtool silence add`, с автором, комментарием и сроком.

### Высокая доступность

Несколько экземпляров Alertmanager объединяют в кластер (`--cluster.peer`), и Prometheus отправляет алерты **во все**: они договариваются и не дублируют уведомления.

Проверка конфигурации: `amtool check-config alertmanager.yml`. Секреты (токены ботов, пароли SMTP) — в отдельных файлах (`*_file`) или секретах Kubernetes.

## Какие алерты нужны

| Алерт | Условие (идея) | Важность |
| --- | --- | --- |
| Цель недоступна | `up == 0` 2–5 минут | critical |
| Ошибки сервиса | доля 5xx > 1–2% за 5 минут | critical |
| Задержка | p99 > SLO 10 минут | warning/critical |
| Диск | заполнится за N часов / < 10% свободно | warning → critical |
| Память | MemAvailable < 10% | warning |
| Сертификат | истекает через < 14 дней | warning |
| Перезапуски подов | > 3 за час (CrashLoop) | warning |
| Бэкап | последний успешный > 26 часов назад | critical |
| Сам мониторинг | Alertmanager/Prometheus недоступен, «watchdog» перестал приходить | critical |

Принципы:

- алерт → **действие**; нет действия — это не алерт, а панель на дашборде;
- **runbook** у каждого critical: что проверить, как чинить, кого звать;
- по симптомам, а не по каждой причине; разумный `for`, чтобы не дёргать из-за секундных всплесков;
- регулярно разбирать шумные алерты — их чинят или удаляют;
- **Watchdog** — алерт, который горит всегда; если он перестал приходить во внешний сервис (dead man's switch), сломался сам мониторинг.

Готовые наборы правил: **awesome-prometheus-alerts**, правила из `kube-prometheus-stack`.

## Практика

- [ ] Написать правила InstanceDown, заполнение диска через predict_linear и HighErrorRate, проверить их через `promtool check rules`
- [ ] Остановить node_exporter и пронаблюдать переходы inactive → pending → firing во вкладке Alerts
- [ ] Поднять Alertmanager, создать Telegram-бота и настроить получение уведомлений в чат
- [ ] Настроить маршрутизацию: critical — в один чат, остальное — в другой; проверить группировку, остановив несколько экспортеров сразу
- [ ] Добавить inhibit_rule, чтобы при недоступности хоста не приходили его warning-алерты
- [ ] Создать silence на время «плановых работ» и убедиться, что уведомления не приходят
- [ ] Написать runbook для одного critical-алерта и добавить ссылку в annotations

## Лаборатория

Prometheus (`http://localhost:9090`) собирает метрики shop-app (`http_requests_total{path, status}`), правила алертов читает из `/etc/prometheus/rules/*.yml`. Alertmanager установлен из пакетов: служба `prometheus-alertmanager`, конфиг `/etc/prometheus/alertmanager.yml`, порт 9093.

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
lab_prom_base shop
```

### Правило алерта

Создайте файл правил `/etc/prometheus/rules/shop.yml` с алертом **`ShopHighErrorRate`**:

- срабатывает, когда доля ответов 5xx у shop-app за 5 минут **больше 5%**, и держится так **2 минуты**;
- метка `severity: critical`;
- аннотация `summary` с текстом, в котором подставлено текущее значение доли ошибок.

Файл должен проходить `promtool check rules`, а Prometheus — загрузить правило без перезапуска.

```bash setup
rm -f /etc/prometheus/rules/shop.yml
curl -s -X POST localhost:9090/-/reload >/dev/null
```

```bash check
f=/etc/prometheus/rules/shop.yml
[ -f $f ] || fail "Нет $f"
promtool check rules $f >/dev/null 2>&1 || fail "promtool check rules находит ошибки"
r=$(curl -s localhost:9090/api/v1/rules | jq -c '[.data.groups[].rules[] | select(.name == "ShopHighErrorRate")][0]')
[ "$r" != null ] || fail "Работающий Prometheus не загрузил правило ShopHighErrorRate"
[ "$(echo "$r" | jq -r .duration)" = 120 ] || fail "Алерт должен держаться 2 минуты (for), сейчас $(echo "$r" | jq -r .duration) с"
[ "$(echo "$r" | jq -r .labels.severity)" = critical ] || fail "Нет метки severity: critical"
echo "$r" | jq -r .annotations.summary | grep -q '{{' || fail "В summary не подставляется значение"
[ "$(echo "$r" | jq -r .health)" = err ] && fail "Правило выполняется с ошибкой: $(echo "$r" | jq -r .lastError)"
q=$(echo "$r" | jq -r .query)
v=$(lab_promq "$q" | jq -r '.data.result | length')
[ "$v" -ge 1 ] || fail "Выражение алерта сейчас ничего не возвращает, хотя ошибок у shop-app больше 5%"
w=$(lab_promq "$(echo "$q" | sed -E 's/>\s*[0-9.]+/> 99/')" | jq -r '.data.result | length')
[ "$w" = 0 ] || fail "Выражение не похоже на сравнение доли ошибок с порогом"
ok "ShopHighErrorRate: $(echo "$r" | jq -r .state)"
```

```text hint
1. Файл правил: группа с именем и списком правил; у правила алерта — имя, выражение, длительность, метки и аннотации.
2. Выражение — доля ошибок (как в теме PromQL) с условием «больше порога». Алерт активен, пока выражение что-то возвращает.
3. В аннотации текущее значение доступно шаблонной переменной value.
4. Проверить файл утилитой promtool и перечитать конфиг Prometheus.
```

```bash solution
sudo tee /etc/prometheus/rules/shop.yml >/dev/null <<'EOF'
groups:
  - name: shop
    rules:
      - alert: ShopHighErrorRate
        expr: |
          sum(rate(http_requests_total{job="shop-app",status=~"5.."}[5m]))
            / sum(rate(http_requests_total{job="shop-app"}[5m])) * 100 > 5
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "shop-app: {{ $value | printf \"%.1f\" }}% ответов 5xx"
EOF
promtool check rules /etc/prometheus/rules/shop.yml
curl -s -X POST localhost:9090/-/reload
sleep 2
curl -s localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | {name, state, health}'
```

```text review
Эталон — в «Решении».

- `for: 2m` — алерт сначала `pending`, и только если условие держится 2 минуты — `firing`. Защита от разовых всплесков, но и задержка оповещения.
- Алертить на **симптомы** (ошибки и задержки у пользователей, SLO), а не на причины (CPU 90%) — иначе ночные звонки без проблем у пользователей.
- Каждый алерт — с понятным `summary`, `description` и ссылкой на runbook: что проверить и как чинить.
- `promtool test rules` — модульные тесты правил на синтетических данных.
```

### Маршрутизация уведомлений

Настройте Alertmanager (`/etc/prometheus/alertmanager.yml`):

- алерты с **`severity="critical"`** уходят получателю **`oncall`** — webhook `http://127.0.0.1:5001/oncall`;
- все остальные — получателю **`default`** — webhook `http://127.0.0.1:5001/default`;
- алерты группируются по `alertname`, первое уведомление группы — **через 5 секунд**.

Конфиг должен проходить `amtool check-config`, служба `prometheus-alertmanager` — работать. Webhook-приёмник на 5001 уже запущен (пишет полученное в `/var/lib/lab/webhook.log`). Проверка сама отправит тестовые алерты.

```bash setup
systemctl stop lab-webhook 2>/dev/null; systemctl reset-failed lab-webhook 2>/dev/null
cat > /opt/lab/webhook.py <<'EOF'
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        with open("/var/lib/lab/webhook.log", "a") as f:
            for a in body.get("alerts", []):
                f.write(f"{self.path} {a['labels'].get('alertname')} {a['labels'].get('severity')}\n")
        self.send_response(200); self.end_headers()
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 5001), H).serve_forever()
EOF
: > /var/lib/lab/webhook.log
systemd-run -q --unit=lab-webhook python3 /opt/lab/webhook.py
cat > /etc/prometheus/alertmanager.yml <<'EOF'
route:
  receiver: default
receivers:
  - name: default
EOF
systemctl restart prometheus-alertmanager 2>/dev/null; true
```

```bash check
c=/etc/prometheus/alertmanager.yml
amtool check-config $c >/dev/null 2>&1 || fail "amtool check-config находит ошибки"
[ "$(systemctl is-active prometheus-alertmanager)" = active ] || fail "Служба prometheus-alertmanager не работает"
for i in $(seq 20); do curl -s localhost:9093/-/ready >/dev/null 2>&1 && break; sleep 0.5; done
live=$(curl -s localhost:9093/api/v2/status | jq -r .config.original)
echo "$live" | grep -q oncall || fail "Работающий Alertmanager не знает о получателе oncall — конфиг не применён"
: > /var/lib/lab/webhook.log
n=$RANDOM
amtool --alertmanager.url=http://localhost:9093 alert add LabCritical$n severity=critical >/dev/null 2>&1
amtool --alertmanager.url=http://localhost:9093 alert add LabWarning$n severity=warning >/dev/null 2>&1
for i in $(seq 40); do [ "$(grep -c "Lab.*$n" /var/lib/lab/webhook.log)" -ge 2 ] && break; sleep 0.5; done
grep -q "^/oncall LabCritical$n critical" /var/lib/lab/webhook.log || fail "Алерт с severity=critical не пришёл на /oncall (получено: $(tr '\n' ';' < /var/lib/lab/webhook.log))"
grep -q "^/default LabWarning$n warning" /var/lib/lab/webhook.log || fail "Остальные алерты не пришли на /default (получено: $(tr '\n' ';' < /var/lib/lab/webhook.log))"
grep -q "^/oncall LabWarning$n" /var/lib/lab/webhook.log && fail "Некритичный алерт ушёл и на oncall"
ok "critical → oncall, остальное → default"
```

```text hint
1. Корневой маршрут: получатель по умолчанию, группировка, время ожидания перед первым уведомлением группы и вложенные маршруты.
2. Вложенный маршрут с условием на метку (сопоставление «метка = значение») и своим получателем.
3. Получатели — список с именами и настройками webhook (адрес).
4. Проверить конфиг утилитой amtool и применить (reload или перезапуск службы). Тестовый алерт можно отправить той же утилитой.
```

```bash solution
sudo tee /etc/prometheus/alertmanager.yml >/dev/null <<'EOF'
route:
  receiver: default
  group_by: [alertname]
  group_wait: 5s
  group_interval: 30s
  repeat_interval: 4h
  routes:
    - matchers:
        - severity="critical"
      receiver: oncall

receivers:
  - name: default
    webhook_configs:
      - url: http://127.0.0.1:5001/default
  - name: oncall
    webhook_configs:
      - url: http://127.0.0.1:5001/oncall
EOF
amtool check-config /etc/prometheus/alertmanager.yml
sudo systemctl restart prometheus-alertmanager
```

```text review
Эталон — в «Решении».

- Дерево маршрутов: алерт идёт сверху вниз до первого совпавшего маршрута (если нет `continue: true`). Обычная схема: critical → дежурному (PagerDuty, Telegram, звонок), warning → в чат команды, info — никуда.
- `group_by` склеивает похожие алерты в одно уведомление (100 упавших подов — одно сообщение), `group_wait` — подождать, пока группа соберётся, `repeat_interval` — как часто напоминать о том же.
- **Inhibition**: если горит «узел недоступен», не слать алерты о всех сервисах на нём. **Silences** — временно заглушить на время работ (`amtool silence add`).
- Сам Alertmanager тоже мониторят — и делают «dead man's switch»: алерт, который горит всегда; если он перестал приходить, сломалась вся цепочка.
```

## Тест

### Как распределены обязанности между Prometheus и Alertmanager?
- [x] Prometheus вычисляет правила алертов и отправляет сработавшие алерты
- [x] Alertmanager группирует, маршрутизирует, подавляет и отправляет уведомления получателям
- [ ] Alertmanager сам опрашивает цели
- [ ] Prometheus отправляет сообщения в Telegram напрямую
> Это разделение позволяет иметь один Alertmanager для нескольких Prometheus.

### Что делает поле for в правиле алерта?
- [ ] Задаёт, кому отправить алерт
- [x] Задаёт, сколько времени условие должно выполняться непрерывно, прежде чем алерт перейдёт в firing
- [ ] Повторяет алерт каждые N минут
- [ ] Удаляет алерт через N минут
> Защищает от уведомлений из-за коротких всплесков.

### В каком состоянии находится алерт, условие которого выполняется, но ещё не дольше for?
= pending
> После истечения for он переходит в firing.

### Для чего в правиле используют annotations?
- [ ] Для маршрутизации в Alertmanager
- [x] Для человекочитаемого описания: summary, description, ссылка на runbook
- [ ] Для фильтрации рядов
- [ ] Для хранения метрик
> Маршрутизация опирается на labels, например severity.

### Что делает group_by в Alertmanager?
- [ ] Удаляет похожие алерты
- [x] Объединяет алерты с одинаковыми значениями указанных меток в одно уведомление
- [ ] Сортирует получателей
- [ ] Шифрует уведомления
> Падение узла с 30 подами даст одно сообщение, а не 30.

### Что означает repeat_interval?
- [ ] Интервал опроса целей
- [x] Как часто повторно напоминать об алерте, который всё ещё горит
- [ ] Время ожидания перед первой отправкой группы
- [ ] Срок хранения алертов
> Первую отправку откладывает group_wait.

### Как Alertmanager выбирает маршрут для алерта?
- [ ] Отправляет во все маршруты
- [x] Проходит дерево маршрутов и выбирает первый подходящий по меткам дочерний маршрут; если не подошёл ни один — корневой получатель
- [ ] Выбирает случайный
- [ ] По алфавиту
> continue: true позволяет продолжить проверку следующих маршрутов.

### Чем inhibit_rules отличается от silences?
- [x] inhibit_rules — постоянное правило: при активном алерте-причине автоматически подавлять алерты-следствия
- [x] Silences — временная тишина, которую человек создаёт вручную, например на время плановых работ
- [ ] Это одно и то же
- [ ] Silences удаляют правила из Prometheus
> Оба механизма снижают шум.

### Какой командой проверить файл правил алертов перед применением?
- [ ] amtool check-config
- [x] promtool check rules node.yml
- [ ] prometheus --rules
- [ ] grafana-cli rules
> amtool check-config проверяет конфиг Alertmanager.

### Какой алерт стоит будить дежурного ночью?
- [ ] Загрузка CPU 70% на одном воркере
- [x] Доля ошибок 5xx у API выше 2% дольше 5 минут
- [ ] Вышла новая версия Prometheus
- [ ] Свободно 40% диска
> Critical-алерт должен означать проблему для пользователей и требовать действий.

### Зачем нужен алерт Watchdog, который горит всегда?
- [ ] Для тестирования Telegram
- [x] Как dead man's switch: если его уведомления перестали приходить во внешний сервис, значит, сломалась сама система мониторинга
- [ ] Для ускорения Alertmanager
- [ ] Он не нужен
> Мониторинг должен уметь сообщить о собственной поломке.

### Как обеспечить отказоустойчивость Alertmanager?
- [ ] Это невозможно
- [x] Запустить несколько экземпляров в кластере и отправлять алерты из Prometheus во все — они договорятся и не задублируют уведомления
- [ ] Запустить два Alertmanager без связи и получать двойные уведомления
- [ ] Отключить группировку
> Кластер настраивается флагами --cluster.peer.

### Что должно быть у каждого критичного алерта?
- [x] Понятное описание, что случилось и где
- [x] Ссылка на runbook с шагами диагностики и исправления
- [x] Конкретное действие, которое должен выполнить дежурный
- [ ] Отправка всем сотрудникам компании
> Алерт без действия — кандидат в панель дашборда.
