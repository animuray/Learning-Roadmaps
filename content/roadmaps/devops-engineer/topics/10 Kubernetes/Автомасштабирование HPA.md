---
title: Автомасштабирование HPA
slug: avtomasshtabirovanie-hpa
description: Horizontal Pod Autoscaler — metrics-server, метрики CPU и памяти относительно requests, формула расчёта реплик, behavior и стабилизация, кастомные и внешние метрики, KEDA, VPA и Cluster Autoscaler.
duration: 60
level: Средний
quizSize: 10
materials:
  - title: Kubernetes Docs — Horizontal Pod Autoscaling
    url: https://www.kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale
    type: документация
  - title: Kubernetes Docs — HorizontalPodAutoscaler Walkthrough
    url: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough
    type: документация
---

# Автомасштабирование HPA

Нагрузка на приложение меняется: днём пик, ночью тишина, распродажа — всплеск. Держать 20 реплик постоянно — дорого, 3 — не выдержите пик. **Horizontal Pod Autoscaler (HPA)** сам меняет число реплик Deployment или StatefulSet по метрикам.

## Уровни масштабирования

| Что | Инструмент | Как |
| --- | --- | --- |
| Число подов | **HPA** | Больше или меньше реплик |
| Ресурсы пода | **VPA** (Vertical Pod Autoscaler) | Подбирает requests/limits (часто в режиме рекомендаций) |
| Число нод | **Cluster Autoscaler**, **Karpenter** | Добавляет ноды, когда поды не помещаются (Pending), и удаляет пустые |
| По событиям | **KEDA** | Масштабирует по длине очереди Kafka/RabbitMQ, метрикам Prometheus, cron — и до нуля |

HPA и Cluster Autoscaler работают в паре: HPA создал поды → им не хватило места → Cluster Autoscaler добавил ноду.

## Как работает HPA

1. **metrics-server** собирает CPU и память подов с kubelet и отдаёт через Metrics API (`kubectl top` тоже работает через него). Без metrics-server HPA по CPU не работает — статус `<unknown>`.
2. Контроллер HPA раз в ~15 секунд считает нужное число реплик:

```
desiredReplicas = ceil( currentReplicas × currentMetric / targetMetric )
```

Пример: 4 пода, средний CPU 90% от requests, цель 60% → `ceil(4 × 90/60) = 6`.

3. Меняет `replicas` у Deployment в пределах `minReplicas`…`maxReplicas`.

**Важно:** утилизация считается **в процентах от requests**. Нет requests — нет процента — HPA не работает.

## Манифест

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
    - type: Resource
      resource:
        name: memory
        target:
          type: AverageValue
          averageValue: 400Mi
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
```

```bash
kubectl autoscale deploy web --min=2 --max=20 --cpu-percent=60
kubectl get hpa -w
kubectl describe hpa web
```

- При нескольких метриках HPA берёт **максимальное** из рассчитанных чисел реплик.
- `behavior` — скорость: масштабироваться вверх быстро, вниз — медленно. По умолчанию scaleDown использует окно стабилизации **5 минут**, чтобы не «дёргаться» при колебаниях.
- `minReplicas` ≥ 2 для отказоустойчивости.

## Какие метрики выбрать

- **CPU** — хорошо для вычислительных сервисов.
- **Память** — плохой сигнал для многих приложений: память после пика часто не освобождается, и HPA не масштабирует вниз.
- **Метрики приложения** (RPS, задержка, длина очереди) — точнее. Типы метрик `Pods`, `Object`, `External` требуют адаптера: **Prometheus Adapter** или **KEDA**.

## Подводные камни

- Нет requests — HPA не считает утилизацию.
- `replicas` в манифесте Deployment перебивает HPA при каждом `apply` — уберите поле или игнорируйте его в Argo CD.
- Медленный старт приложения — пока новые поды поднимаются, старые перегружены; нужен запас (ниже target, больше minReplicas), readiness и быстрый старт.
- HPA не помогает, если узкое место — база данных.
- Не используйте HPA и VPA по одной и той же метрике (CPU) одновременно.
- DaemonSet масштабировать HPA нельзя.

## Практика

- [ ] Установить metrics-server (в kind — с флагом `--kubelet-insecure-tls`) и проверить `kubectl top pods`
- [ ] Пройти официальный пример с php-apache: Deployment с requests, HPA на 50% CPU, генератор нагрузки на busybox
- [ ] Наблюдать `kubectl get hpa -w` и `kubectl get pods -w`, пока растёт и падает нагрузка; засечь, через сколько уменьшается число реплик
- [ ] Убрать requests у Deployment и увидеть `<unknown>` в HPA
- [ ] Настроить `behavior` с быстрым масштабированием вверх и медленным вниз
- [ ] Прочитать документацию KEDA и описать, как масштабировать воркер по длине очереди

## Лаборатория

Кластер — k3s на стенде, metrics-server работает: `kubectl top pods -A`.

```bash lib
# Kubernetes на стенде — k3s (один узел). root работает с /etc/rancher/k3s/k3s.yaml, ученик — со своим ~/.kube/config
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
# lab_kns имя — чистый namespace задачи (старый удаляется вместе со всем содержимым)
lab_kns() {
  kubectl delete ns "$1" --ignore-not-found --wait=true --timeout=120s >/dev/null 2>&1
  kubectl create ns "$1" >/dev/null
}
# убрать с узла метки и taint-ы, которые оставляют задачи про размещение подов
lab_knode() {
  kubectl taint nodes --all lab-dedicated- >/dev/null 2>&1
  kubectl label nodes --all disktype- zone- >/dev/null 2>&1
  true
}
# lab_kready ns селектор [секунд] — дождаться готовности подов
lab_kready() { kubectl -n "$1" wait --for=condition=Ready pod -l "$2" --timeout="${3:-90}s" >/dev/null 2>&1; }
# lab_kfiles каталог — каталог манифестов ученика (пустой)
lab_kfiles() { rm -rf "$1"; mkdir -p "$1"; chown -R student:student "$1"; }
lab_kj() { kubectl "$@" -o json 2>/dev/null; }
lab_traefik() { kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}'; }
```

```bash setup
lab_knode
```

### Автомасштабирование по CPU

В namespace **`lab-hpa`** работает Deployment **`api`** (1 реплика, без запросов ресурсов). Настройте **HorizontalPodAutoscaler** `api`: от **1** до **4** реплик, цель — **60%** загрузки CPU. HPA должен **получать метрики** — значение текущей загрузки в `kubectl get hpa` не должно быть `<unknown>`.

```bash setup
lab_kns lab-hpa
kubectl -n lab-hpa create deployment api --image=hashicorp/http-echo:1.0 --port=5678 -- /http-echo "-text=ok" >/dev/null
kubectl -n lab-hpa rollout status deploy/api --timeout=90s >/dev/null
```

```bash check
h=$(lab_kj -n lab-hpa get hpa api) || fail "HPA api нет"
[ "$(echo "$h" | jq -r .spec.minReplicas)" = 1 ] && [ "$(echo "$h" | jq -r .spec.maxReplicas)" = 4 ] || fail "Реплики HPA: $(echo "$h" | jq -r '"\(.spec.minReplicas)–\(.spec.maxReplicas)"')"
t=$(echo "$h" | jq -r '[.spec.metrics[]? | select(.resource.name == "cpu") | .resource.target.averageUtilization][0]')
[ "$t" = 60 ] || fail "Цель по CPU — ${t}%"
cpu=$(lab_kj -n lab-hpa get deploy api | jq -r '.spec.template.spec.containers[0].resources.requests.cpu // empty')
[ -n "$cpu" ] || fail "У контейнеров api нет requests.cpu — HPA не от чего считать проценты"
for i in $(seq 45); do
  a=$(kubectl -n lab-hpa get hpa api -o jsonpath='{.status.conditions[?(@.type=="ScalingActive")].status}')
  [ "$a" = True ] && break; sleep 1
done
[ "$a" = True ] || fail "HPA не получает метрики: $(kubectl -n lab-hpa get hpa api -o jsonpath='{.status.conditions[?(@.type=="ScalingActive")].message}')"
ok "HPA api: 1–4 реплики, цель 60% от requests.cpu=$cpu"
```

```text hint
1. Создать HPA можно одной командой для Deployment: минимум, максимум и процент загрузки CPU.
2. Процент считается от запрошенного CPU — без запросов ресурсов HPA не знает, от чего считать, и показывает «unknown». Добавьте Deployment запрос CPU (тогда поды перезапустятся).
3. Посмотреть состояние HPA и его условия в подробном описании.
```

```bash solution
kubectl -n lab-hpa set resources deployment api --requests=cpu=50m,memory=32Mi
kubectl -n lab-hpa rollout status deploy/api
kubectl -n lab-hpa autoscale deployment api --min=1 --max=4 --cpu-percent=60
sleep 30
kubectl -n lab-hpa get hpa api
```

```text review
Эталон: `requests.cpu` у Deployment + `kubectl autoscale deployment api --min=1 --max=4 --cpu-percent=60`.

- HPA раз в 15 секунд берёт метрики у metrics-server и считает `нужно реплик = текущие × текущая загрузка / цель`. Загрузка — в процентах **от requests**, поэтому без requests HPA не работает (`<unknown>`).
- Масштабирование вниз осторожное: окно стабилизации 5 минут, чтобы не «дёргать» реплики. Настраивается в `behavior`.
- Кроме CPU и памяти — свои метрики (RPS, длина очереди) через Prometheus Adapter или KEDA (масштабирование по Kafka, RabbitMQ, вплоть до нуля реплик).
- С HPA уберите `replicas` из манифеста Deployment (или GitOps будет каждый раз возвращать его значение).
```

## Тест

### Что делает HPA?
- [ ] Меняет requests и limits подов
- [x] Автоматически меняет число реплик Deployment или StatefulSet по метрикам
- [ ] Добавляет ноды в кластер
- [ ] Перезапускает зависшие поды
> Ресурсы подов подбирает VPA, ноды добавляет Cluster Autoscaler.

### Какой компонент нужен HPA для масштабирования по CPU и памяти?
= metrics-server
> Он же обеспечивает работу kubectl top.

### Относительно чего считается averageUtilization для CPU?
- [ ] Относительно ядер ноды
- [x] Относительно requests контейнеров
- [ ] Относительно limits
- [ ] Относительно CPU всего кластера
> Поэтому без requests HPA не может посчитать утилизацию.

### 4 реплики, средняя загрузка CPU 90% при цели 60%. Сколько реплик выставит HPA (без ограничений behavior)?
= 6
= шесть
> ceil(4 × 90 / 60) = 6.

### HPA показывает в TARGETS значение unknown. Возможные причины?
- [x] Не установлен или не работает metrics-server
- [x] У контейнеров не заданы requests по CPU
- [ ] Слишком много реплик
- [ ] Неверный тег образа
> Подробности — в kubectl describe hpa.

### Почему число реплик уменьшается не сразу после спада нагрузки?
- [ ] Это ошибка HPA
- [x] По умолчанию для scaleDown действует окно стабилизации 5 минут, чтобы не масштабироваться туда-обратно при колебаниях
- [ ] HPA никогда не уменьшает реплики
- [ ] Нужно перезапустить HPA
> Скорость задаётся секцией behavior.

### Что выберет HPA, если по CPU нужно 5 реплик, а по памяти — 8?
- [ ] 5
- [x] 8 — берётся максимальное значение из метрик
- [ ] Среднее — 6 или 7
- [ ] Минимальное значение minReplicas
> Так приложению хватит ресурсов по всем метрикам.

### Какой инструмент добавляет ноды в кластер, когда новым подам не хватает места?
- [ ] HPA
- [ ] VPA
- [x] Cluster Autoscaler (или Karpenter)
- [ ] metrics-server
> Он реагирует на поды в Pending из-за нехватки ресурсов.

### Как масштабировать воркер по длине очереди в RabbitMQ или Kafka, вплоть до нуля реплик?
- [ ] Обычным HPA по CPU
- [x] С помощью KEDA
- [ ] С помощью VPA
- [ ] Через CronJob
> KEDA создаёт HPA и умеет масштабировать до нуля.

### Почему память — часто плохая метрика для HPA?
- [ ] HPA не поддерживает память
- [x] Многие приложения не освобождают память после пика, и HPA не будет уменьшать число реплик
- [ ] Память нельзя измерить
- [ ] Память всегда равна limits
> CPU или метрики приложения обычно надёжнее.

### Можно ли применить HPA к DaemonSet?
- [ ] Да
- [x] Нет: у DaemonSet число подов определяется числом нод
- [ ] Только с KEDA
- [ ] Только для памяти
> HPA работает с объектами, у которых есть scale: Deployment, StatefulSet, ReplicaSet.

### Почему HPA не поможет, если всё упирается в одну базу данных?
- [ ] HPA не работает с базами
- [x] Больше реплик приложения создадут больше запросов к той же базе — узкое место останется, а может стать хуже
- [ ] База автоматически масштабируется
- [ ] HPA отключается при росте задержек
> Масштабирование должно учитывать всю цепочку зависимостей.
