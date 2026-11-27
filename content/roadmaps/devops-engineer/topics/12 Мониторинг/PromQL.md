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
