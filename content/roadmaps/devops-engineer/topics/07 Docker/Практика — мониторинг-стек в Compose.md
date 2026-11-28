---
title: Практика — мониторинг-стек в Compose
slug: praktika-monitoring-stek-v-compose
description: Поднять в Docker Compose Prometheus, Grafana, Node Exporter и cAdvisor, собрать метрики хоста и контейнеров и построить первый дашборд.
duration: 180
level: Средний
quizSize: 10
materials:
  - title: Prometheus — Node Exporter (GitHub)
    url: https://github.com/prometheus/node_exporter
    type: документация
  - title: Google — cAdvisor (GitHub)
    url: https://github.com/google/cadvisor
    type: документация
  - title: Docker Docs — Compose file reference — services
    url: https://docs.docker.com/reference/compose-file/services/
    type: документация
  - title: Docker Docs — Volumes
    url: https://docs.docker.com/engine/storage/volumes/
    type: документация
---

# Практика — мониторинг-стек в Compose

Классическое тестовое задание и хороший первый шаг к разделу «Мониторинг». Подробно Prometheus и Grafana разберём позже, сейчас цель — **собрать стек из нескольких связанных контейнеров** и увидеть метрики.

## Компоненты

| Сервис | Порт | Что делает |
| --- | --- | --- |
| **Node Exporter** | 9100 | Метрики хоста: CPU, память, диски, сеть, файловые системы |
| **cAdvisor** | 8080 | Метрики контейнеров: CPU, память, сеть, диск по каждому контейнеру |
| **Prometheus** | 9090 | Раз в N секунд опрашивает (scrape) экспортеры по HTTP и хранит временные ряды |
| **Grafana** | 3000 | Дашборды поверх Prometheus |

```
 Grafana :3000 ──запросы PromQL──► Prometheus :9090 ──scrape──► node-exporter:9100
                                                    └─scrape──► cadvisor:8080
```

## Структура проекта

```
monitoring/
├── compose.yaml
├── .env
├── prometheus/
│   └── prometheus.yml
└── grafana/
    └── provisioning/
        └── datasources/
            └── prometheus.yml
```

## prometheus/prometheus.yml

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: node
    static_configs:
      - targets: ["node-exporter:9100"]

  - job_name: cadvisor
    static_configs:
      - targets: ["cadvisor:8080"]
```

## grafana/provisioning/datasources/prometheus.yml

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

Provisioning — источник данных создаётся автоматически при старте, без кликов в интерфейсе.

## compose.yaml

```yaml
services:
  prometheus:
    image: prom/prometheus:v2.55.1
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=15d
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    ports:
      - "127.0.0.1:9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:11.3.0
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    ports:
      - "3000:3000"
    depends_on: [prometheus]
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:v1.8.2
    command:
      - --path.rootfs=/host
    pid: host
    volumes:
      - /:/host:ro,rslave
    restart: unless-stopped

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    privileged: true
    devices:
      - /dev/kmsg
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
```

Почему так:

- **Node Exporter** должен видеть хост, а не контейнер: корень хоста смонтирован в `/host` только для чтения, `--path.rootfs=/host`, `pid: host`. В документации Node Exporter также рекомендуют `network_mode: host`, чтобы видеть сетевые интерфейсы хоста, — тогда Prometheus обращается к нему по адресу хоста, а не по имени сервиса.
- **cAdvisor** читает cgroups и данные Docker, поэтому ему нужны `/sys`, `/var/lib/docker` и повышенные права — это компромисс безопасности, такой контейнер нельзя выставлять наружу.
- Порты Node Exporter и cAdvisor **не публикуются**: Prometheus ходит к ним по внутренней сети Compose. Prometheus опубликован только на localhost, наружу — только Grafana с паролем.
- Данные Prometheus и Grafana — в именованных томах, иначе история и дашборды пропадут при пересоздании.
- Версии образов зафиксированы — проверьте актуальные на странице проектов перед запуском.

## Проверка

```bash
docker compose up -d
docker compose ps
curl -s localhost:9090/-/ready
curl -s localhost:9090/api/v1/targets | grep -o '"health":"[a-z]*"'
```

В интерфейсе Prometheus → **Status → Targets** все цели должны быть `UP`. Простые запросы:

```
up
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100
100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100
rate(container_cpu_usage_seconds_total{name!=""}[5m])
```

В Grafana импортируйте готовые дашборды по ID: **1860** (Node Exporter Full) и дашборд для cAdvisor из каталога grafana.com.

## Практика

- [ ] Создать структуру каталогов и файлы из примера, поднять стек и убедиться, что все сервисы в статусе running
- [ ] Открыть Prometheus → Status → Targets и добиться, чтобы все цели были UP
- [ ] Выполнить в Prometheus запросы `up`, процент свободной памяти и загрузку CPU
- [ ] Войти в Grafana, убедиться, что источник данных создан автоматически, и импортировать дашборд 1860
- [ ] Запустить нагрузку (`stress-ng --cpu 2 --timeout 120` или контейнер с ним) и увидеть её на графиках хоста и контейнеров
- [ ] Подключить к Prometheus метрики приложения из прошлой практики (если у приложения есть `/metrics`) или nginx через nginx-prometheus-exporter
- [ ] Пересоздать стек (`down` и `up`) и убедиться, что история метрик и дашборды сохранились

## Лаборатория

### Prometheus, node-exporter и Grafana

В `~/monitoring/compose.yaml` описан стек: `prometheus` (UI на порту **9091** хоста), `node-exporter` и `grafana` (порт **3300**, вход `admin` / `admin`). Не хватает двух файлов конфигурации — допишите их и поднимите стек:

1. `~/monitoring/prometheus/prometheus.yml` — Prometheus собирает метрики **самого себя** и **node-exporter** раз в 15 секунд; все цели в состоянии UP.
2. `~/monitoring/grafana/provisioning/datasources/prometheus.yml` — Grafana при старте **сама** создаёт источник данных типа Prometheus по адресу `http://prometheus:9090` (источник по умолчанию).

```bash setup
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
lab_img prom/prometheus:v2.55.1 prom/node-exporter:v1.8.2 grafana/grafana-oss:11.3.0
[ -d /home/student/monitoring ] && (cd /home/student/monitoring && docker compose down -v --remove-orphans >/dev/null 2>&1)
docker rm -f $(docker ps -aq --filter label=com.docker.compose.project=monitoring) >/dev/null 2>&1
# порт 3300 мог остаться за контейнером grafana из темы «Grafana»
docker rm -f grafana >/dev/null 2>&1
rm -rf /home/student/monitoring
mkdir -p /home/student/monitoring/prometheus /home/student/monitoring/grafana/provisioning/datasources
cat > /home/student/monitoring/compose.yaml <<'EOF'
services:
  prometheus:
    image: prom/prometheus:v2.55.1
    ports:
      - "9091:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus

  node-exporter:
    image: prom/node-exporter:v1.8.2
    pid: host
    volumes:
      - /:/host:ro
    command: ["--path.rootfs=/host"]

  grafana:
    image: grafana/grafana-oss:11.3.0
    ports:
      - "3300:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana-data:/var/lib/grafana

volumes:
  prometheus-data:
  grafana-data:
EOF
chown -R student:student /home/student/monitoring
```

```bash check
tg=$(curl -s --max-time 5 localhost:9091/api/v1/targets) || fail "Prometheus не отвечает на localhost:9091"
[ -n "$tg" ] || fail "Prometheus не отвечает на localhost:9091"
jobs=$(echo "$tg" | jq -r '.data.activeTargets[] | "\(.labels.job)=\(.health)"' | sort | xargs)
echo "$tg" | jq -e '.data.activeTargets[] | select(.scrapeUrl | test("node-exporter:9100"))' >/dev/null || fail "Prometheus не собирает node-exporter (цели: $jobs)"
echo "$tg" | jq -e '.data.activeTargets[] | select(.scrapeUrl | test(":9090/metrics"))' >/dev/null || fail "Prometheus не собирает метрики самого себя (цели: $jobs)"
for i in $(seq 30); do down=$(curl -s localhost:9091/api/v1/targets | jq '[.data.activeTargets[] | select(.health != "up")] | length'); [ "$down" = 0 ] && break; sleep 1; done
[ "$down" = 0 ] || fail "Не все цели UP: $(curl -s localhost:9091/api/v1/targets | jq -r '.data.activeTargets[] | "\(.labels.job)=\(.health) \(.lastError)"' | xargs)"
iv=$(curl -s localhost:9091/api/v1/status/config | jq -r '.data.yaml' | grep -m1 -E '^\s+scrape_interval:' | awk '{print $2}')
[ "$iv" = 15s ] || fail "Интервал сбора — ${iv:-не задан}"
for i in $(seq 40); do ds=$(curl -s -u admin:admin localhost:3300/api/datasources 2>/dev/null); echo "$ds" | jq -e 'type == "array"' >/dev/null 2>&1 && break; sleep 1; done
echo "$ds" | jq -e 'type == "array"' >/dev/null 2>&1 || fail "Grafana не отвечает на localhost:3300"
echo "$ds" | jq -e '.[] | select(.type == "prometheus" and (.url | test("^http://prometheus:9090/?$")) and .isDefault == true)' >/dev/null || fail "В Grafana нет источника по умолчанию типа prometheus с адресом http://prometheus:9090 (сейчас: $(echo "$ds" | jq -c '[.[] | {type, url, isDefault}]'))"
ok "цели: $jobs; Grafana: источник Prometheus подключён"
```

```text hint
1. Конфиг Prometheus: глобальный интервал сбора и список заданий сбора — у каждого имя и статический список целей «хост:порт». Внутри сети Compose хост — имя сервиса; порт node-exporter стандартный.
2. Файл provisioning для Grafana: версия формата и список источников данных с именем, типом, способом доступа через сервер Grafana, адресом и пометкой «по умолчанию».
3. Поднять стек, открыть в Prometheus страницу состояния целей (Status → Targets) и список источников в Grafana.
```

```bash solution
cd ~/monitoring
cat > prometheus/prometheus.yml <<'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]
  - job_name: node
    static_configs:
      - targets: ["node-exporter:9100"]
EOF
cat > grafana/provisioning/datasources/prometheus.yml <<'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF
docker compose up -d
sleep 20
curl -s localhost:9091/api/v1/targets | jq -r '.data.activeTargets[] | "\(.labels.job) \(.health)"'
```

```text review
Эталон — в «Решении».

- Prometheus **сам ходит** за метриками (pull) по адресам из `scrape_configs`. Внутри Compose адрес — имя сервиса и внутренний порт (`node-exporter:9100`), а не опубликованный порт хоста.
- Provisioning — конфигурация Grafana как код: источники и дашборды из файлов, без кликов. После `down`/`up` всё на месте, а в Git видна история изменений.
- `pid: host` и `/:/host:ro` дают node-exporter видеть процессы и диски **хоста**, иначе он покажет метрики самого контейнера. На обычном сервере монтируют `/:/host:ro,rslave` — чтобы видеть и диски, подключённые позже; в WSL корень не «shared», и `rslave` не даёт контейнеру запуститься.
- Дальше: импортировать дашборд Node Exporter Full (ID 1860), добавить cAdvisor для метрик контейнеров и Alertmanager для алертов.
```

## Тест

### Какие метрики собирает Node Exporter?
- [ ] Метрики каждого контейнера
- [x] Метрики хоста: CPU, память, диски, сеть, файловые системы
- [ ] Логи приложений
- [ ] Метрики базы данных
> Метрики контейнеров собирает cAdvisor.

### Какой компонент собирает метрики по контейнерам?
= cAdvisor
= cadvisor
> Container Advisor от Google.

### Как Prometheus получает метрики от экспортеров?
- [ ] Экспортеры отправляют метрики в Prometheus (push)
- [x] Prometheus сам периодически опрашивает HTTP-эндпоинты экспортеров (pull, scrape)
- [ ] Через общую базу данных
- [ ] Через логи
> Интервал задаётся `scrape_interval`.

### Почему в prometheus.yml цели указаны как node-exporter:9100 и cadvisor:8080?
- [ ] Это внешние адреса
- [x] Prometheus и экспортеры в одной сети Compose, и имена сервисов резолвятся во внутренние IP контейнеров
- [ ] Это имена образов
- [ ] Так требует Prometheus
> Публиковать порты экспортеров на хост не нужно.

### Зачем Node Exporter монтирует корень хоста в /host и запускается с --path.rootfs=/host?
- [ ] Чтобы менять файлы хоста
- [x] Чтобы показывать метрики файловых систем хоста, а не файловой системы контейнера
- [ ] Чтобы ускорить запуск
- [ ] Это нужно для Grafana
> Монтирование только для чтения.

### Зачем хранить данные Prometheus и Grafana в именованных томах?
- [ ] Так быстрее
- [x] Иначе история метрик, пользователи и дашборды пропадут при пересоздании контейнеров
- [ ] Prometheus не работает без тома
- [ ] Чтобы Grafana видела Prometheus
> Объём хранения ограничивают через `--storage.tsdb.retention.time`.

### Что даёт provisioning источника данных в Grafana?
- [ ] Ускоряет запросы
- [x] Источник данных Prometheus создаётся автоматически из файла при старте, без ручной настройки в интерфейсе
- [ ] Создаёт пользователей
- [ ] Устанавливает плагины
> Так конфигурация Grafana тоже хранится в git.

### Как проверить, что Prometheus успешно опрашивает все цели?
- [x] В интерфейсе Status → Targets все цели в состоянии UP
- [x] Запрос up в Prometheus возвращает 1 для каждой цели
- [ ] docker compose ps показывает running
- [ ] В Grafana есть дашборд
> Контейнер может работать, но цель быть DOWN из-за неверного адреса или порта.

### Почему cAdvisor и Node Exporter нельзя выставлять наружу?
- [ ] Они не умеют работать по HTTP
- [x] Они раскрывают подробную информацию о системе, а cAdvisor работает с повышенными правами
- [ ] Они перестанут собирать метрики
- [ ] Prometheus не сможет к ним подключиться
> Доступ к ним нужен только Prometheus по внутренней сети.

### Что показывает запрос up в Prometheus?
- [ ] Время работы сервера
- [x] Удалось ли Prometheus опросить цель: 1 — успешно, 0 — нет
- [ ] Загрузку CPU
- [ ] Количество контейнеров
> Это первая метрика для алерта «экспортер недоступен».

### Какой номер у популярного дашборда Node Exporter Full в каталоге Grafana?
= 1860
> Готовые дашборды импортируют по ID в разделе Dashboards → Import.
