---
title: Продвинутый Kubernetes
slug: prodvinutyj-kubernetes
description: Обзор продвинутых тем — CRD и операторы, admission и политики (Pod Security, Kyverno), Service Mesh, бэкап и восстановление etcd, multi-cluster и Cluster API, траблшутинг кластера и нод.
duration: 120
level: Продвинутый
quizSize: 10
optional: true
materials:
  - title: Kubernetes Docs — Operating etcd clusters for Kubernetes
    url: https://www.kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/
    type: документация
  - title: Kubernetes Docs — Concepts (Extending Kubernetes, Security, Policies)
    url: https://kubernetes.io/docs/concepts
    type: документация
  - title: Kubernetes Docs — Debug Running Pods
    url: https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/
    type: документация
---

# Продвинутый Kubernetes

Темы, которые обычно не нужны на первой работе, но отличают сильного инженера. Цель — понимать, **что это и зачем**, и знать, куда копать.

## CRD и операторы

**CustomResourceDefinition (CRD)** добавляет в API свой тип объекта: `PostgresCluster`, `Certificate`, `KafkaTopic`, `Application`. После этого им можно управлять через kubectl, как Deployment.

**Оператор** = CRD + **контроллер**, который знает, как эксплуатировать конкретную систему: создать кластер базы, настроить репликацию, сделать бэкап, переключить лидера, обновить версию. Это «опыт администратора, записанный в коде» и тот же цикл согласования, что у встроенных контроллеров.

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: app-db
spec:
  instances: 3
  storage:
    size: 20Gi
  backup:
    barmanObjectStore:
      destinationPath: s3://backups/app-db
```

Примеры: **CloudNativePG** (PostgreSQL), Strimzi (Kafka), Prometheus Operator (ServiceMonitor, PrometheusRule), cert-manager, Argo CD, External Secrets. Свои операторы пишут на Go (Kubebuilder, Operator SDK) или Python (Kopf).

## Admission и политики

Перед сохранением объекта API server прогоняет его через **admission-контроллеры**: изменить (mutating) или отклонить (validating).

- **Pod Security Admission** — встроенные уровни `privileged`, `baseline`, `restricted` через метки namespace (`pod-security.kubernetes.io/enforce: restricted`): запрет привилегированных контейнеров, hostPath, root.
- **Kyverno**, **OPA Gatekeeper**, встроенные **ValidatingAdmissionPolicy** (на языке CEL) — свои правила: «образы только из нашего реестра», «обязательные requests/limits», «запрет тега latest», «обязательные метки».

## Service Mesh

**Service mesh** (Istio, Linkerd, Cilium Service Mesh) берёт на себя сетевую логику между сервисами:

- **mTLS** между всеми сервисами автоматически — шифрование и идентичность;
- управление трафиком: canary по весам, повторы, таймауты, circuit breaker, зеркалирование;
- наблюдаемость: метрики, трассировка запросов между сервисами без правки кода.

Классическая схема — sidecar-прокси (Envoy) в каждом поде; новые варианты без sidecar — Istio ambient mode, eBPF. Цена — сложность и ресурсы, поэтому mesh внедряют, когда сервисов действительно много.

## Бэкап и восстановление etcd

etcd — всё состояние кластера. В самостоятельных кластерах бэкап — ваша ответственность:

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /backup/etcd-$(date +%F).db

etcdutl snapshot status /backup/etcd-2026-11-27.db
```

- Делайте по расписанию, храните **вне** кластера, шифруйте — там все секреты.
- Восстановление: `etcdutl snapshot restore` в новый каталог данных, затем перенастроить etcd на него (в kubeadm — путь в манифесте static pod) и перезапустить компоненты.
- **Проверяйте восстановление** на тестовом кластере — непроверенный бэкап не бэкап.
- Дополнительно — **Velero** для объектов и томов, и, главное, **GitOps**: если всё описано в Git, кластер можно пересоздать.

## Multi-cluster

Зачем несколько кластеров: изоляция prod/stage, разные регионы и отказоустойчивость, требования к данным, ограничения масштаба одного кластера, разные команды.

Инструменты: **Argo CD** / Flux с несколькими кластерами (один Git — много кластеров), **Cluster API** (кластеры как объекты Kubernetes, создаваемые декларативно), Karmada, Rancher; мультикластерные mesh для связи сервисов.

## Траблшутинг кластера

| Симптом | Куда смотреть |
| --- | --- |
| Нода `NotReady` | `kubectl describe node` (Conditions), на ноде `systemctl status kubelet`, `journalctl -u kubelet`, runtime: `systemctl status containerd`, `crictl ps`, место на диске, сертификаты kubelet |
| kubectl: connection refused / timeout | Работает ли kube-apiserver (`crictl ps` на control plane, логи), балансировщик, сертификаты истекли (`kubeadm certs check-expiration`) |
| API отвечает медленно | etcd: задержки диска (fsync), `etcdctl endpoint health/status`, размер базы, дефрагментация |
| Поды не планируются | Events пода, ресурсы нод, taints, affinity, квоты |
| Поды не получают IP, нет связи | Поды CNI в `kube-system`, логи CNI, MTU, CIDR |
| DNS не работает | Поды и логи CoreDNS, NetworkPolicy к порту 53, `resolv.conf` |
| Поды выселяются (Evicted) | Давление по памяти/диску на ноде, `kubectl describe node`, очистка образов |

```bash
kubectl get --raw='/readyz?verbose'
kubectl get --raw='/livez?verbose'
crictl ps -a
crictl logs <id>
kubectl debug node/worker-1 -it --image=ubuntu
```

`kubectl debug node/...` создаёт привилегированный под с файловой системой ноды в `/host` — способ «зайти» на ноду без SSH.

## Практика

- [ ] Установить оператор CloudNativePG в kind и создать кластер PostgreSQL из 3 экземпляров; удалить под-лидер и посмотреть автоматическое переключение
- [ ] Включить Pod Security Admission `restricted` на namespace и исправить манифест приложения под требования (runAsNonRoot, без привилегий, seccompProfile)
- [ ] Установить Kyverno и написать политику «запрещён тег latest»
- [ ] Сделать снапшот etcd в kubeadm-кластере и восстановить его на тестовой ВМ
- [ ] Остановить kubelet на ноде и диагностировать NotReady по журналу
- [ ] Зайти на ноду через `kubectl debug node/...` и посмотреть контейнеры через `crictl`
- [ ] Прочитать документацию Istio или Linkerd и описать, какие задачи mesh решил бы в вашем проекте

## Тест

### Что такое оператор в Kubernetes?
- [ ] Администратор кластера
- [x] Контроллер вместе с CRD, который автоматизирует эксплуатацию конкретной системы: создание, бэкапы, переключение, обновление
- [ ] Встроенный объект Kubernetes
- [ ] Плагин kubectl
> Пример — CloudNativePG для PostgreSQL.

### Что даёт CustomResourceDefinition?
- [ ] Новый узел кластера
- [x] Новый тип объекта в API Kubernetes, которым можно управлять через kubectl
- [ ] Новый namespace
- [ ] Новый CNI
> Сам CRD без контроллера только хранит объекты.

### Что делает Pod Security Admission в режиме restricted?
- [ ] Шифрует поды
- [x] Не позволяет создавать поды, нарушающие строгий профиль безопасности: привилегированные, от root, с hostPath и т. п.
- [ ] Ограничивает сеть подов
- [ ] Ограничивает ресурсы
> Уровень задаётся меткой на namespace.

### Какие задачи решает service mesh?
- [x] Автоматический mTLS между сервисами
- [x] Управление трафиком: canary, повторы, таймауты
- [x] Наблюдаемость: метрики и трассировка между сервисами
- [ ] Хранение данных сервисов
> Примеры — Istio, Linkerd.

### Какой командой делается снапшот etcd?
= etcdctl snapshot save
= snapshot save
> Нужны сертификаты и endpoint etcd.

### Почему бэкап etcd нужно хранить вне кластера и шифровать?
- [ ] Так требует etcd
- [x] Он нужен, когда кластер недоступен, и содержит все секреты кластера
- [ ] Он слишком большой
- [ ] Чтобы ускорить восстановление
> И регулярно проверяйте восстановление.

### Нода NotReady. С чего начать диагностику на самой ноде?
- [x] Проверить состояние и журнал kubelet: systemctl status kubelet, journalctl -u kubelet
- [x] Проверить container runtime (containerd) и место на диске
- [ ] Перезапустить etcd на всех нодах
- [ ] Удалить все поды
> Также смотрите Conditions в kubectl describe node.

### kubectl перестал подключаться к кластеру kubeadm ровно через год после установки. Вероятная причина?
- [ ] Удалился etcd
- [x] Истекли сертификаты, выпущенные kubeadm
- [ ] Закончилось место на ноутбуке
- [ ] Обновился kubectl
> Проверка — kubeadm certs check-expiration, продление — kubeadm certs renew.

### Как зайти на ноду кластера без SSH?
- [ ] kubectl exec node
- [x] kubectl debug node/имя -it --image=ubuntu — создаётся привилегированный под с файловой системой ноды в /host
- [ ] kubectl ssh
- [ ] Это невозможно
> Удобно в managed-кластерах.

### Что такое Cluster API?
- [ ] REST API kube-apiserver
- [x] Проект для декларативного создания и управления кластерами Kubernetes как объектами Kubernetes
- [ ] API для бэкапа etcd
- [ ] Ingress-контроллер
> Используется в multi-cluster сценариях.

### Какие инструменты позволяют задавать свои политики для объектов, например запрет тега latest?
- [x] Kyverno
- [x] OPA Gatekeeper
- [x] ValidatingAdmissionPolicy на языке CEL
- [ ] CoreDNS
> Политики применяются на этапе admission.

### Почему GitOps упрощает восстановление после потери кластера?
- [ ] Он автоматически бэкапит etcd
- [x] Если всё состояние описано в Git, новый кластер можно привести к нужному виду, применив репозиторий
- [ ] Он хранит данные баз
- [ ] Он не требует нод
> Данные томов всё равно нужно бэкапить отдельно.
