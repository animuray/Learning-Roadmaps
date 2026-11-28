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

## Лаборатория

Приложение `labapp` пишет лог в `/var/log/labapp/app.log` (служба `lab-labapp`). Loki и Promtail запускаются в Docker (образы `grafana/loki:3.3.0` и `grafana/promtail:3.3.0` уже скачаны). Запросы к Loki — через HTTP API: `curl -s --get localhost:3100/loki/api/v1/query_range --data-urlencode 'query={job="labapp"}' | jq`.

```bash lib
# Логи: Loki (порт 3100) и Promtail — контейнеры в сети Docker «logging».
# lab_loki — запустить Loki со стандартным конфигом образа (если ещё не работает)
lab_loki() {
  docker network inspect logging >/dev/null 2>&1 || docker network create logging >/dev/null
  if [ "$(docker inspect -f '{{.State.Running}}' loki 2>/dev/null)" != true ]; then
    docker rm -f loki >/dev/null 2>&1
    docker run -d --name loki --network logging -p 3100:3100 grafana/loki:3.3.0 >/dev/null
  fi
  for i in $(seq 60); do curl -s localhost:3100/ready 2>/dev/null | grep -q ready && return 0; sleep 1; done
}
# lab_logq 'LogQL' — строки за последний час (JSON-ответ Loki)
lab_logq() { curl -s --get localhost:3100/loki/api/v1/query_range --data-urlencode "query=$1" --data-urlencode "limit=${2:-1000}" --data-urlencode "start=$(( $(date +%s) - 3600 ))000000000"; }
# lab_loglines 'LogQL' — число строк в ответе
lab_loglines() { lab_logq "$1" | jq '[.data.result[]?.values[]?] | length'; }
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
```

```bash setup
lab_img grafana/loki:3.3.0 grafana/promtail:3.3.0
systemctl stop lab-labapp 2>/dev/null; systemctl reset-failed lab-labapp 2>/dev/null
mkdir -p /var/log/labapp /opt/lab
cat > /opt/lab/labapp.py <<'EOF'
import random, time
levels = ["INFO"] * 8 + ["WARN", "ERROR"]
with open("/var/log/labapp/app.log", "a", buffering=1) as f:
    while True:
        lvl = random.choice(levels)
        f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {lvl} order={random.randint(10000, 99999)} handled in {random.randint(5, 900)}ms\n")
        time.sleep(1)
EOF
```

### Собрать логи в Loki

Запустите в Docker-сети **`logging`**:

1. **`loki`** — Loki на порту **3100** (стандартного конфига образа достаточно);
2. **`promtail`** — Promtail с вашим конфигом `~/logging/promtail.yml`, который читает **`/var/log/labapp/*.log`** стенда (подключите каталог в контейнер только на чтение) и отправляет строки в Loki с метками **`job="labapp"`** и **`host="stand"`**.

Строки лога должны находиться в Loki запросом `{job="labapp", host="stand"}`.

```bash setup
docker rm -f promtail loki >/dev/null 2>&1
docker network rm logging >/dev/null 2>&1
rm -rf /home/student/logging && mkdir -p /home/student/logging && chown student:student /home/student/logging
: > /var/log/labapp/app.log
systemd-run -q --unit=lab-labapp python3 /opt/lab/labapp.py
```

```bash check
[ "$(docker inspect -f '{{.State.Running}}' loki 2>/dev/null)" = true ] || fail "Контейнер loki не запущен"
[ "$(docker inspect -f '{{.State.Running}}' promtail 2>/dev/null)" = true ] || fail "Контейнер promtail не запущен: $(docker logs promtail 2>&1 | tail -1 | cut -c1-150)"
for c in loki promtail; do docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' $c | grep -qw logging || fail "$c не в сети logging"; done
[ -f /home/student/logging/promtail.yml ] || fail "Нет ~/logging/promtail.yml"
docker inspect -f '{{range .Mounts}}{{.Source}}:{{.RW}} {{end}}' promtail | grep -q '/var/log/labapp:false' || fail "Каталог /var/log/labapp не подключён в promtail только на чтение"
for i in $(seq 30); do n=$(lab_loglines '{job="labapp", host="stand"}' 50); [ "${n:-0}" -gt 0 ] && break; sleep 1; done
[ "${n:-0}" -gt 0 ] || fail "В Loki нет строк по запросу {job=\"labapp\", host=\"stand\"}. Последние сообщения promtail: $(docker logs promtail 2>&1 | grep -iE 'error|level=warn' | tail -1 | cut -c1-150)"
ok "в Loki $n+ строк labapp; последняя: $(lab_logq '{job="labapp"}' 1 | jq -r '.data.result[0].values[0][1]')"
```

```text hint
1. Создать сеть Docker и запустить Loki в ней с публикацией порта.
2. Конфиг Promtail: свой HTTP-порт, файл позиций (что уже отправлено), адрес отправки в Loki (внутри сети — по имени контейнера) и задание сбора: статическая цель с метками; путь к файлам задаётся специальной меткой с двойным подчёркиванием.
3. Запустить Promtail в той же сети с конфигом и каталогом логов, указав путь к конфигу ключом запуска.
4. Проверить запрос к API Loki.
```

```bash solution
cd ~/logging
cat > promtail.yml <<'EOF'
server:
  http_listen_port: 9080
positions:
  filename: /tmp/positions.yaml
clients:
  - url: http://loki:3100/loki/api/v1/push
scrape_configs:
  - job_name: labapp
    static_configs:
      - targets: [localhost]
        labels:
          job: labapp
          host: stand
          __path__: /var/log/labapp/*.log
EOF
docker network create logging
docker run -d --name loki --network logging -p 3100:3100 grafana/loki:3.3.0
docker run -d --name promtail --network logging \
  -v ~/logging/promtail.yml:/etc/promtail/config.yml:ro -v /var/log/labapp:/var/log/labapp:ro \
  grafana/promtail:3.3.0 -config.file=/etc/promtail/config.yml
sleep 20
curl -s --get localhost:3100/loki/api/v1/query_range --data-urlencode 'query={job="labapp"}' --data-urlencode limit=3 | jq -r '.data.result[].values[][1]'
```

```text review
Эталон — в «Решении».

- Loki индексирует **только метки**, а не текст строк: поэтому дешевле Elasticsearch по железу. Цена — поиск по тексту перебирает строки в выбранных метками потоках, и метки нужно выбирать с умом.
- Метки — низкой кардинальности: `job`, `host`, `env`, `level`. Никогда — `order_id`, `user_id`, `trace_id` в метках: каждый вариант — отдельный поток, Loki захлебнётся. Такие поля ищут фильтрами по тексту.
- Файл позиций хранит, до какого места каждый файл уже отправлен; в продакшене его кладут на том, иначе после пересоздания контейнера логи уйдут повторно.
- Promtail переведён в режим поддержки; новые установки делают на Grafana Alloy (тот же функционал, другой синтаксис), Fluent Bit или Vector.
```

### Найти ошибку оплаты

В логах `labapp` (уже в Loki, метка `job="labapp"`) среди тысяч строк есть **одна** строка о сбое оплаты: `ERROR payment failed order=<номер>`. Найдите её **запросом LogQL** и запишите:

- сам запрос — в `~/logql.txt`;
- номер заказа — в `~/failed-order.txt`.

```bash setup
# чистый Loki и никаких строк от прошлых попыток
docker rm -f promtail loki >/dev/null 2>&1
rm -f /var/log/labapp/history-*.log
lab_loki
cat > /home/student/promtail-labapp.yml <<'EOF'
server:
  http_listen_port: 9080
positions:
  filename: /tmp/positions.yaml
clients:
  - url: http://loki:3100/loki/api/v1/push
scrape_configs:
  - job_name: labapp
    static_configs:
      - targets: [localhost]
        labels: {job: labapp, host: stand, __path__: /var/log/labapp/*.log}
EOF
chown student:student /home/student/promtail-labapp.yml
o=$((RANDOM % 90000 + 10000)); echo $o > /var/lib/lab/failed-order
{ for i in $(seq 1 400); do echo "$(date -Is) INFO order=$((RANDOM % 90000 + 10000)) handled in $((RANDOM % 900))ms"; done
  echo "$(date -Is) ERROR payment failed order=$o: card declined"
  for i in $(seq 1 400); do echo "$(date -Is) WARN order=$((RANDOM % 90000 + 10000)) slow payment provider"; done; } > /var/log/labapp/history-$o.log
docker run -d --name promtail --network logging -v /home/student/promtail-labapp.yml:/etc/promtail/config.yml:ro \
  -v /var/log/labapp:/var/log/labapp:ro grafana/promtail:3.3.0 -config.file=/etc/promtail/config.yml >/dev/null
for i in $(seq 40); do [ "$(lab_loglines "{job=\"labapp\"} |= \"order=$o\"" 5)" -ge 1 ] 2>/dev/null && break; sleep 1; done
rm -f /home/student/logql.txt /home/student/failed-order.txt
```

```bash check
want=$(cat /var/lib/lab/failed-order)
[ -f /home/student/logql.txt ] || fail "Нет ~/logql.txt"
q=$(cat /home/student/logql.txt)
echo "$q" | grep -q 'job="labapp"' || fail "Запрос не выбирает поток по метке job=\"labapp\""
echo "$q" | grep -qE '\|[=~]' || fail "В запросе нет фильтра по тексту строки"
r=$(lab_logq "$q" 50)
[ "$(echo "$r" | jq -r .status)" = success ] || fail "Loki не выполняет запрос: $(echo "$r" | head -c 150)"
lines=$(echo "$r" | jq -r '.data.result[]?.values[]?[1]')
[ "$(echo "$lines" | grep -c .)" = 1 ] || fail "Запрос возвращает $(echo "$lines" | grep -c .) строк — нужна одна строка о сбое оплаты"
echo "$lines" | grep -q "payment failed order=$want" || fail "Запрос находит не ту строку"
[ -f /home/student/failed-order.txt ] && [ "$(tr -d '[:space:]' < /home/student/failed-order.txt)" = "$want" ] || fail "В ~/failed-order.txt не номер заказа из этой строки"
ok "заказ $want найден запросом: $q"
```

```text hint
1. Запрос LogQL начинается с выбора потоков по меткам в фигурных скобках.
2. Дальше — фильтры по тексту строки: «содержит» (|=) или регулярное выражение (|~); их можно ставить друг за другом.
3. Проверить запрос через HTTP API Loki и выписать номер заказа.
```

```bash solution
q='{job="labapp"} |= "ERROR" |= "payment failed"'
echo "$q" > ~/logql.txt
curl -s --get localhost:3100/loki/api/v1/query_range --data-urlencode "query=$q" | jq -r '.data.result[].values[][1]'
curl -s --get localhost:3100/loki/api/v1/query_range --data-urlencode "query=$q" | jq -r '.data.result[].values[][1]' | grep -o 'order=[0-9]*' | cut -d= -f2 > ~/failed-order.txt
```

```text review
Эталон: `{job="labapp"} |= "ERROR" |= "payment failed"`.

- Сначала селектор меток (сужает поток), потом фильтры строк: `|=` содержит, `!=` не содержит, `|~` регулярное выражение. Чем раньше и уже фильтр, тем быстрее запрос.
- Парсеры превращают строку в поля: `| logfmt`, `| json`, `| pattern "<ts> <level> order=<order> <_>"`, затем фильтр по полю `| order = "12345"`.
- Метрики из логов: `sum by (level) (count_over_time({job="labapp"}[5m]))`, `rate({job="labapp"} |= "ERROR" [1m])` — на них строят графики и алерты в Grafana (Loki ruler).
- В Grafana то же самое — раздел Explore с источником Loki и конструктором запросов.
```

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
