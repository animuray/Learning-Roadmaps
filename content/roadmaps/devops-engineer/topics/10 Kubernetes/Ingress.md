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
