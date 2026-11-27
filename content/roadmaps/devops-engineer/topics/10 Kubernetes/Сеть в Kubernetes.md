---
title: Сеть в Kubernetes
slug: set-v-kubernetes
description: Сетевая модель Kubernetes, CNI-плагины Calico, Cilium и Flannel, путь пакета между подами, kube-proxy и режимы iptables, IPVS, nftables и eBPF, CoreDNS и NetworkPolicy, диагностика сетевых проблем.
duration: 90
level: Продвинутый
quizSize: 10
materials:
  - title: Kubernetes Docs — Services, Load Balancing, and Networking
    url: https://kubernetes.io/docs/concepts/services-networking/_print/
    type: документация
  - title: Kubernetes Docs — Network Policies
    url: https://kubernetes.io/docs/concepts/services-networking/network-policies
    type: документация
  - title: Kubernetes Docs — DNS for Services and Pods
    url: https://www.kubernetes.io/docs/concepts/services-networking/dns-pod-service/
    type: документация
---

# Сеть в Kubernetes

Сеть — самая сложная часть Kubernetes и любимая тема собеседований. Разберём слоями: **поды** → **сервисы** → **DNS** → **политики** → **вход снаружи** (Ingress, прошлая тема).

## Сетевая модель

Kubernetes требует от сети:

1. У каждого пода — **свой IP**, уникальный в кластере.
2. Любой под может обратиться к любому поду на **любой ноде без NAT**.
3. Агенты ноды (kubelet) могут обращаться к подам своей ноды.
4. Контейнеры внутри пода общаются через `localhost`.

Сам Kubernetes эту сеть **не реализует** — это делает **CNI-плагин** (Container Network Interface).

## CNI-плагины

Когда kubelet создаёт под, runtime вызывает CNI-плагин: создать сетевой namespace, пару veth (как в Docker), выдать IP из подсети ноды (IPAM), настроить маршруты.

| Плагин | Особенности |
| --- | --- |
| **Flannel** | Простой overlay (VXLAN), без NetworkPolicy |
| **Calico** | BGP или VXLAN/IPIP, богатые NetworkPolicy, популярен on-prem |
| **Cilium** | eBPF: высокая производительность, политики L3–L7, может полностью заменить kube-proxy, наблюдаемость (Hubble) |
| Облачные (AWS VPC CNI и др.) | Поды получают IP прямо из сети облака |

Как пакет идёт между подами на разных нодах:

- **overlay** (VXLAN/Geneve) — пакет пода инкапсулируется в UDP-пакет между нодами; работает в любой сети, но есть накладные расходы и меньше MTU;
- **маршрутизация** (BGP, облачная сеть) — подсети подов маршрутизируются напрямую, без инкапсуляции.

```
 pod A 10.244.1.5 ─veth─ node1 ──(VXLAN или маршрут)── node2 ─veth─ pod B 10.244.2.7
```

Частая проблема — **пересечение** CIDR подов или сервисов с корпоративной сетью/VPN, и неправильный **MTU** в overlay (большие пакеты теряются, маленькие проходят).

## kube-proxy и Service

ClusterIP — **виртуальный** адрес: нет интерфейса, который его «слушает». kube-proxy на каждой ноде следит за Service и EndpointSlice и программирует ядро, чтобы пакеты на `ClusterIP:port` подменялись (DNAT) на IP одного из готовых подов.

| Режим | Как |
| --- | --- |
| **iptables** | Цепочки правил NAT, случайный выбор пода. Классика, но на тысячах сервисов правила обновляются медленно |
| **IPVS** | Балансировщик ядра с хеш-таблицами и алгоритмами (rr, lc…) |
| **nftables** | Современная замена iptables-режима |
| **eBPF** (Cilium, без kube-proxy) | Балансировка в eBPF-программах, быстрее и масштабируемее |

```bash
sudo iptables -t nat -L KUBE-SERVICES -n | head
kubectl -n kube-system get ds kube-proxy
```

## CoreDNS

CoreDNS — Deployment в `kube-system`, его Service (обычно `10.96.0.10`) прописан в `/etc/resolv.conf` каждого пода.

```
nameserver 10.96.0.10
search prod.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

- `web` → `web.prod.svc.cluster.local` → ClusterIP.
- Внешние имена CoreDNS пересылает на upstream-DNS ноды.
- `ndots:5` — имя с менее чем 5 точками сначала ищется с search-доменами: запрос `api.github.com` породит несколько лишних запросов. Для внешних имён помогает точка в конце (`api.github.com.`) или настройка `dnsConfig`.
- Проблемы DNS — одна из самых частых причин «всё тормозит»: смотрите логи и метрики CoreDNS, NodeLocal DNSCache для больших кластеров.

## NetworkPolicy

По умолчанию в Kubernetes **разрешено всё**: любой под может ходить к любому. **NetworkPolicy** — файрвол на уровне подов (L3/L4), выбор по меткам подов и namespace.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: prod
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow
  namespace: prod
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - port: 8000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: pg
      ports:
        - port: 5432
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
```

- Как только под выбран хотя бы одной политикой для направления (Ingress/Egress) — разрешено **только** то, что явно разрешено. Политики **складываются** (разрешения объединяются), запрещающих правил нет.
- Ответный трафик разрешённых соединений пропускается автоматически.
- Закрыв egress, **не забудьте DNS** (порт 53 к CoreDNS) — иначе всё сломается «загадочно».
- Политики применяет **CNI-плагин**. Во Flannel их нет — объекты создадутся, но **ничего не будут делать**.
- Хорошая практика: default-deny в каждом namespace + явные разрешения.

## Диагностика сети

```bash
kubectl run net --rm -it --image=nicolaka/netshoot -- bash
nslookup web.prod
curl -v http://web.prod
nc -zv pg.prod 5432
kubectl get pods -o wide
kubectl get endpointslices -n prod
kubectl get networkpolicy -A
kubectl -n kube-system logs deploy/coredns
```

Порядок: под Ready? → DNS резолвится? → ClusterIP доступен? → напрямую IP пода доступен? → NetworkPolicy? → CNI на нодах в порядке (поды CNI в `kube-system`)?

## Практика

- [ ] Посмотреть, какой CNI в кластере (`kubectl get pods -n kube-system`), и CIDR подов на нодах (`kubectl get nodes -o jsonpath='{.items[*].spec.podCIDR}'`)
- [ ] Из пода netshoot проверить доступ к поду на другой ноде по IP и к сервису по имени
- [ ] Посмотреть `/etc/resolv.conf` в поде и проследить разрешение короткого имени и полного имени сервиса
- [ ] Найти правила kube-proxy для своего сервиса в iptables на ноде kind (`docker exec` в ноду)
- [ ] Пересоздать kind-кластер с Calico или Cilium (отключив стандартный CNI) и применить default-deny + разрешение frontend → api
- [ ] Закрыть egress без правила для DNS и убедиться, что сломалось разрешение имён; починить

## Тест

### Какие требования предъявляет сетевая модель Kubernetes?
- [x] У каждого пода собственный IP-адрес, уникальный в кластере
- [x] Поды могут обращаться друг к другу на любых нодах без NAT
- [ ] Все поды одной ноды используют общий IP
- [ ] Поды разных namespace не видят друг друга по умолчанию
> По умолчанию весь трафик между подами разрешён.

### Кто реализует сеть подов: выдаёт IP и связывает поды на разных нодах?
- [ ] kube-proxy
- [x] CNI-плагин (Calico, Cilium, Flannel и др.)
- [ ] CoreDNS
- [ ] kube-scheduler
> kube-proxy отвечает за Service, а не за сеть подов.

### Как работает ClusterIP на уровне ноды?
- [ ] На ноде поднимается интерфейс с этим IP
- [x] kube-proxy (или eBPF CNI) программирует правила ядра, которые подменяют адрес ClusterIP на IP одного из готовых подов
- [ ] Трафик идёт через API server
- [ ] CoreDNS проксирует трафик
> Поэтому ClusterIP не отвечает на ping — это виртуальный адрес.

### Чем overlay-сеть (VXLAN) отличается от маршрутизируемой (BGP)?
- [x] Overlay инкапсулирует пакеты подов в пакеты между нодами и работает в любой сети, но добавляет накладные расходы и уменьшает MTU
- [x] При маршрутизации подсети подов передаются напрямую без инкапсуляции, но сеть должна поддерживать эти маршруты
- [ ] Overlay работает только в облаке
- [ ] BGP используется только для DNS
> Calico поддерживает оба режима.

### Что по умолчанию разрешено в сети Kubernetes без NetworkPolicy?
- [ ] Ничего
- [x] Весь трафик между всеми подами во всех namespaces
- [ ] Только трафик внутри namespace
- [ ] Только трафик к сервисам
> Поэтому хорошая практика — default-deny и явные разрешения.

### Вы создали NetworkPolicy, но она ничего не блокирует. Вероятная причина?
- [ ] Неверная версия kubectl
- [x] CNI-плагин не поддерживает NetworkPolicy (например, Flannel), поэтому политики никто не применяет
- [ ] Нужно перезапустить API server
- [ ] NetworkPolicy работают только для Service
> Calico и Cilium поддерживают политики.

### После того как вы закрыли весь egress в namespace, приложения перестали находить сервисы по имени. Почему?
- [ ] Сломался kube-proxy
- [x] Закрыт трафик к CoreDNS на порт 53 — нужно явно разрешить DNS
- [ ] Удалились Service
- [ ] Закончились IP-адреса
> Это самая частая ошибка с egress-политиками.

### Как складываются несколько NetworkPolicy, выбирающих один под?
- [ ] Применяется последняя созданная
- [x] Разрешения объединяются: трафик пропускается, если его разрешает хотя бы одна политика
- [ ] Запрещающие правила имеют приоритет
- [ ] Применяется самая строгая
> Запрещающих правил в стандартной NetworkPolicy нет.

### Какой компонент отвечает за DNS-имена сервисов в кластере?
= CoreDNS
> Обычно это Deployment в kube-system со своим Service.

### Чем опасна опция ndots:5 в resolv.conf пода для внешних имён?
- [ ] Она запрещает внешние имена
- [x] Имена с менее чем пятью точками сначала перебираются с search-доменами кластера, что порождает много лишних DNS-запросов
- [ ] Она ограничивает число DNS-серверов
- [ ] Она отключает кэш
> Помогает точка в конце имени или настройка dnsConfig.

### Чем режим eBPF (например, Cilium без kube-proxy) лучше iptables на больших кластерах?
- [ ] Он не требует ядра Linux
- [x] Балансировка выполняется программами eBPF в ядре без длинных цепочек правил iptables — быстрее и лучше масштабируется на тысячи сервисов
- [ ] Он не поддерживает Service
- [ ] Он работает только с Flannel
> IPVS и nftables — другие альтернативы iptables-режиму.

### Большие ответы от сервиса теряются, а маленькие проходят, только между подами на разных нодах. Что вероятно?
- [ ] Ошибка DNS
- [x] Неправильный MTU в overlay-сети: инкапсулированные пакеты не помещаются и отбрасываются
- [ ] Нехватка памяти
- [ ] Неверный selector Service
> Overlay уменьшает доступный MTU на размер заголовков инкапсуляции.

### Как в NetworkPolicy разрешить трафик только от подов frontend?
- [ ] Через Service frontend
- [x] В ingress.from указать podSelector с меткой app: frontend
- [ ] Через Ingress-объект
- [ ] Через ClusterRole
> Для других namespace добавляют namespaceSelector.
