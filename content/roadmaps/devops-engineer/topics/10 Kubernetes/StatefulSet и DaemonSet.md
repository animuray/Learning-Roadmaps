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
