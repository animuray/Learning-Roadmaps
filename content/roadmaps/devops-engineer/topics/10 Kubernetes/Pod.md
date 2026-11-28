---
title: Pod
slug: pod
description: Pod как минимальная единица Kubernetes — манифест, несколько контейнеров в поде (sidecar, init-контейнеры), общая сеть и тома, жизненный цикл и статусы, restartPolicy, почему под, а не контейнер.
duration: 75
level: Основы
quizSize: 10
materials:
  - title: Kubernetes Docs — Pods
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-overview/
    type: документация
  - title: Kubernetes Docs — Workloads
    url: https://www.kubernetes.io/docs/concepts/workloads/
    type: документация
  - title: Kubernetes Docs — Debug Running Pods
    url: https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/
    type: документация
---

# Pod

**Pod** — минимальная единица, которую создаёт и планирует Kubernetes. Это группа из одного или нескольких контейнеров, которые:

- всегда запускаются **на одной ноде**;
- делят **одно сетевое пространство**: один IP, общий `localhost`, общие порты;
- могут делить **тома**;
- живут и умирают вместе.

## Манифест

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
      env:
        - name: MODE
          value: production
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          memory: 256Mi
  restartPolicy: Always
```

```bash
kubectl apply -f pod.yaml
kubectl get pod web -o wide
kubectl describe pod web
kubectl delete pod web
```

`command` и `args` в манифесте переопределяют `ENTRYPOINT` и `CMD` образа соответственно.

## Почему под, а не контейнер

Иногда процессам нужно работать **в паре**, как на одной машине: общий диск, общение через localhost, одинаковое время жизни. Делать это в одном контейнере — значит нарушить «один процесс на контейнер». Под даёт **«логический хост»** для тесно связанных контейнеров:

- **Sidecar** — вспомогательный контейнер рядом с основным: сборщик логов, прокси сервис-меша (Envoy), агент, перечитывающий конфиги.
- **Ambassador / adapter** — прокси к внешнему сервису, адаптер формата метрик.
- **Init-контейнеры** — выполняются **по очереди до** основных и должны успешно завершиться: дождаться базы, выполнить миграции, скачать конфиг.

Кроме того, под — единица **планирования, масштабирования и сетевой адресации**: Kubernetes размещает, реплицирует и балансирует поды целиком.

> [!note] Правило
> Не кладите в один под контейнеры, которые можно масштабировать независимо (например, приложение и базу). Несколько контейнеров в поде — только для тесно связанных вспомогательных процессов.

## Несколько контейнеров

```yaml
spec:
  initContainers:
    - name: wait-db
      image: busybox:1.36
      command: ["sh", "-c", "until nc -z db 5432; do echo waiting; sleep 2; done"]
  containers:
    - name: app
      image: registry.example.com/app:1.4.2
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
    - name: log-shipper
      image: fluent/fluent-bit:3.1
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true
  volumes:
    - name: logs
      emptyDir: {}
```

`emptyDir` — временный том пода: живёт, пока живёт под, общий для его контейнеров.

В современных версиях Kubernetes есть и **нативные sidecar-контейнеры**: init-контейнер с `restartPolicy: Always` стартует до основных и работает всё время жизни пода.

## Жизненный цикл

Фазы пода (`status.phase`):

| Фаза | Значение |
| --- | --- |
| **Pending** | Принят, но ещё не запущен: ждёт планирования, скачивает образ, ждёт том |
| **Running** | Привязан к ноде, хотя бы один контейнер работает |
| **Succeeded** | Все контейнеры успешно завершились (Job) |
| **Failed** | Все контейнеры завершились, хотя бы один — с ошибкой |
| **Unknown** | Нода не отвечает |

Частые статусы в `kubectl get pods`:

| Статус | Что значит и где смотреть |
| --- | --- |
| `ContainerCreating` | Скачивается образ, монтируются тома — `describe` |
| `ImagePullBackOff` / `ErrImagePull` | Неверное имя/тег образа, нет доступа к приватному реестру (imagePullSecrets) |
| `CrashLoopBackOff` | Контейнер запускается и падает, Kubernetes перезапускает с растущей задержкой — `logs --previous` |
| `OOMKilled` | Превышен лимит памяти — `describe`, Last State |
| `Pending` надолго | Нет ноды с нужными ресурсами, taints, PVC не привязан — Events в `describe` |
| `Terminating` надолго | Finalizers, недоступная нода |

## restartPolicy и остановка

- `restartPolicy`: `Always` (по умолчанию, для сервисов), `OnFailure`, `Never` (для Job).
- Перезапуск — это перезапуск **контейнера** kubelet'ом на той же ноде. Если **под** удалён или нода умерла — сам под **не воскресает**: новый создаёт контроллер (Deployment и т. п.).
- Остановка: SIGTERM → ожидание `terminationGracePeriodSeconds` (по умолчанию 30 секунд) → SIGKILL. Хук `preStop` выполняется перед SIGTERM.

Поэтому **голые поды в проде не создают** — только через Deployment, StatefulSet, DaemonSet, Job.

## Практика

- [ ] Написать манифест пода с nginx, применить, посмотреть `-o wide`, `describe` и `logs`
- [ ] Удалить под и убедиться, что сам по себе он не пересоздаётся
- [ ] Создать под из двух контейнеров с общим `emptyDir`: один пишет в файл, второй читает и выводит `tail -f`
- [ ] Проверить, что контейнеры пода видят друг друга через `localhost`
- [ ] Добавить init-контейнер, который ждёт DNS-имя несуществующего сервиса, и посмотреть статус `Init:0/1`
- [ ] Специально вызвать `CrashLoopBackOff` (команда `exit 1`) и `ImagePullBackOff` (несуществующий тег), разобрать оба через `describe` и `logs --previous`

## Лаборатория

Кластер — k3s на стенде, `kubectl` настроен. Манифесты храните в `~/k8s/` — их проверяет и сам кластер, и проверка.

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

### Под из манифеста

Опишите в **`~/k8s/pod.yaml`** под **`web`** в namespace **`lab-pod`**:

- образ `nginx:1.27-alpine`, порт контейнера 80;
- метки `app=web` и `tier=frontend`;
- запросы ресурсов: **50m** CPU и **64Mi** памяти; лимит памяти **128Mi**.

Создайте его **из файла** (`kubectl apply -f`). Под должен быть в состоянии Running.

```bash setup
lab_kns lab-pod
lab_kfiles /home/student/k8s
```

```bash check
[ -f /home/student/k8s/pod.yaml ] || fail "Нет ~/k8s/pod.yaml"
p=$(lab_kj -n lab-pod get pod web) || fail "Пода web в namespace lab-pod нет"
[ "$(echo "$p" | jq -r '.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"] // empty')" != "" ] || fail "Под создан не через kubectl apply -f"
[ "$(echo "$p" | jq -r '.spec.containers[0].image')" = nginx:1.27-alpine ] || fail "Образ — $(echo "$p" | jq -r '.spec.containers[0].image')"
[ "$(echo "$p" | jq -r '.metadata.labels.app + "," + .metadata.labels.tier')" = web,frontend ] || fail "Метки: $(echo "$p" | jq -c .metadata.labels)"
r=$(echo "$p" | jq -c '.spec.containers[0].resources')
[ "$(echo "$r" | jq -r '.requests.cpu')" = 50m ] && [ "$(echo "$r" | jq -r '.requests.memory')" = 64Mi ] && [ "$(echo "$r" | jq -r '.limits.memory')" = 128Mi ] || fail "Ресурсы не те: $r"
lab_kready lab-pod app=web 60 || fail "Под web не стал Ready: $(kubectl -n lab-pod get pod web --no-headers | awk '{print $3}')"
ok "web: Running, $(echo "$r")"
```

```text hint
1. Каркас манифеста можно получить у kubectl, запустив создание пода в режиме «только показать на клиенте» с выводом в YAML.
2. Обязательные поля: версия API, вид объекта, метаданные (имя, namespace, метки) и спецификация со списком контейнеров.
3. Ресурсы — у контейнера: раздел запросов и раздел лимитов.
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  namespace: lab-pod
  labels:
    app: web
    tier: frontend
spec:
  containers:
    - name: nginx
      image: nginx:1.27-alpine
      ports:
        - containerPort: 80
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          memory: 128Mi
EOF
kubectl apply -f ~/k8s/pod.yaml
kubectl -n lab-pod wait --for=condition=Ready pod/web --timeout=60s
```

```text review
Эталон — в «Решении».

- Декларативно (`apply -f` из файла в Git) — а не `kubectl run`: манифест — документация и история изменений. Каркас: `kubectl run web --image=nginx --dry-run=client -o yaml > pod.yaml`.
- `requests` — сколько гарантированно резервирует планировщик (по ним выбирается узел), `limits` — потолок: память выше лимита → OOMKilled, CPU выше лимита → троттлинг. Лимит CPU многие не ставят именно из-за троттлинга.
- «Голый» под никто не перезапустит при падении узла — в работе поды создают Deployment, StatefulSet, Job.
```

### Сайдкар с общим томом

Создайте под **`site`** в namespace **`lab-pod`** (манифест — `~/k8s/sidecar.yaml`) из **двух контейнеров** с общим томом `emptyDir`:

- **`writer`** (`busybox:1.36`) — раз в 5 секунд пишет текущую дату в `/data/index.html`;
- **`web`** (`nginx:1.27-alpine`) — раздаёт этот каталог: том подключён в `/usr/share/nginx/html`.

Запрос к nginx внутри пода должен возвращать дату, записанную writer-ом.

```bash setup
lab_kns lab-pod
mkdir -p /home/student/k8s && chown student:student /home/student/k8s
rm -f /home/student/k8s/sidecar.yaml
```

```bash check
p=$(lab_kj -n lab-pod get pod site) || fail "Пода site нет"
[ "$(echo "$p" | jq '.spec.containers | length')" = 2 ] || fail "В поде site не два контейнера"
echo "$p" | jq -e '.spec.volumes[] | select(.emptyDir != null)' >/dev/null || fail "В поде нет тома emptyDir"
kubectl -n lab-pod wait --for=condition=Ready pod/site --timeout=60s >/dev/null 2>&1 || fail "Под site не стал Ready"
sleep 6
r=$(kubectl -n lab-pod exec site -c web -- wget -qO- http://localhost/ 2>/dev/null)
echo "$r" | grep -qE '20[0-9]{2}|[0-9]{2}:[0-9]{2}:[0-9]{2}' || fail "nginx в поде site отдаёт не дату от writer: «$(echo "$r" | head -c 80)»"
ok "nginx отдаёт: $r"
```

```text hint
1. Том объявляется в спецификации пода один раз, а подключается в каждый контейнер своим путём.
2. Команда первого контейнера — бесконечный цикл оболочки: записать дату в файл и подождать.
3. Проверить: выполнить запрос к localhost изнутри контейнера с nginx (в alpine есть wget).
```

```bash solution
cat > ~/k8s/sidecar.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: site
  namespace: lab-pod
spec:
  volumes:
    - name: html
      emptyDir: {}
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "while true; do date > /data/index.html; sleep 5; done"]
      volumeMounts:
        - name: html
          mountPath: /data
    - name: web
      image: nginx:1.27-alpine
      volumeMounts:
        - name: html
          mountPath: /usr/share/nginx/html
EOF
kubectl apply -f ~/k8s/sidecar.yaml
kubectl -n lab-pod wait --for=condition=Ready pod/site --timeout=60s
sleep 6
kubectl -n lab-pod exec site -c web -- wget -qO- http://localhost/
```

```text review
Эталон — в «Решении».

- Контейнеры одного пода делят сеть (общий localhost и порты) и могут делить тома. `emptyDir` живёт, пока жив под.
- Паттерны: **sidecar** (сборщик логов, прокси Envoy/Istio, обновление конфигов из Git), **init-контейнер** (миграции, ожидание базы — выполняется до основных), **ambassador**.
- С Kubernetes 1.29 sidecar делают как init-контейнер с `restartPolicy: Always` — он стартует раньше основных и завершается после них.
- `kubectl logs site -c writer`, `kubectl exec -it site -c web -- sh` — при нескольких контейнерах `-c` обязателен.
```

## Тест

### Что такое Pod?
- [ ] Отдельный сервер кластера
- [x] Минимальная единица развёртывания: один или несколько контейнеров с общей сетью и томами, которые запускаются вместе на одной ноде
- [ ] Образ контейнера
- [ ] Namespace
> Kubernetes планирует, масштабирует и адресует поды целиком.

### Что общего у контейнеров одного пода?
- [x] Один IP-адрес и общий localhost
- [x] Возможность использовать общие тома
- [x] Они всегда работают на одной ноде
- [ ] Общая файловая система по умолчанию
> Корневая ФС у каждого контейнера своя, общими бывают только смонтированные тома.

### Почему минимальная единица Kubernetes — под, а не контейнер?
- [ ] Контейнеры нельзя запускать по одному
- [x] Под позволяет объединить тесно связанные процессы (основной контейнер и sidecar) с общей сетью, томами и временем жизни, сохранив принцип «один процесс — один контейнер»
- [ ] Поды быстрее контейнеров
- [ ] Так требует Docker
> Под — «логический хост» для группы контейнеров.

### Что делают init-контейнеры?
- [ ] Работают параллельно с основными всё время
- [x] Выполняются по очереди до запуска основных контейнеров и должны успешно завершиться
- [ ] Запускаются после завершения пода
- [ ] Собирают образ
> Типичные задачи — подождать зависимость, подготовить конфиг или выполнить миграцию.

### Под в статусе CrashLoopBackOff. Что это значит и что смотреть?
- [ ] Не удалось скачать образ — смотреть реестр
- [x] Контейнер запускается и падает, Kubernetes перезапускает его с растущей задержкой; смотреть kubectl logs --previous и describe
- [ ] Под ждёт свободную ноду
- [ ] Нода недоступна
> Частые причины — ошибка конфигурации, нет переменной окружения, неверная команда.

### Под долго в статусе Pending. Возможные причины?
- [x] Нет ноды с достаточными свободными ресурсами для requests
- [x] Ноды имеют taints, которые под не допускает, или не подходит nodeSelector
- [x] Не привязан PersistentVolumeClaim
- [ ] Ошибка в коде приложения
> Ошибка в коде приводит к CrashLoopBackOff, а не к Pending.

### Что произойдёт, если удалить «голый» под, созданный без контроллера?
- [ ] Kubernetes пересоздаст его автоматически
- [x] Он будет удалён окончательно — пересоздавать его некому
- [ ] Он переедет на другую ноду
- [ ] Он перейдёт в статус Pending
> Поэтому поды создают через Deployment, StatefulSet, DaemonSet или Job.

### Какая restartPolicy используется по умолчанию?
= Always
> Для Job используют OnFailure или Never.

### Что происходит при удалении пода?
- [ ] Контейнеры сразу получают SIGKILL
- [x] Выполняется preStop, контейнеры получают SIGTERM, через terminationGracePeriodSeconds (по умолчанию 30 секунд) — SIGKILL
- [ ] Под переводится в Pending
- [ ] Ничего, под остаётся
> Приложение должно корректно обрабатывать SIGTERM.

### Что такое emptyDir?
- [ ] Постоянный диск
- [x] Временный том пода, который существует, пока существует под, и доступен всем его контейнерам
- [ ] Пустой образ
- [ ] Каталог на ноде, сохраняющийся навсегда
> Для постоянных данных — PersistentVolumeClaim.

### Что переопределяют поля command и args в манифесте контейнера?
- [x] command переопределяет ENTRYPOINT образа
- [x] args переопределяет CMD образа
- [ ] command переопределяет CMD, а args — ENTRYPOINT
- [ ] Они задают команды для init-контейнеров
> Эта путаница — частый вопрос на собеседованиях.

### Какой статус означает, что контейнер превысил лимит памяти?
= OOMKilled
> Код завершения 137; увидеть можно в kubectl describe pod в Last State.
