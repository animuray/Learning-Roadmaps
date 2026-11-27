---
title: Архитектура Kubernetes
slug: arhitektura-kubernetes
description: Control plane — kube-apiserver, etcd, kube-scheduler, kube-controller-manager, cloud-controller-manager; worker-ноды — kubelet, container runtime, kube-proxy; аддоны и путь kubectl apply до запущенного контейнера.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: Kubernetes Docs — Cluster Architecture
    url: https://www.kubernetes.io/docs/concepts/architecture/
    type: документация
  - title: Kubernetes Docs — Kubernetes Components
    url: https://kubernetes.io/docs/concepts/overview/components/
    type: документация
  - title: Kubernetes Docs — Operating etcd clusters for Kubernetes
    url: https://www.kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/
    type: документация
---

# Архитектура Kubernetes

Кластер = **control plane** (мозг) + **worker-ноды** (где работают поды).

```
                         CONTROL PLANE
 ┌───────────────────────────────────────────────────────────┐
 │  kube-apiserver ◄──► etcd (всё состояние кластера)         │
 │       ▲   ▲   ▲                                            │
 │       │   │   └── kube-controller-manager (контроллеры)    │
 │       │   └────── kube-scheduler (куда поставить под)      │
 │       └────────── cloud-controller-manager (облако)        │
 └───────┼───────────────────────────────────────────────────┘
         │ HTTPS (только через API server!)
 ┌───────┴──────────────┐      ┌──────────────────────┐
 │ Worker node 1         │      │ Worker node 2         │
 │ kubelet               │      │ kubelet               │
 │ container runtime     │      │ container runtime     │
 │ (containerd / CRI-O)  │      │ kube-proxy            │
 │ kube-proxy            │      │ [pod] [pod] [pod]     │
 │ [pod] [pod]           │      └──────────────────────┘
 └──────────────────────┘
```

## Control plane

| Компонент | Что делает |
| --- | --- |
| **kube-apiserver** | Вход в кластер: REST API, аутентификация, авторизация (RBAC), admission-проверки, валидация. **Единственный**, кто общается с etcd. Все остальные компоненты и kubectl работают через него. Масштабируется горизонтально |
| **etcd** | Распределённое key-value хранилище (алгоритм Raft) со **всем состоянием кластера**: объекты, конфиги, секреты. Потеря etcd без бэкапа = потеря кластера. Нечётное число узлов (3, 5) для кворума |
| **kube-scheduler** | Находит поды без ноды и выбирает подходящую: хватает ли ресурсов (requests), nodeSelector, affinity, taints, топология. Сам под не запускает — только записывает решение |
| **kube-controller-manager** | Набор контроллеров: Deployment, ReplicaSet, Node (следит за живостью нод), Job, EndpointSlice, ServiceAccount и др. Каждый — цикл согласования |
| **cloud-controller-manager** | Интеграция с облаком: создаёт балансировщики для Service типа LoadBalancer, маршруты, узнаёт об удалённых ВМ. Нет в локальных и bare-metal кластерах |

## Worker-нода

| Компонент | Что делает |
| --- | --- |
| **kubelet** | Агент на каждой ноде: получает из API поды, назначенные этой ноде, и через CRI просит runtime их запустить; выполняет пробы; монтирует тома; отчитывается о статусе подов и ноды |
| **Container runtime** | Запускает контейнеры: **containerd** или **CRI-O** через интерфейс **CRI**. Docker Engine напрямую больше не поддерживается (dockershim удалён), но Docker-образы работают — это OCI-образы |
| **kube-proxy** | Реализует Service: программирует iptables/IPVS/nftables, чтобы трафик на ClusterIP попадал на поды. Некоторые CNI (например, Cilium на eBPF) заменяют kube-proxy |

## Аддоны

- **CoreDNS** — DNS кластера: `my-svc.my-namespace.svc.cluster.local`;
- **CNI-плагин** (Calico, Cilium, Flannel) — сеть подов;
- **metrics-server** — метрики CPU/памяти для `kubectl top` и HPA;
- Ingress/Gateway-контроллер, CSI-драйверы хранилища, Dashboard.

## Что происходит при kubectl apply -f deployment.yaml

1. **kubectl** отправляет объект Deployment в **API server** (HTTPS, с токеном или сертификатом из kubeconfig).
2. API server проверяет права, валидирует, прогоняет admission-контроллеры и **записывает в etcd**.
3. **Контроллер Deployment** (в controller-manager) видит новый Deployment и создаёт **ReplicaSet**.
4. **Контроллер ReplicaSet** видит, что подов 0 из 3, и создаёт 3 объекта **Pod** (пока без ноды).
5. **Scheduler** видит поды без `nodeName`, выбирает ноды и записывает решение.
6. **kubelet** на выбранной ноде видит назначенный под, через CRI просит **containerd** скачать образ и запустить контейнеры; CNI выдаёт поду IP.
7. kubelet выполняет пробы и обновляет **status** пода. Когда под Ready — **EndpointSlice** обновляется, и Service начинает слать на него трафик.

Все компоненты общаются **через API server** по модели watch: подписываются на изменения и реагируют.

## Отказоустойчивость

- Control plane в продакшене — **3 ноды** (etcd с кворумом 2 из 3), API server за балансировщиком.
- Упал control plane — работающие поды продолжают работать, но изменения и самовосстановление не происходят.
- Упала worker-нода — через несколько минут Node controller пометит её NotReady, поды контроллеров пересоздадутся на других нодах.
- **Бэкап etcd** — обязателен (`etcdctl snapshot save`).

Control plane в kubeadm-кластерах запускается как **static pods** (манифесты в `/etc/kubernetes/manifests`), в managed-облаках он скрыт от вас.

## Практика

- [ ] В локальном кластере посмотреть компоненты: `kubectl get pods -n kube-system -o wide`
- [ ] Посмотреть ноды и их роли: `kubectl get nodes -o wide`, `kubectl describe node имя`
- [ ] Найти static pod манифесты control plane внутри ноды kind: `docker exec -it kind-control-plane ls /etc/kubernetes/manifests`
- [ ] Создать Deployment и проследить цепочку событий: `kubectl get events --sort-by=.metadata.creationTimestamp`
- [ ] Остановить kubelet на worker-ноде (или контейнер ноды в kind) и посмотреть, как нода станет NotReady и что произойдёт с подами

## Тест

### Какой компонент — единственный, кто напрямую работает с etcd?
= kube-apiserver
= api server
= apiserver
> Все остальные компоненты и клиенты общаются через API server.

### Что хранится в etcd?
- [ ] Логи контейнеров
- [x] Всё состояние кластера: объекты, их spec и status, конфиги и секреты
- [ ] Образы контейнеров
- [ ] Метрики Prometheus
> Поэтому бэкап etcd критически важен.

### Что делает kube-scheduler?
- [ ] Запускает контейнеры на нодах
- [x] Выбирает для каждого нового пода подходящую ноду с учётом ресурсов и правил размещения
- [ ] Перезапускает упавшие поды
- [ ] Балансирует трафик между подами
> Запуск выполняет kubelet на выбранной ноде.

### Какой компонент на ноде запускает поды и выполняет пробы?
= kubelet
> Он получает назначенные ноде поды из API и через CRI управляет runtime.

### За что отвечает kube-proxy?
- [ ] За DNS кластера
- [x] За реализацию Service: правила iptables, IPVS или nftables, направляющие трафик с ClusterIP на поды
- [ ] За выдачу IP-адресов подам
- [ ] За проксирование kubectl
> IP подам выдаёт CNI-плагин.

### Где работают контроллеры Deployment, ReplicaSet и Node?
- [ ] В kubelet
- [x] В kube-controller-manager
- [ ] В etcd
- [ ] В kube-proxy
> Каждый контроллер — отдельный цикл согласования.

### Какие runtime использует современный Kubernetes через интерфейс CRI?
- [x] containerd
- [x] CRI-O
- [ ] Docker Engine напрямую через dockershim
- [ ] VirtualBox
> dockershim удалён, но образы, собранные Docker, работают без изменений.

### Почему etcd ставят на 3 или 5 узлов, а не на 2 или 4?
- [ ] Так быстрее
- [x] Для кворума нужно большинство узлов; при нечётном числе узлов отказоустойчивость выше за ту же цену
- [ ] etcd не работает на чётном числе узлов
- [ ] Так требует kubelet
> 3 узла переживают отказ одного, 5 — двух.

### Что произойдёт с работающими подами, если control plane станет недоступен?
- [ ] Все поды сразу остановятся
- [x] Поды продолжат работать, но изменения, планирование и самовосстановление перестанут выполняться
- [ ] Поды переедут на другие ноды
- [ ] Кластер удалит все объекты
> kubelet продолжает поддерживать уже запущенные контейнеры.

### Для чего нужен cloud-controller-manager?
- [ ] Для запуска подов в облаке
- [x] Для интеграции с API облака: создание балансировщиков для Service типа LoadBalancer, маршрутов, отслеживание ВМ
- [ ] Для хранения состояния кластера
- [ ] Для DNS
> В локальных кластерах его нет.

### В каком порядке идут события после kubectl apply Deployment?
- [ ] kubelet → scheduler → API server → etcd
- [x] API server и etcd → контроллер Deployment создаёт ReplicaSet → ReplicaSet создаёт поды → scheduler назначает ноды → kubelet запускает контейнеры
- [ ] scheduler → etcd → kubectl
- [ ] ReplicaSet → Deployment → API server
> Все компоненты взаимодействуют через API server.

### Как в kubeadm-кластере запускаются компоненты control plane?
- [ ] Как обычный Deployment
- [x] Как static pods: kubelet запускает их по манифестам из /etc/kubernetes/manifests
- [ ] Только как systemd-сервисы без контейнеров
- [ ] Через Docker Compose
> В managed-облаках control plane вообще скрыт от пользователя.
