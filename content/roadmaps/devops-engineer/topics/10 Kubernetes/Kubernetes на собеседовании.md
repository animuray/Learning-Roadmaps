---
title: Kubernetes на собеседовании
slug: kubernetes-na-sobesedovanii
description: Самые частые вопросы по Kubernetes на собеседованиях DevOps — архитектура, Deployment, StatefulSet и DaemonSet, типы Service, Ingress и контроллер, пробы, ресурсы, HPA, affinity и taints, RBAC, хранилище и разбор поломок.
duration: 90
level: Средний
quizSize: 12
materials:
  - title: Kubernetes Docs — Concepts
    url: https://kubernetes.io/docs/concepts
    type: документация
  - title: Kubernetes Docs — Kubernetes Components
    url: https://kubernetes.io/docs/concepts/overview/components/
    type: документация
  - title: Kubernetes Docs — Services, Load Balancing, and Networking
    url: https://kubernetes.io/docs/concepts/services-networking/_print/
    type: документация
  - title: Kubernetes Docs — kubectl Quick Reference
    url: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
    type: документация
---

# Kubernetes на собеседовании

Самая большая тема собеседований. Ниже — короткие ответы; подробности — в темах раздела.

## Архитектура

**Из чего состоит кластер?** Control plane: kube-apiserver (вход, единственный работает с etcd), etcd (состояние), scheduler (выбор ноды), controller-manager (контроллеры), cloud-controller-manager. Ноды: kubelet (запуск подов, пробы), container runtime (containerd/CRI-O), kube-proxy (Service). Аддоны: CoreDNS, CNI, metrics-server.

**Что происходит при `kubectl apply` Deployment?** API server → etcd → контроллер Deployment создаёт ReplicaSet → ReplicaSet создаёт поды → scheduler назначает ноды → kubelet через CRI запускает контейнеры, CNI выдаёт IP → readiness → под попадает в EndpointSlice сервиса.

**Почему минимальная единица — под, а не контейнер?** Под — «логический хост» для тесно связанных контейнеров: общая сеть (IP, localhost), тома, время жизни, планирование вместе. Позволяет sidecar и init-контейнеры, не нарушая «один процесс — один контейнер».

## Рабочие нагрузки

**Deployment vs StatefulSet vs DaemonSet.** Deployment — stateless, взаимозаменяемые поды, rolling update. StatefulSet — стабильные имена (`db-0`), стабильный DNS через headless Service, свой PVC на под, упорядоченный запуск. DaemonSet — по поду на каждую ноду (логи, метрики, CNI).

**Rolling update и откат.** Новый ReplicaSet, `maxSurge`/`maxUnavailable`, readiness решает, когда двигаться дальше. Откат — `kubectl rollout undo` (или revert в Git при GitOps).

**Job и CronJob.** Задачи до завершения; `backoffLimit`, `concurrencyPolicy`.

## Сеть

**Типы Service.** ClusterIP (внутри кластера), NodePort (порт на каждой ноде), LoadBalancer (облачный балансировщик), ExternalName (CNAME), headless (`clusterIP: None`, DNS отдаёт IP подов).

**Ingress vs Ingress Controller.** Ingress — объект с правилами L7 (хосты, пути, TLS). Controller — программа, которая их исполняет (Traefik, HAProxy, Envoy и др.). Без контроллера Ingress ничего не делает. ingress-nginx объявлен устаревшим (поддержка закончилась в марте 2026), будущее — Gateway API.

**Как под находит сервис?** CoreDNS: `svc.namespace.svc.cluster.local`, search-домены в resolv.conf. kube-proxy (iptables/IPVS/nftables) или eBPF-CNI переводит ClusterIP в IP подов.

**NetworkPolicy.** По умолчанию всё разрешено; политика выбирает поды по меткам, разрешения складываются; применяет CNI (Calico, Cilium).

## Ресурсы, пробы, масштабирование

**requests vs limits.** requests — для планирования и гарантий, limits — потолок: CPU → троттлинг, память → OOMKilled. QoS: Guaranteed, Burstable, BestEffort.

**Liveness vs readiness vs startup.** Liveness → перезапуск контейнера. Readiness → убрать из Service, без перезапуска. Startup → дать время на старт, блокирует остальные пробы.

**HPA.** Меняет число реплик по метрикам (metrics-server, CPU относительно requests), `desired = ceil(current × metric/target)`, стабилизация при уменьшении. VPA — ресурсы подов, Cluster Autoscaler — ноды, KEDA — по событиям.

## Планирование

**Affinity и anti-affinity.** Node affinity — притянуть к нодам по меткам (жёстко или мягко). Pod affinity — рядом с подами; anti-affinity — подальше (реплики на разные ноды/зоны). topologySpreadConstraints — равномерно.

**Taints и tolerations.** Taint на ноде отталкивает поды; toleration разрешает (но не притягивает). Эффекты NoSchedule, PreferNoSchedule, NoExecute. Выделенные ноды — taint + toleration + affinity.

## Хранилище и конфигурация

**PV, PVC, StorageClass.** PVC — заявка, PV — реальный том, StorageClass — динамическое создание через CSI. Режимы RWO, ROX, RWX, RWOP. reclaimPolicy Delete/Retain.

**ConfigMap и Secret.** Конфигурация вне образа; Secret — base64, не шифрование; RBAC, шифрование etcd, External Secrets/Sealed Secrets. Переменные окружения не обновляются без перезапуска, файлы — обновляются.

## Безопасность

**RBAC.** Role/ClusterRole + RoleBinding/ClusterRoleBinding, субъекты — User, Group, ServiceAccount; только разрешающие правила; наименьшие привилегии. Pod Security Admission, NetworkPolicy, неизменяемые теги, сканирование образов.

## Разбор поломок

| Статус | Первая гипотеза | Команда |
| --- | --- | --- |
| `Pending` | Нет ресурсов, taints/affinity, PVC не привязан | `kubectl describe pod` (Events) |
| `ImagePullBackOff` | Тег, имя реестра, imagePullSecrets | `describe pod` |
| `CrashLoopBackOff` | Приложение падает: конфиг, переменные, команда, liveness | `kubectl logs --previous` |
| `OOMKilled` | Мало памяти в limits или утечка | `describe pod` → Last State |
| `Running`, но не Ready | Readiness не проходит | `describe pod`, логи |
| Сервис не отвечает | Селектор, пустой EndpointSlice, targetPort, DNS, NetworkPolicy | `kubectl get endpointslices` |
| Нода `NotReady` | kubelet, runtime, диск, сеть, сертификаты | `journalctl -u kubelet` |
| `Evicted` | Давление по памяти/диску на ноде | `describe node` |

## Практика

- [ ] Ответить вслух на каждый вопрос из разделов выше за 1–2 минуты
- [ ] Нарисовать по памяти архитектуру кластера и путь запроса пользователя через Ingress, Service и под
- [ ] Воспроизвести на kind все статусы из таблицы разбора поломок и починить их
- [ ] Объяснить на своём проекте, почему выбран Deployment или StatefulSet, какие пробы и ресурсы заданы и почему

## Тест

### Какой компонент выбирает ноду для нового пода?
- [ ] kubelet
- [x] kube-scheduler
- [ ] kube-proxy
- [ ] etcd
> kubelet затем запускает под на выбранной ноде.

### Почему минимальная единица Kubernetes — под, а не контейнер?
- [x] Под объединяет тесно связанные контейнеры с общей сетью, томами и временем жизни
- [x] Под — единица планирования, масштабирования и сетевой адресации
- [ ] Контейнеры нельзя запускать без Docker
- [ ] Поды занимают меньше памяти
> Так работают sidecar и init-контейнеры.

### Когда выбрать StatefulSet вместо Deployment?
- [ ] Для любого веб-приложения
- [x] Когда экземплярам нужны стабильные имена и DNS, свои постоянные тома и упорядоченный запуск — например, для баз данных и брокеров
- [ ] Когда нужно больше 10 реплик
- [ ] Когда нужен HPA
> Deployment — для взаимозаменяемых stateless-подов.

### Для чего используется DaemonSet?
- [ ] Для баз данных
- [x] Чтобы запустить по одному поду на каждой ноде — агенты логов, метрик, сетевые плагины
- [ ] Для разовых задач
- [ ] Для балансировки трафика
> Новая нода автоматически получает под DaemonSet.

### Чем отличаются типы Service ClusterIP, NodePort и LoadBalancer?
- [x] ClusterIP доступен только внутри кластера
- [x] NodePort открывает порт на каждой ноде
- [x] LoadBalancer создаёт внешний облачный балансировщик
- [ ] ClusterIP доступен из интернета
> Ещё есть ExternalName и headless.

### Чем Ingress отличается от Ingress Controller?
- [ ] Ничем
- [x] Ingress — объект с правилами маршрутизации, Ingress Controller — программа, которая эти правила исполняет
- [ ] Ingress Controller — тип Service
- [ ] Ingress работает без контроллера
> Пример контроллеров — Traefik, HAProxy, Envoy Gateway.

### Чем readiness-проба отличается от liveness?
- [ ] Ничем
- [x] Провал readiness убирает под из балансировки без перезапуска, провал liveness перезапускает контейнер
- [ ] Readiness перезапускает под
- [ ] Liveness управляет трафиком
> Startup-проба защищает медленный старт.

### Что произойдёт с контейнером, превысившим limits по памяти, и по CPU?
- [x] По памяти — OOMKilled и перезапуск
- [x] По CPU — троттлинг без убийства
- [ ] По CPU — OOMKilled
- [ ] Ничего в обоих случаях
> requests при этом влияют на планирование.

### HPA не масштабирует и показывает unknown. Что проверить в первую очередь?
- [x] Установлен ли и работает ли metrics-server
- [x] Заданы ли requests по CPU у контейнеров
- [ ] Версию Helm
- [ ] Число namespaces
> Утилизация считается в процентах от requests.

### Чем affinity отличается от taints?
- [ ] Это одно и то же
- [x] Affinity притягивает поды к нодам или другим подам, taint на ноде отталкивает поды без соответствующей toleration
- [ ] Taints задаются на поды
- [ ] Affinity выселяет поды
> Anti-affinity разносит поды по разным нодам и зонам.

### Под в статусе CrashLoopBackOff. Ваши действия?
- [ ] Удалить кластер
- [x] Посмотреть kubectl logs --previous и kubectl describe pod: причину падения, код выхода, события, liveness
- [ ] Увеличить replicas
- [ ] Поменять Service
> Частые причины — ошибка конфигурации, отсутствующая переменная, неверная команда, слишком строгая liveness.

### Сервис не отвечает, поды Running. Что проверить?
- [x] Совпадает ли selector сервиса с метками подов и есть ли адреса в EndpointSlice
- [x] Готовы ли поды (readiness) и правильный ли targetPort
- [x] DNS-имя и NetworkPolicy
- [ ] Версию kubectl
> Пустой EndpointSlice — самая частая причина.

### Что такое PVC и StorageClass?
- [x] PVC — заявка приложения на хранилище: размер, режим доступа
- [x] StorageClass описывает тип хранилища и позволяет создавать тома автоматически
- [ ] StorageClass — это диск на ноде
- [ ] PVC — это реальный диск
> Реальный том — PersistentVolume.

### Безопасно ли хранить пароли в Secret без дополнительных мер?
- [ ] Да, они зашифрованы
- [x] Нет: значения лишь закодированы base64; нужны RBAC, шифрование etcd и внешнее хранилище или шифрование секретов в Git
- [ ] Да, если namespace отдельный
- [ ] Да, если использовать stringData
> Любой с правом get secrets прочитает пароль.

### Как выдать CI доступ к деплою только в один namespace?
- [ ] Выдать cluster-admin
- [x] ServiceAccount + Role с нужными правами + RoleBinding в этом namespace
- [ ] Дать kubeconfig администратора
- [ ] Открыть API без аутентификации
> Принцип наименьших привилегий.
