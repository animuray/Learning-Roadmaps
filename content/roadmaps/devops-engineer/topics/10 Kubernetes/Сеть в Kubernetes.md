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

## Лаборатория

Кластер — k3s на стенде; NetworkPolicy в нём работают (встроенный контроллер).

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

### Имя сервиса из другого namespace

В namespace **`lab-data`** работает сервис **`postgres`**, а приложение — в namespace **`lab-app`**. Узнайте **полное DNS-имя** (FQDN) сервиса, по которому к нему можно обратиться из любого namespace, и запишите его в `~/fqdn.txt`. Проверьте из пода `client` в `lab-app`, что имя разрешается.

```bash setup
for ns in lab-data lab-app; do lab_kns $ns; done
kubectl -n lab-data create deployment postgres --image=busybox:1.36 -- sleep 100000 >/dev/null
kubectl -n lab-data expose deployment postgres --port=5432 >/dev/null
kubectl -n lab-app run client --image=busybox:1.36 --restart=Never --command -- sleep 100000 >/dev/null
rm -f /home/student/fqdn.txt
```

```bash check
dom=$(kubectl -n kube-system get cm coredns -o jsonpath='{.data.Corefile}' | grep -oE 'kubernetes [a-z.]+' | awk '{print $2}' | head -1)
want="postgres.lab-data.svc.${dom:-cluster.local}"
[ -f /home/student/fqdn.txt ] || fail "Нет ~/fqdn.txt"
got=$(tr -d '[:space:]' < /home/student/fqdn.txt); got=${got%.}
[ "$got" = "$want" ] || fail "В ~/fqdn.txt «$got» — это не полное имя сервиса postgres из lab-data"
kubectl -n lab-app wait --for=condition=Ready pod/client --timeout=60s >/dev/null 2>&1
kubectl -n lab-app exec client -- nslookup "$want" >/dev/null 2>&1 || fail "Из lab-app имя $want не разрешается"
ok "$want → $(kubectl -n lab-data get svc postgres -o jsonpath='{.spec.clusterIP}')"
```

```text hint
1. DNS-имя сервиса строится из имени сервиса, имени namespace, слова svc и домена кластера.
2. Домен кластера и поисковые домены видны в файле настроек резолвера внутри любого пода.
3. Проверить разрешение имени утилитой поиска DNS внутри пода-клиента.
```

```bash solution
kubectl -n lab-app exec client -- cat /etc/resolv.conf
kubectl -n lab-app exec client -- nslookup postgres.lab-data.svc.cluster.local
echo postgres.lab-data.svc.cluster.local > ~/fqdn.txt
```

```text review
Эталон: `postgres.lab-data.svc.cluster.local`.

- В `/etc/resolv.conf` пода — сервер CoreDNS и `search <ns>.svc.cluster.local svc.cluster.local cluster.local`: поэтому внутри своего namespace хватает `postgres`, а из соседнего — `postgres.lab-data`.
- `options ndots:5`: имена с меньше чем 5 точками сначала пробуются с каждым search-доменом — внешние запросы (`api.github.com`) порождают лишние DNS-запросы. Для частых внешних вызовов используют FQDN с точкой в конце.
- Headless-сервис (`clusterIP: None`) отдаёт в DNS адреса самих подов, а у подов StatefulSet есть имена `db-0.db.ns.svc.cluster.local`.
- Отладка DNS: `kubectl run -it --rm dbg --image=busybox -- nslookup ...`, логи CoreDNS в kube-system.
```

### Закрыть базу NetworkPolicy

В namespace **`lab-netpol`** работают сервис **`db`** (поды `app=db`, порт 5432), под-бэкенд **`api`** (метка `app=api`) и посторонний под **`other`**. Создайте NetworkPolicy **`db-allow-api`**, после которой к подам `db` по TCP **5432** могут подключаться **только** поды `app=api` из того же namespace. Под `other` должен получать отказ по тайм-ауту.

```bash setup
lab_kns lab-netpol
kubectl -n lab-netpol create deployment db --image=busybox:1.36 -- sh -c 'while true; do nc -lk -p 5432 -e echo ok; done' >/dev/null
kubectl -n lab-netpol expose deployment db --port=5432 >/dev/null
kubectl -n lab-netpol run api --image=busybox:1.36 --labels=app=api --restart=Never --command -- sleep 100000 >/dev/null
kubectl -n lab-netpol run other --image=busybox:1.36 --labels=app=other --restart=Never --command -- sleep 100000 >/dev/null
kubectl -n lab-netpol rollout status deploy/db --timeout=90s >/dev/null
lab_kready lab-netpol app=api
lab_kready lab-netpol app=other
```

```bash check
np=$(lab_kj -n lab-netpol get networkpolicy db-allow-api) || fail "NetworkPolicy db-allow-api нет"
[ "$(echo "$np" | jq -r '.spec.podSelector.matchLabels.app')" = db ] || fail "Политика применяется не к подам app=db"
sleep 2
kubectl -n lab-netpol exec api -- nc -z -w 3 db 5432 >/dev/null 2>&1 || fail "Под api не может подключиться к db:5432"
kubectl -n lab-netpol exec other -- nc -z -w 3 db 5432 >/dev/null 2>&1 && fail "Под other всё ещё подключается к db:5432"
ok "к db:5432 пускает только app=api"
```

```text hint
1. Политика выбирает поды, которые защищает, по меткам; как только под выбран политикой с типом Ingress, всё входящее, что не разрешено явно, запрещается.
2. В правилах входящего трафика — источник (выбор подов по метке) и порт с протоколом.
3. Проверить подключение из обоих подов с ограничением по времени.
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/db-netpol.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-allow-api
  namespace: lab-netpol
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 5432
EOF
kubectl apply -f ~/k8s/db-netpol.yaml
sleep 2
kubectl -n lab-netpol exec api -- nc -zv -w 3 db 5432
kubectl -n lab-netpol exec other -- nc -zv -w 3 db 5432 || echo "other: закрыто"
```

```text review
Эталон — в «Решении».

- По умолчанию в Kubernetes **все поды видят всех**. Первая же политика, выбравшая под, делает его «deny by default» для указанного направления.
- Частая схема: `default-deny` на namespace (пустой `podSelector: {}` без правил) + точечные разрешения. Не забудьте разрешить DNS (UDP/TCP 53 к CoreDNS), если закрываете Egress.
- `from` может содержать `podSelector`, `namespaceSelector` (из другого namespace — по меткам namespace) и `ipBlock`.
- Политики работают, только если их поддерживает CNI: Calico, Cilium, kube-router (k3s). В «голом» Flannel они молча игнорируются.
```

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
