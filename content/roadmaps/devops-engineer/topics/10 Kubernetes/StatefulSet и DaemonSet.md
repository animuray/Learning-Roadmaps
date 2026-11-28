---
title: StatefulSet и DaemonSet
slug: statefulset-i-daemonset
description: StatefulSet для приложений с состоянием — стабильные имена и DNS, volumeClaimTemplates, порядок запуска и обновления; DaemonSet — под на каждой ноде для агентов логов, мониторинга и сети; сравнение с Deployment.
duration: 60
level: Средний
quizSize: 10
materials:
  - title: Kubernetes Docs — Workload Management
    url: https://kubernetes.io/docs/concepts/workloads/controllers/_print
    type: документация
  - title: Kubernetes Docs — Workloads
    url: https://www.kubernetes.io/docs/concepts/workloads/
    type: документация
  - title: Kubernetes Docs — DNS for Services and Pods
    url: https://www.kubernetes.io/docs/concepts/services-networking/dns-pod-service/
    type: документация
---

# StatefulSet и DaemonSet

## Почему Deployment не подходит для баз данных

Поды Deployment **взаимозаменяемы**: случайные имена (`web-7d9f-x2kq`), общий шаблон, при пересоздании — новое имя и, возможно, другая нода. Для PostgreSQL, Kafka, Elasticsearch, Redis-кластера это не годится: у каждого экземпляра **своя роль** (лидер, реплика), **свои данные** и узлы должны находить друг друга по постоянным адресам.

## StatefulSet

```yaml
apiVersion: v1
kind: Service
metadata:
  name: pg
spec:
  clusterIP: None
  selector:
    app: pg
  ports:
    - port: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: pg
spec:
  serviceName: pg
  replicas: 3
  selector:
    matchLabels:
      app: pg
  template:
    metadata:
      labels:
        app: pg
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

Что гарантирует StatefulSet:

| Свойство | Как выглядит |
| --- | --- |
| **Стабильные имена** | `pg-0`, `pg-1`, `pg-2` — имя сохраняется при пересоздании |
| **Стабильный DNS** | Через **headless Service** (`clusterIP: None`): `pg-0.pg.default.svc.cluster.local` |
| **Свой том у каждого** | `volumeClaimTemplates` создаёт PVC `data-pg-0`, `data-pg-1`… Пересозданный `pg-1` подключится к **своему** `data-pg-1` |
| **Порядок** | Запуск по очереди 0 → 1 → 2 (следующий — когда предыдущий Ready), удаление в обратном порядке. `podManagementPolicy: Parallel` отключает порядок |
| **Обновление** | RollingUpdate от старшего номера к младшему; `partition` — обновить только поды с номером ≥ N (канареечно) |

Важно:

- При удалении StatefulSet или уменьшении `replicas` **PVC не удаляются** — данные сохраняются (поведение настраивается `persistentVolumeClaimRetentionPolicy`).
- StatefulSet даёт идентичность и диски, но **не настраивает репликацию** — её делает само приложение или **оператор** (CloudNativePG, Zalando Postgres Operator, Strimzi для Kafka).
- Многие команды держат базы **вне** Kubernetes (managed-БД в облаке или отдельные ВМ) — это проще в эксплуатации.

## DaemonSet

**DaemonSet** запускает **по одному поду на каждой ноде** (или на нодах, выбранных `nodeSelector`/affinity). Появилась новая нода — на ней автоматически появится под; нода удалена — под удалён.

Типичные задачи — агенты уровня ноды:

- сбор логов: Fluent Bit, Vector, Promtail;
- метрики ноды: **node-exporter**;
- сеть: CNI-плагины (Calico, Cilium), kube-proxy;
- хранилище: CSI-драйверы.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      hostNetwork: true
      hostPID: true
      tolerations:
        - operator: Exists
      containers:
        - name: node-exporter
          image: quay.io/prometheus/node-exporter:v1.8.2
          args: ["--path.rootfs=/host"]
          volumeMounts:
            - name: root
              mountPath: /host
              readOnly: true
  volumes:
    - name: root
      hostPath:
        path: /
```

- `tolerations: [operator: Exists]` — чтобы агент работал и на нодах с taints (включая control plane).
- У DaemonSet нет `replicas`: число подов = число подходящих нод. HPA к нему не применяется.
- Обновление: RollingUpdate (по умолчанию `maxUnavailable: 1`) или OnDelete.

## Сравнение

| | Deployment | StatefulSet | DaemonSet |
| --- | --- | --- | --- |
| Для чего | Stateless-приложения | Приложения с состоянием | Агент на каждой ноде |
| Имена подов | Случайные | `имя-0`, `имя-1`… | Случайные, по одному на ноду |
| Тома | Общий шаблон (обычно без PVC или общий RWX) | Свой PVC на каждый под | Обычно hostPath |
| Число подов | `replicas` | `replicas` | По числу нод |
| Порядок запуска | Любой, параллельно | Строго по порядку | — |
| Примеры | API, фронтенд, воркеры | PostgreSQL, Kafka, ZooKeeper, Elasticsearch | node-exporter, Fluent Bit, CNI |

## Практика

- [ ] Развернуть StatefulSet из 3 подов с headless Service и посмотреть порядок создания `kubectl get pods -w`
- [ ] Проверить DNS-имена подов из одноразового пода busybox: `nslookup pg-0.pg`
- [ ] Записать данные в `pg-1`, удалить под и убедиться, что новый `pg-1` подключился к тому же PVC с данными
- [ ] Уменьшить replicas до 1 и убедиться, что PVC остались
- [ ] Развернуть node-exporter как DaemonSet и убедиться, что под есть на каждой ноде (`-o wide`)
- [ ] Добавить ноду в кластер kind (или пересоздать с большим числом worker) и увидеть автоматический новый под DaemonSet

## Лаборатория

Кластер — k3s на стенде (один узел). Тома выдаёт StorageClass по умолчанию `local-path`.

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

### Агент на каждом узле

Создайте в namespace **`lab-ds`** DaemonSet **`node-agent`** (образ `busybox:1.36`, команда — бесконечный сон, метка `app=node-agent`), который запускает **по одному поду на каждом узле**, **включая узлы управления** (control-plane), — для этого поду нужна соответствующая toleration. Подключите в под каталог узла **`/var/log`** только на чтение (`hostPath`) в `/host/var/log`.

```bash setup
lab_kns lab-ds
```

```bash check
ds=$(lab_kj -n lab-ds get ds node-agent) || fail "DaemonSet node-agent нет"
echo "$ds" | jq -e '.spec.template.spec.tolerations[]? | select(.key == "node-role.kubernetes.io/control-plane" or (.operator == "Exists" and (.key == null)))' >/dev/null || fail "У подов нет toleration для узлов control-plane"
echo "$ds" | jq -e '.spec.template.spec.volumes[]? | select(.hostPath.path == "/var/log")' >/dev/null || fail "Каталог узла /var/log не подключён через hostPath"
echo "$ds" | jq -e '.spec.template.spec.containers[0].volumeMounts[]? | select(.mountPath == "/host/var/log" and .readOnly == true)' >/dev/null || fail "/var/log узла должен быть подключён в /host/var/log только на чтение"
kubectl -n lab-ds rollout status ds/node-agent --timeout=90s >/dev/null 2>&1 || fail "DaemonSet не раскатился"
s=$(lab_kj -n lab-ds get ds node-agent | jq -r '"\(.status.desiredNumberScheduled) \(.status.numberReady)"')
[ "${s% *}" = "${s#* }" ] && [ "${s% *}" -ge 1 ] || fail "Готово подов: ${s#* } из ${s% *}"
pod=$(kubectl -n lab-ds get pods -l app=node-agent -o name | head -1)
kubectl -n lab-ds exec $pod -- ls /host/var/log >/dev/null 2>&1 || fail "В поде не видно /host/var/log"
ok "node-agent: $s (по поду на узел)"
```

```text hint
1. DaemonSet похож на Deployment, но без числа реплик: подов столько, сколько узлов.
2. На узлах control-plane стоит taint; чтобы под туда попал, у него должна быть toleration с этим ключом и эффектом NoSchedule.
3. Том типа hostPath указывает путь на узле; в контейнере — точка монтирования с флагом «только чтение».
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/node-agent.yaml <<'EOF'
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-agent
  namespace: lab-ds
spec:
  selector:
    matchLabels:
      app: node-agent
  template:
    metadata:
      labels:
        app: node-agent
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: agent
          image: busybox:1.36
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: varlog
              mountPath: /host/var/log
              readOnly: true
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
EOF
kubectl apply -f ~/k8s/node-agent.yaml
kubectl -n lab-ds rollout status ds/node-agent
```

```text review
Эталон — в «Решении».

- DaemonSet — для того, что должно быть на **каждом** узле: сборщики логов (Fluent Bit, Promtail), node-exporter, CNI, kube-proxy, CSI-драйверы.
- Taint `node-role.kubernetes.io/control-plane:NoSchedule` есть на мастерах в kubeadm-кластерах; в k3s его нет, но toleration нужна, чтобы манифест работал в любом кластере.
- `hostPath` даёт поду доступ к файлам узла — мощно и опасно: только на чтение и только для системных агентов. Pod Security Standards (`restricted`) запрещают hostPath.
```

### База с постоянными томами

Создайте в namespace **`lab-sts`** StatefulSet **`db`** из **2 реплик** (образ `busybox:1.36`, команда — сон, метка `app=db`):

- с **headless**-сервисом **`db`** (без ClusterIP) для стабильных DNS-имён подов;
- у **каждой** реплики свой том через `volumeClaimTemplates` — **`data`** на **64Mi**, подключён в `/data`.

Поды должны получить имена `db-0` и `db-1`, а тома — `data-db-0` и `data-db-1`.

```bash setup
lab_kns lab-sts
```

```bash check
s=$(lab_kj -n lab-sts get sts db) || fail "StatefulSet db нет"
[ "$(echo "$s" | jq -r .spec.replicas)" = 2 ] || fail "Реплик не 2"
[ "$(echo "$s" | jq -r .spec.serviceName)" = db ] || fail "StatefulSet не ссылается на сервис db (serviceName)"
[ "$(lab_kj -n lab-sts get svc db | jq -r .spec.clusterIP)" = None ] || fail "Сервис db не headless (clusterIP: None)"
echo "$s" | jq -e '.spec.volumeClaimTemplates[] | select(.metadata.name == "data" and .spec.resources.requests.storage == "64Mi")' >/dev/null || fail "Нет volumeClaimTemplates data на 64Mi"
kubectl -n lab-sts rollout status sts/db --timeout=120s >/dev/null 2>&1 || fail "StatefulSet не раскатился"
for n in 0 1; do
  [ "$(kubectl -n lab-sts get pvc data-db-$n -o jsonpath='{.status.phase}' 2>/dev/null)" = Bound ] || fail "Том data-db-$n не создан или не привязан"
  kubectl -n lab-sts exec db-$n -- sh -c 'mount | grep -q " /data "' || fail "В db-$n том не подключён в /data"
done
ok "db-0, db-1 с томами data-db-0, data-db-1"
```

```text hint
1. Сервис без кластерного IP — у него в спецификации clusterIP задан как None; селектор — метка подов.
2. StatefulSet ссылается на этот сервис по имени, а тома описывает шаблоном заявок на том: имя, режим доступа «чтение-запись одним узлом», размер.
3. В контейнере — точка монтирования с именем шаблона.
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/db.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: db
  namespace: lab-sts
spec:
  clusterIP: None
  selector:
    app: db
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
  namespace: lab-sts
spec:
  serviceName: db
  replicas: 2
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: db
          image: busybox:1.36
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 64Mi
EOF
kubectl apply -f ~/k8s/db.yaml
kubectl -n lab-sts rollout status sts/db
kubectl -n lab-sts get pods,pvc
```

```text review
Эталон — в «Решении».

- StatefulSet даёт подам **стабильные имена** (`db-0`, `db-1`), DNS (`db-0.db.lab-sts.svc.cluster.local`), порядок запуска (сначала 0, потом 1) и **свой том** каждой реплике. Под `db-0` после пересоздания получит тот же том `data-db-0`.
- Удаление StatefulSet **не удаляет** PVC — данные защищены от случайности (и их надо чистить вручную).
- Базы в Kubernetes обычно ставят **операторами** (CloudNativePG, Zalando Postgres Operator, Strimzi для Kafka): они умеют репликацию, бэкапы и переключение — сам StatefulSet этого не делает.
```

## Тест

### Чем StatefulSet отличается от Deployment?
- [x] У подов стабильные имена с порядковым номером (pg-0, pg-1)
- [x] У каждого пода свой PersistentVolumeClaim, который сохраняется при пересоздании пода
- [x] Поды создаются и удаляются в строгом порядке
- [ ] StatefulSet не поддерживает обновления
> Deployment считает поды взаимозаменяемыми.

### Зачем StatefulSet нужен headless Service (clusterIP: None)?
- [ ] Для балансировки трафика
- [x] Чтобы у каждого пода было стабильное DNS-имя вида pg-0.pg.namespace.svc.cluster.local
- [ ] Чтобы открыть доступ извне
- [ ] Для хранения данных
> Обычный Service выдаёт один виртуальный IP для всех подов.

### Что создаёт volumeClaimTemplates в StatefulSet?
- [ ] Один общий том для всех подов
- [x] Отдельный PVC для каждого пода, например data-pg-0, data-pg-1
- [ ] Временный emptyDir
- [ ] StorageClass
> Пересозданный под подключается к своему PVC.

### Что происходит с PVC при уменьшении replicas StatefulSet с 3 до 1?
- [ ] PVC удаляются вместе с подами
- [x] По умолчанию PVC сохраняются, данные не теряются
- [ ] PVC переносятся на оставшийся под
- [ ] Kubernetes выдаёт ошибку
> Поведение можно изменить через persistentVolumeClaimRetentionPolicy.

### Настраивает ли StatefulSet репликацию данных между экземплярами PostgreSQL?
- [ ] Да, автоматически
- [x] Нет: он даёт стабильную идентичность и диски, а репликацию настраивает само приложение или оператор
- [ ] Да, если replicas больше 1
- [ ] Только в облаке
> Например, CloudNativePG или Zalando Postgres Operator.

### Для чего используют DaemonSet?
- [x] Чтобы запустить по одному поду на каждой ноде (или на выбранных нодах)
- [x] Для агентов логов, метрик ноды, сетевых и CSI-плагинов
- [ ] Для масштабирования веб-приложений через HPA
- [ ] Для баз данных
> Пример — node-exporter или Fluent Bit.

### Что произойдёт при добавлении новой ноды в кластер с DaemonSet?
- [ ] Ничего, нужно вручную увеличить replicas
- [x] На новой ноде автоматически запустится под DaemonSet
- [ ] Все поды DaemonSet пересоздадутся
- [ ] DaemonSet удалится
> У DaemonSet нет поля replicas.

### Зачем DaemonSet агента логов добавляют tolerations с operator: Exists?
- [ ] Чтобы ускорить запуск
- [x] Чтобы под работал и на нодах с taints, включая control plane
- [ ] Чтобы под не удалялся
- [ ] Чтобы получить доступ к сети хоста
> Без этого на «закрытых» нодах логи не собирались бы.

### В каком порядке StatefulSet запускает поды по умолчанию?
- [ ] Все одновременно
- [x] По очереди: pg-0, затем pg-1 после готовности pg-0, затем pg-2
- [ ] В обратном порядке
- [ ] Случайно
> Параллельный запуск — podManagementPolicy: Parallel.

### Какой ресурс выбрать для фронтенд-приложения без состояния с 5 репликами?
= Deployment
> StatefulSet для него избыточен.

### Что делает параметр partition в стратегии обновления StatefulSet?
- [ ] Делит тома на разделы
- [x] Обновляет только поды с порядковым номером не меньше указанного — удобно для постепенной выкатки
- [ ] Задаёт число реплик
- [ ] Распределяет поды по зонам
> Например, partition: 2 обновит только pg-2.
