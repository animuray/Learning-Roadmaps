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
