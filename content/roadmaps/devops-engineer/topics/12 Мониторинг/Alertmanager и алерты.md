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
