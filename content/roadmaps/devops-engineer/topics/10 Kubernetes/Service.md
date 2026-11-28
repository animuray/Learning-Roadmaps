---
title: Service
slug: service
description: Зачем нужен Service, типы ClusterIP, NodePort, LoadBalancer, ExternalName и headless, port и targetPort, селекторы и EndpointSlices, DNS-имена сервисов, sessionAffinity и диагностика «сервис не отвечает».
duration: 75
level: Основы
quizSize: 10
materials:
  - title: Kubernetes Docs — Services, Load Balancing, and Networking
    url: https://kubernetes.io/docs/concepts/services-networking/_print/
    type: документация
  - title: Kubernetes Docs — DNS for Services and Pods
    url: https://www.kubernetes.io/docs/concepts/services-networking/dns-pod-service/
    type: документация
  - title: Kubernetes Docs — Debug Applications (Services)
    url: https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/
    type: документация
---

# Service

У каждого пода свой IP, но поды **эфемерны**: пересоздались — новый IP, масштабировались — их стало больше. Обращаться к подам по IP нельзя. **Service** даёт **постоянный адрес и DNS-имя** для группы подов, выбранных по меткам, и **балансирует** трафик между ними.

```
 клиент ──► web (ClusterIP 10.96.12.34:80) ──kube-proxy──► pod 10.244.1.5:8000
                                                       ├──► pod 10.244.2.7:8000
                                                       └──► pod 10.244.3.2:8000
```

## Манифест

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
    - name: http
      port: 80
      targetPort: 8000
      protocol: TCP
```

- `selector` — какие поды обслуживать (по меткам).
- `port` — порт **сервиса**; `targetPort` — порт **контейнера** (можно по имени порта из пода).
- Трафик идёт только на поды, которые **Ready** (прошли readiness-пробу).
- Список текущих адресов подов хранится в **EndpointSlice** (`kubectl get endpointslices -l kubernetes.io/service-name=web`).

## Типы Service

| Тип | Доступен откуда | Как |
| --- | --- | --- |
| **ClusterIP** (по умолчанию) | Только изнутри кластера | Виртуальный IP из диапазона сервисов |
| **NodePort** | Снаружи по `IP_любой_ноды:порт` | ClusterIP + порт 30000–32767 на **каждой** ноде |
| **LoadBalancer** | Снаружи через внешний балансировщик | NodePort + облачный балансировщик с внешним IP (создаёт cloud-controller-manager; на bare metal — MetalLB) |
| **ExternalName** | Изнутри | DNS CNAME на внешнее имя (`db.example.com`), без проксирования |
| **Headless** (`clusterIP: None`) | Изнутри | Без виртуального IP: DNS возвращает IP **подов** напрямую — для StatefulSet и клиентской балансировки |

На практике снаружи обычно открывают **один** LoadBalancer для Ingress/Gateway-контроллера, а приложения — ClusterIP за ним. NodePort — для отладки и bare metal.

## DNS

CoreDNS создаёт записи:

```
web                                  # из того же namespace
web.prod                             # из другого namespace
web.prod.svc.cluster.local           # полное имя (FQDN)
pg-0.pg.prod.svc.cluster.local       # под StatefulSet через headless Service
```

`/etc/resolv.conf` пода содержит search-домены (`prod.svc.cluster.local svc.cluster.local cluster.local`), поэтому короткие имена работают.

## Полезное

- `sessionAffinity: ClientIP` — «липкие» сессии по IP клиента.
- `externalTrafficPolicy: Local` (NodePort/LoadBalancer) — сохранить IP клиента и не делать лишний переход между нодами, но трафик пойдёт только на ноды, где есть поды.
- `internalTrafficPolicy: Local` — внутри кластера отправлять только на поды той же ноды.
- Service без `selector` + ручной EndpointSlice — указать на внешний сервер (базу вне кластера) по IP.

```bash
kubectl expose deploy web --port=80 --target-port=8000
kubectl get svc
kubectl describe svc web
kubectl port-forward svc/web 8080:80
```

## «Сервис не отвечает» — порядок диагностики

1. Есть ли поды и они **Ready**? `kubectl get pods -l app=web`
2. Совпадает ли **selector** с метками подов? Есть ли адреса в EndpointSlice? Пусто — ошибка в метках или поды не Ready.
3. Правильный ли **targetPort**? Слушает ли приложение этот порт на `0.0.0.0`? `kubectl exec ... -- ss -tlnp` или `curl localhost:8000` изнутри пода.
4. Работает ли **DNS**? `kubectl run tmp --rm -it --image=busybox:1.36 -- nslookup web.prod`
5. Доступен ли сервис изнутри кластера? `wget -qO- http://web.prod`
6. Не блокирует ли **NetworkPolicy**?
7. Для NodePort/LoadBalancer — файрвол облака, security groups, `externalTrafficPolicy`.

## Практика

- [ ] Создать Deployment из 3 реплик и ClusterIP Service; из одноразового пода обратиться к сервису по имени много раз и убедиться, что отвечают разные поды
- [ ] Посмотреть EndpointSlice сервиса, затем сломать селектор и увидеть пустой список адресов
- [ ] Сделать NodePort Service и открыть приложение по IP ноды (в kind — `docker exec` или `extraPortMappings`)
- [ ] Обратиться к сервису из другого namespace по имени `web.namespace` и по FQDN
- [ ] Создать headless Service и сравнить ответ `nslookup` с обычным Service
- [ ] Пройти по шагам диагностики «сервис не отвечает», специально указав неверный targetPort

## Лаборатория

Кластер — k3s на стенде.

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

### Сервис для Deployment

В namespace **`lab-svc`** работает Deployment **`echo`** (3 пода с меткой `app=echo`, порт контейнера **5678**). Создайте сервис **`echo`** типа ClusterIP, который принимает запросы на **порту 80** и отправляет их на порт 5678 подов. Под-клиент в том же namespace должен получить ответ по адресу `http://echo/`.

```bash setup
lab_kns lab-svc
kubectl -n lab-svc create deployment echo --image=hashicorp/http-echo:1.0 --replicas=3 --port=5678 -- /http-echo "-text=hello from echo" >/dev/null
kubectl -n lab-svc label deploy echo app=echo --overwrite >/dev/null
kubectl -n lab-svc run client --image=busybox:1.36 --restart=Never --command -- sleep 100000 >/dev/null
kubectl -n lab-svc rollout status deploy/echo --timeout=90s >/dev/null
```

```bash check
s=$(lab_kj -n lab-svc get svc echo) || fail "Сервиса echo нет"
[ "$(echo "$s" | jq -r .spec.type)" = ClusterIP ] || fail "Тип сервиса — $(echo "$s" | jq -r .spec.type)"
echo "$s" | jq -e '.spec.ports[] | select(.port == 80 and ((.targetPort == 5678) or (.targetPort == "5678")))' >/dev/null || fail "Сервис не принимает на 80 с отправкой на 5678: $(echo "$s" | jq -c .spec.ports)"
n=$(lab_kj -n lab-svc get endpoints echo | jq '[.subsets[]?.addresses[]?] | length')
[ "$n" = 3 ] || fail "У сервиса $n адресов подов вместо 3 — проверьте селектор"
kubectl -n lab-svc wait --for=condition=Ready pod/client --timeout=60s >/dev/null 2>&1
r=$(kubectl -n lab-svc exec client -- wget -qO- -T 3 http://echo/ 2>/dev/null)
[ "$r" = "hello from echo" ] || fail "Из пода client http://echo/ отвечает «$r»"
ok "echo: ClusterIP $(echo "$s" | jq -r .spec.clusterIP), 3 пода за сервисом"
```

```text hint
1. Каркас сервиса для Deployment даёт kubectl expose с ключами порта сервиса и целевого порта.
2. Сервис находит поды по селектору меток. Посмотрите, сколько адресов у него в endpoints.
3. Проверить из пода-клиента по короткому имени сервиса (в одном namespace).
```

```bash solution
kubectl -n lab-svc expose deployment echo --name=echo --port=80 --target-port=5678
kubectl -n lab-svc get endpoints echo
kubectl -n lab-svc exec client -- wget -qO- http://echo/
```

```text review
Эталон: `kubectl expose deployment echo --port=80 --target-port=5678` (или манифест Service с `selector: app: echo`).

- ClusterIP — виртуальный адрес внутри кластера; kube-proxy (iptables/IPVS) раскидывает запросы по подам из endpoints. Поды меняются — адрес сервиса и DNS-имя остаются.
- Пустой `kubectl get endpoints` — селектор не совпал с метками подов или поды не Ready. Это причина №1 «сервис не отвечает».
- DNS: `echo` (тот же namespace), `echo.lab-svc` (из другого), `echo.lab-svc.svc.cluster.local` (полное).
- `port` — порт сервиса, `targetPort` — порт контейнера (можно по имени порта), `nodePort` — порт на узлах (тип NodePort).
```

### Доступ снаружи через NodePort

Опубликуйте тот же Deployment **`echo`** из **`lab-svc`** наружу: сервис **`echo-public`** типа **NodePort** с фиксированным портом узла **30080**. Запрос `curl http://<IP узла>:30080/` со стенда должен вернуть ответ приложения.

```bash setup
lab_kns lab-svc
kubectl -n lab-svc create deployment echo --image=hashicorp/http-echo:1.0 --replicas=2 --port=5678 -- /http-echo "-text=hello from echo" >/dev/null
kubectl -n lab-svc rollout status deploy/echo --timeout=90s >/dev/null
```

```bash check
s=$(lab_kj -n lab-svc get svc echo-public) || fail "Сервиса echo-public нет"
[ "$(echo "$s" | jq -r .spec.type)" = NodePort ] || fail "Тип сервиса — $(echo "$s" | jq -r .spec.type)"
[ "$(echo "$s" | jq -r '.spec.ports[0].nodePort')" = 30080 ] || fail "Порт узла — $(echo "$s" | jq -r '.spec.ports[0].nodePort')"
ip=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
r=$(curl -s --max-time 5 http://$ip:30080/)
[ "$r" = "hello from echo" ] || fail "http://$ip:30080/ отвечает «$r»"
ok "echo-public: http://$ip:30080/ → $r"
```

```text hint
1. Сервис типа NodePort открывает один и тот же порт на всех узлах кластера. Порт можно задать явно в описании портов сервиса (из диапазона 30000–32767).
2. IP узла — в подробном выводе списка узлов.
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/echo-public.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: echo-public
  namespace: lab-svc
spec:
  type: NodePort
  selector:
    app: echo
  ports:
    - port: 80
      targetPort: 5678
      nodePort: 30080
EOF
kubectl apply -f ~/k8s/echo-public.yaml
ip=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
curl -s http://$ip:30080/
```

```text review
Эталон: Service `type: NodePort` с `nodePort: 30080`.

- NodePort — порт из диапазона 30000–32767 на **каждом** узле; запрос на любой узел попадёт в сервис. Годится для тестов и как основа для внешнего балансировщика.
- `LoadBalancer` — облако (или MetalLB в своём кластере) выдаёт внешний IP и само направляет трафик на NodePort-ы. В k3s за это отвечает servicelb (на стенде выключен).
- Для HTTP наружу обычно не NodePort на каждый сервис, а один Ingress-контроллер (следующая тема).
```

## Тест

### Зачем нужен Service?
- [ ] Чтобы хранить данные подов
- [x] Чтобы дать группе подов постоянный адрес и DNS-имя и балансировать между ними трафик
- [ ] Чтобы запускать поды
- [ ] Чтобы собирать логи
> IP подов меняются при каждом пересоздании.

### Как Service определяет, на какие поды отправлять трафик?
- [ ] По именам подов
- [x] По selector, совпадающему с метками подов, и только на поды в состоянии Ready
- [ ] По порядку создания
- [ ] Случайно на любые поды namespace
> Текущий список адресов — в EndpointSlice.

### Какой тип Service используется по умолчанию и откуда он доступен?
- [ ] NodePort, снаружи
- [x] ClusterIP, только изнутри кластера
- [ ] LoadBalancer, из интернета
- [ ] ExternalName, снаружи
> Для доступа снаружи — LoadBalancer, NodePort или Ingress.

### Чем port отличается от targetPort?
- [x] port — порт, на котором слушает Service
- [x] targetPort — порт контейнера, куда Service пересылает трафик
- [ ] Это одно и то же
- [ ] targetPort — порт ноды
> Порт на ноде для NodePort задаётся полем nodePort.

### Как работает Service типа NodePort?
- [ ] Открывает порт только на одной ноде, где есть под
- [x] Открывает один и тот же порт (по умолчанию из диапазона 30000–32767) на каждой ноде и пересылает трафик на поды
- [ ] Создаёт облачный балансировщик
- [ ] Работает только внутри кластера
> NodePort включает в себя ClusterIP.

### Что создаёт Service типа LoadBalancer в облаке?
- [ ] Новый кластер
- [x] Внешний облачный балансировщик с публичным адресом, направляющий трафик на ноды кластера
- [ ] Ingress
- [ ] DNS-запись в etcd
> На bare metal для этого используют MetalLB.

### Что такое headless Service?
- [ ] Service без портов
- [x] Service с clusterIP: None: у него нет виртуального IP, а DNS возвращает IP-адреса подов напрямую
- [ ] Service без селектора
- [ ] Service только для внешнего трафика
> Используется вместе со StatefulSet.

### Как обратиться к сервису web из namespace prod, находясь в другом namespace?
- [ ] По имени web
- [x] По имени web.prod или web.prod.svc.cluster.local
- [ ] Только по IP
- [ ] Это невозможно
> Короткое имя web работает только в том же namespace.

### Service есть, поды работают, но запросы к сервису не проходят, а EndpointSlice пустой. Вероятные причины?
- [x] Selector не совпадает с метками подов
- [x] Поды не проходят readiness-пробу
- [ ] Неверная версия kubectl
- [ ] Мало памяти на ноутбуке
> Пустой список адресов — первое, что стоит проверить.

### Для чего Service типа ExternalName?
- [ ] Для доступа к кластеру извне
- [x] Чтобы дать внешнему DNS-имени внутреннее имя в кластере через CNAME-запись
- [ ] Для балансировки подов
- [ ] Для headless-доступа
> Проксирования трафика при этом нет.

### Что даёт externalTrafficPolicy: Local?
- [ ] Шифрование трафика
- [x] Сохраняет исходный IP клиента и отправляет трафик только на поды той ноды, куда он пришёл
- [ ] Запрещает внешний трафик
- [ ] Включает sticky-сессии
> Если на ноде нет подов, трафик на неё не должен приходить — балансировщик проверяет это health-check'ом.

### Кто реализует балансировку трафика ClusterIP-сервиса на нодах?
= kube-proxy
> Либо CNI-плагин, заменяющий kube-proxy (например, Cilium на eBPF).
