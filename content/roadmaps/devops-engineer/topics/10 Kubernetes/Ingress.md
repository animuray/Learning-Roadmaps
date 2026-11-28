---
title: Ingress
slug: ingress
description: Ingress и Ingress Controller — правила маршрутизации по хостам и путям, IngressClass, TLS и cert-manager, аннотации, судьба ingress-nginx и переход на Gateway API.
duration: 60
level: Средний
quizSize: 10
materials:
  - title: Kubernetes Docs — Services, Load Balancing, and Networking (Ingress, Gateway API)
    url: https://kubernetes.io/docs/concepts/services-networking/_print/
    type: документация
  - title: Kubernetes Blog — Ingress NGINX Retirement What You Need to Know
    url: https://www.kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/
    type: статья
  - title: Kubernetes Blog — Ingress NGINX Statement from the Steering and Security Response Committees
    url: https://www.kubernetes.io/blog/2026/01/29/ingress-nginx-statement/
    type: статья
---

# Ingress

Service типа LoadBalancer на каждое приложение — это отдельный облачный балансировщик и отдельный IP на каждый сервис: дорого и неудобно. **Ingress** — один вход в кластер для HTTP/HTTPS с маршрутизацией по **доменам** и **путям** (L7).

```
            internet
               │
        LoadBalancer (один IP)
               │
      Ingress Controller (nginx / Traefik / HAProxy / Envoy)
        ├── app.example.com/        → Service frontend:80
        ├── app.example.com/api     → Service api:8000
        └── grafana.example.com     → Service grafana:3000
```

## Ingress и Ingress Controller — разные вещи

- **Ingress** — объект Kubernetes, **правила**: какой хост и путь — на какой Service. Сам по себе ничего не делает.
- **Ingress Controller** — **программа** (под в кластере), которая читает объекты Ingress и настраивает реальный прокси. Без контроллера Ingress-объекты игнорируются.

Контроллеры: Traefik, HAProxy Ingress, Contour и Envoy Gateway, Kong, облачные (AWS Load Balancer Controller, контроллеры Yandex Cloud и др.), NGINX Ingress Controller от компании F5/NGINX. В кластере может быть несколько контроллеров — выбор через **IngressClass** (`spec.ingressClassName`).

## Манифест

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
spec:
  ingressClassName: traefik
  tls:
    - hosts: [app.example.com]
      secretName: app-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 8000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

- `pathType`: `Prefix` (по префиксу сегментов пути), `Exact` (точное совпадение), `ImplementationSpecific`.
- Более длинный путь выигрывает: `/api` раньше `/`.
- `defaultBackend` — куда отправлять запросы, не подошедшие ни под одно правило.
- Возможности сверх базовых (redirect, rewrite, лимиты, размер тела, таймауты, basic auth) задаются **аннотациями конкретного контроллера** — они непереносимы между контроллерами.

## TLS

- Сертификат и ключ лежат в Secret типа `kubernetes.io/tls`, Ingress ссылается на него в `tls.secretName`. TLS терминируется на контроллере.
- **cert-manager** автоматически выпускает и продлевает сертификаты Let's Encrypt (ACME) по аннотации на Ingress.
- Не забудьте DNS: `app.example.com` должен указывать на внешний IP контроллера.

## ingress-nginx уходит — что это значит

Самый популярный контроллер, **ingress-nginx** (проект сообщества Kubernetes), объявлен **устаревшим**: в марте 2026 года его поддержка закончилась — больше нет релизов, исправлений и обновлений безопасности. Он встречается почти в каждом кластере, поэтому на собеседовании и в работе вы столкнётесь с ним, но **новые установки на нём делать не стоит**, а существующие — планировать к миграции. Сообщество рекомендует переходить на **Gateway API** или другой Ingress-контроллер. Готовой замены «один в один» нет: аннотации ingress-nginx придётся переводить.

> [!note] Не путать
> Уходит именно community-проект `kubernetes/ingress-nginx`. NGINX Ingress Controller от NGINX/F5 — другой продукт.

## Gateway API — преемник Ingress

**Gateway API** — новый стандарт Kubernetes для входящего трафика с разделением ролей:

| Ресурс | Кто управляет | Что описывает |
| --- | --- | --- |
| `GatewayClass` | Провайдер инфраструктуры | Какой контроллер (Envoy Gateway, Istio, Cilium, Traefik, облачный) |
| `Gateway` | Админ кластера | Точка входа: адрес, порты, TLS |
| `HTTPRoute`, `GRPCRoute`, `TLSRoute`… | Команда приложения | Маршруты к своим Service |

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app
spec:
  parentRefs:
    - name: main-gateway
  hostnames: ["app.example.com"]
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api
          port: 8000
```

Плюсы: стандартные возможности вместо аннотаций (заголовки, веса для canary, перенаправления), L4 и gRPC, роли и права по ролям. Объект Ingress продолжает работать и поддерживаться, но новое развитие идёт в Gateway API.

## Практика

- [ ] Установить в kind или Minikube Ingress-контроллер (например, Traefik через Helm) и проверить его Service
- [ ] Развернуть два приложения и настроить Ingress: `/` — на frontend, `/api` — на api; проверить `curl -H "Host: app.local" http://IP/api`
- [ ] Добавить второй хост на тот же Ingress-контроллер
- [ ] Создать самоподписанный сертификат, положить его в TLS-секрет и включить HTTPS на Ingress
- [ ] Установить cert-manager и разобраться, как он выпускает сертификаты (в локальном кластере — self-signed issuer)
- [ ] Повторить маршрутизацию через Gateway API с Envoy Gateway или другим контроллером и сравнить с Ingress
- [ ] Найти в своём (или учебном) кластере, используется ли ingress-nginx, и составить список его аннотаций, которые придётся переносить

## Лаборатория

В кластере k3s работает Ingress-контроллер **Traefik** (IngressClass `traefik`). На стенде у него нет внешнего IP — запросы отправляйте на его ClusterIP: `kubectl -n kube-system get svc traefik`, затем `curl -H 'Host: <имя>' http://<ClusterIP>/...`.

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
lab_kns lab-ing
for app in web api; do
  kubectl -n lab-ing create deployment $app --image=hashicorp/http-echo:1.0 --port=5678 -- /http-echo "-text=$app page" >/dev/null
  kubectl -n lab-ing expose deployment $app --port=80 --target-port=5678 >/dev/null
done
kubectl -n lab-ing rollout status deploy/web --timeout=90s >/dev/null
kubectl -n lab-ing rollout status deploy/api --timeout=90s >/dev/null
```

### Сайт по имени хоста

В namespace **`lab-ing`** есть сервисы **`web`** и **`api`** (порт 80). Создайте Ingress **`shop`**, по которому запросы к хосту **`shop.lab`** идут на сервис `web`.

```bash check
i=$(lab_kj -n lab-ing get ingress shop) || fail "Ingress shop нет"
echo "$i" | jq -e '.spec.rules[] | select(.host == "shop.lab")' >/dev/null || fail "В Ingress нет правила для хоста shop.lab"
t=$(lab_traefik)
for k in $(seq 15); do r=$(curl -s --max-time 3 -H 'Host: shop.lab' http://$t/); [ "$r" = "web page" ] && break; sleep 1; done
[ "$r" = "web page" ] || fail "Запрос к shop.lab через Traefik отвечает «$(echo "$r" | head -c 60)»"
ok "shop.lab → web"
```

```text hint
1. Каркас Ingress даёт kubectl create ingress с ключом правила «хост/путь=сервис:порт».
2. Класс Ingress — traefik.
3. Проверить curl на адрес Traefik с нужным заголовком Host.
```

```bash solution
kubectl -n lab-ing create ingress shop --class=traefik --rule="shop.lab/*=web:80"
t=$(kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}')
sleep 2
curl -s -H 'Host: shop.lab' http://$t/
```

```text review
Эталон: `kubectl create ingress shop --class=traefik --rule="shop.lab/*=web:80"`.

- Ingress — правила HTTP-маршрутизации (хост, путь → сервис), а работу делает **контроллер**: Traefik (в k3s), ingress-nginx, HAProxy, облачные. Без контроллера Ingress — просто запись в API.
- Один внешний адрес (LoadBalancer контроллера) обслуживает все сайты кластера; DNS всех имён указывает на него.
- HTTPS: секция `tls` с Secret-сертификатом; сертификаты Let's Encrypt выписывает cert-manager по аннотации.
- Новый стандарт — Gateway API (`Gateway`, `HTTPRoute`): гибче и с разделением ролей; Ingress остаётся самым распространённым.
```

### Маршруты по путям

Расширьте Ingress **`shop`** (хост **`shop.lab`**): запросы с путём, начинающимся на **`/api`**, — на сервис **`api`**, всё остальное — на **`web`**.

```bash setup
kubectl -n lab-ing create ingress shop --class=traefik --rule="shop.lab/*=web:80" >/dev/null
```

```bash check
i=$(lab_kj -n lab-ing get ingress shop) || fail "Ingress shop нет"
t=$(lab_traefik)
for k in $(seq 15); do a=$(curl -s --max-time 3 -H 'Host: shop.lab' http://$t/api/orders); [ "$a" = "api page" ] && break; sleep 1; done
[ "$a" = "api page" ] || fail "shop.lab/api/orders отвечает «$(echo "$a" | head -c 60)» — не сервис api"
w=$(curl -s --max-time 3 -H 'Host: shop.lab' http://$t/catalog)
[ "$w" = "web page" ] || fail "shop.lab/catalog отвечает «$(echo "$w" | head -c 60)» — не сервис web"
ok "shop.lab/api → api, остальное → web"
```

```text hint
1. В правиле хоста — список путей. Тип пути «префикс» совпадает со всеми путями, которые начинаются с указанного.
2. Более длинный (конкретный) префикс побеждает — порядок путей не важен.
3. Изменить можно манифест и применить заново или отредактировать объект в кластере.
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/shop-ingress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  namespace: lab-ing
spec:
  ingressClassName: traefik
  rules:
    - host: shop.lab
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
EOF
kubectl apply -f ~/k8s/shop-ingress.yaml
t=$(kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}')
sleep 2
curl -s -H 'Host: shop.lab' http://$t/api/orders; echo; curl -s -H 'Host: shop.lab' http://$t/
```

```text review
Эталон — в «Решении»: пути `/api` и `/` с `pathType: Prefix`.

- `Prefix` совпадает по сегментам пути: `/api` ловит `/api` и `/api/orders`, но не `/apiv2`. `Exact` — только точное совпадение.
- Путь передаётся бэкенду как есть (`/api/orders`). Если приложение ждёт `/orders`, нужна перезапись пути — у каждого контроллера своя аннотация или Middleware (Traefik `StripPrefix`).
- Классическая схема: фронтенд на `/`, API на `/api` под одним доменом — нет CORS и проще с cookie.
```

## Тест

### Чем Ingress отличается от Ingress Controller?
- [x] Ingress — объект Kubernetes с правилами маршрутизации по хостам и путям
- [x] Ingress Controller — программа в кластере, которая читает эти правила и настраивает прокси
- [ ] Это одно и то же
- [ ] Ingress Controller — это тип Service
> Без контроллера объекты Ingress ничего не делают.

### На каком уровне работает Ingress?
- [ ] L3 — по IP-адресам
- [x] L7 — HTTP/HTTPS, маршрутизация по доменам и путям
- [ ] L2 — по MAC-адресам
- [ ] Только TCP без HTTP
> Для произвольного TCP/UDP используют Service LoadBalancer или Gateway API (TCPRoute/UDPRoute).

### Зачем нужен Ingress, если есть Service типа LoadBalancer?
- [ ] LoadBalancer не умеет HTTP
- [x] Один вход с одним IP и балансировщиком обслуживает много сервисов с маршрутизацией по доменам и путям, вместо отдельного балансировщика на каждый сервис
- [ ] LoadBalancer нельзя использовать в облаке
- [ ] Ingress быстрее
> Обычно LoadBalancer создаётся только для самого Ingress-контроллера.

### Как в кластере с несколькими контроллерами указать, какой должен обслуживать Ingress?
- [ ] Через namespace
- [x] Через spec.ingressClassName (IngressClass)
- [ ] Через label app
- [ ] Через порт
> Раньше для этого использовали аннотацию kubernetes.io/ingress.class.

### Где хранится TLS-сертификат для Ingress?
- [ ] В ConfigMap
- [x] В Secret типа kubernetes.io/tls, на который ссылается поле tls.secretName
- [ ] В образе контроллера
- [ ] В etcd в отдельном разделе
> cert-manager может создавать и продлевать такие секреты автоматически.

### Что делает cert-manager?
- [ ] Шифрует etcd
- [x] Автоматически выпускает и продлевает TLS-сертификаты (например, Let's Encrypt) и кладёт их в Secret
- [ ] Заменяет Ingress Controller
- [ ] Управляет SSH-ключами нод
> Включается аннотацией на Ingress или ресурсом Certificate.

### Что случилось с проектом ingress-nginx?
- [ ] Стал частью ядра Kubernetes
- [x] Объявлен устаревшим: поддержка закончилась в марте 2026 года, новых релизов и исправлений безопасности нет
- [ ] Переименован в Gateway API
- [ ] Ничего, он активно развивается
> Сообщество рекомендует переходить на Gateway API или другой Ingress-контроллер.

### Что рекомендуют как современную замену Ingress?
= Gateway API
> Ресурсы GatewayClass, Gateway и HTTPRoute с разделением ролей.

### Какое преимущество Gateway API перед Ingress?
- [x] Многие возможности (веса для canary, заголовки, перенаправления) описаны стандартными полями, а не аннотациями конкретного контроллера
- [x] Разделение ролей: инфраструктура (Gateway) и маршруты команд (HTTPRoute)
- [ ] Gateway API работает без контроллера
- [ ] Gateway API не поддерживает TLS
> Ещё — поддержка L4 и gRPC.

### В Ingress есть пути /api и /, оба Prefix. Куда попадёт запрос /api/users?
- [ ] На сервис для /
- [x] На сервис для /api — более длинный совпадающий префикс имеет приоритет
- [ ] На оба
- [ ] Будет ошибка 404
> Запрос /about попадёт на сервис для /.

### Почему аннотации Ingress — источник проблем при смене контроллера?
- [ ] Аннотации запрещены
- [x] Они специфичны для конкретного контроллера: при переходе на другой контроллер их нужно переписывать
- [ ] Аннотации удаляются при обновлении Kubernetes
- [ ] Аннотации работают только в облаке
> Это одна из причин появления Gateway API.

### Ingress создан, но приложение по домену не открывается. Что проверить?
- [x] Установлен ли Ingress Controller и совпадает ли ingressClassName
- [x] Указывает ли DNS домена на внешний IP контроллера
- [x] Существуют ли Service и порты из backend и есть ли у них готовые поды
- [ ] Версию kubectl на ноутбуке
> Логи и события контроллера тоже часто подсказывают причину.
