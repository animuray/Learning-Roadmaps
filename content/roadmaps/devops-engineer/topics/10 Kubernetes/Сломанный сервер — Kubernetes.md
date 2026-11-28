---
title: Сломанный сервер — Kubernetes
slug: slomannyj-server-kubernetes
description: Аварии в кластере без подсказок в условии — сервис не отвечает (образ, селектор, targetPort), под висит в Pending и перезапускается из-за проб. Алгоритм — get, describe, events, logs, endpoints.
duration: 75
level: Практика
quizSize: 10
---

# Сломанный сервер — Kubernetes

В кластере почти всегда есть подсказка — в `STATUS` пода, в событиях или в пустых endpoints. Важно идти по цепочке «Deployment → ReplicaSet → Pod → контейнер → Service → endpoints» и не перескакивать.

## Алгоритм «в кластере не работает»

1. `kubectl get pods -n ns -o wide` — статус пода. Он сразу сужает поиск:

| STATUS | Где искать |
| --- | --- |
| `Pending` | `describe pod` → Events: не хватает ресурсов, нет подходящего узла, не привязан PVC |
| `ErrImagePull` / `ImagePullBackOff` | имя/тег образа, доступ к registry, `imagePullSecrets` |
| `CreateContainerConfigError` | нет ConfigMap/Secret или ключа в нём |
| `CrashLoopBackOff` | `logs --previous` — приложение падает; или liveness-проба убивает контейнер |
| `Running`, но `READY 0/1` | readiness-проба не проходит |
| `OOMKilled` (в `describe`) | лимит памяти |

2. `kubectl describe pod имя` — внизу **Events**: причина почти всегда там.
3. `kubectl logs имя [-c контейнер] [--previous]` — что сказало приложение.
4. **Service:** `kubectl get endpoints имя` (или `endpointslices`). Пусто — селектор сервиса не совпадает с метками подов или поды не Ready. Есть адреса, но не отвечает — `targetPort` не тот.
5. Проверить изнутри: `kubectl run tmp --rm -it --image=busybox:1.36 -- wget -qO- http://svc.ns`.
6. События всего namespace по времени: `kubectl get events -n ns --sort-by=.lastTimestamp`.

## Практика

- [ ] Пройти задачи лаборатории, первые 10 минут без подсказки
- [ ] Для каждой записать: симптом → команды → причина → решение
- [ ] В своём кластере специально сломать приложение каждым способом из таблицы и посмотреть, как это выглядит в `get` и `describe`

## Лаборатория

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
# mem_mi значение — память Kubernetes (64Mi, 1Gi, 500M) в МиБ
mem_mi() { python3 -c 'import re,sys
v=sys.argv[1]; m=re.fullmatch(r"([0-9.]+)([KMGT]i?)?", v)
if not m: print(-1); sys.exit()
n=float(m.group(1)); u=m.group(2) or ""
f={"":1/2**20,"K":1e3/2**20,"M":1e6/2**20,"G":1e9/2**20,"T":1e12/2**20,"Ki":1/1024,"Mi":1,"Gi":1024,"Ti":1024**2}[u]
print(int(n*f))' "$1"; }
```

### Сайт в кластере не отвечает

В namespace **`lab-bs1`** приложение `web` (Deployment, 2 реплики, nginx) и Service `web` на порту 80. После обновления манифестов сервис перестал отвечать.

Почините так, чтобы Service `web` отдавал страницу nginx, а обе реплики Deployment `web` работали. Объекты не переименовывайте и не создавайте заново под другими именами.

```bash setup
lab_kns lab-bs1
kubectl -n lab-bs1 apply -f - >/dev/null <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop-web
  template:
    metadata:
      labels:
        app: shop-web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpne
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
EOF
```

```bash check
kubectl get ns lab-bs1 >/dev/null 2>&1 || fail "Нет namespace lab-bs1 — нажмите «Начать задачу» заново"
kubectl -n lab-bs1 get deploy web >/dev/null 2>&1 || fail "Нет Deployment web"
kubectl -n lab-bs1 get svc web >/dev/null 2>&1 || fail "Нет Service web"
kubectl -n lab-bs1 rollout status deploy/web --timeout=20s >/dev/null 2>&1
r=$(kubectl -n lab-bs1 get deploy web -o jsonpath='{.status.readyReplicas}')
[ "${r:-0}" -ge 2 ] || fail "Готовых реплик Deployment web: ${r:-0} из 2 ($(kubectl -n lab-bs1 get pods --no-headers 2>/dev/null | awk '{print $3}' | sort -u | tr '\n' ' '))"
ep=$(kubectl -n lab-bs1 get endpoints web -o jsonpath='{.subsets[*].addresses[*].ip}')
[ -n "$ep" ] || fail "У Service web нет endpoints"
ip=$(kubectl -n lab-bs1 get svc web -o jsonpath='{.spec.clusterIP}')
curl -s --max-time 4 "http://$ip/" | grep -q 'Welcome to nginx' || fail "Service web ($ip:80) не отдаёт страницу nginx"
ok "Service web отвечает, endpoints: $ep"
```

```text hint
1. Начать с подов: статус и события объясняют, почему они не готовы.
2. Когда поды работают, посмотреть, какие адреса стоят за сервисом. Если пусто — сравнить, кого сервис ищет, и какие метки у подов.
3. Если адреса есть, а ответа нет — сравнить порт, на который сервис отправляет трафик, с портом, который слушает контейнер.
```

```bash solution
kubectl -n lab-bs1 get pods
kubectl -n lab-bs1 describe pod -l app=shop-web | grep -A3 -E '^Events|Failed' | head -8
kubectl -n lab-bs1 set image deploy/web nginx=nginx:1.27-alpine
kubectl -n lab-bs1 rollout status deploy/web --timeout=90s
kubectl -n lab-bs1 get endpoints web
kubectl -n lab-bs1 get pods --show-labels
kubectl -n lab-bs1 patch svc web -p '{"spec":{"selector":{"app":"shop-web"},"ports":[{"port":80,"targetPort":80}]}}'
kubectl -n lab-bs1 get endpoints web
curl -s "http://$(kubectl -n lab-bs1 get svc web -o jsonpath='{.spec.clusterIP}')/" | head -4
```

```text review
Три поломки по цепочке:

1. `image: nginx:1.27-alpne` — опечатка в теге: `ErrImagePull` → `ImagePullBackOff`. В `describe pod`: «manifest unknown» / «not found».
2. Service `selector: app: web`, а у подов метка `app: shop-web` — endpoints пустые, трафику некуда идти.
3. `targetPort: 8080`, а nginx слушает 80 — endpoints появились, но соединение отклоняется.

- `kubectl get endpoints` (или `endpointslices`) — главный инструмент для «Service не отвечает»: пусто — проблема в селекторе или readiness; адреса есть — в портах или приложении.
- `kubectl get pods --show-labels` и `kubectl get svc -o wide` (колонка SELECTOR) рядом — и несовпадение видно сразу.
- Лучше чинить в манифестах в Git и применять `kubectl apply` (или через Argo CD) — правка `patch`/`set` на живом кластере перезапишется при следующем деплое. В лаборатории манифестов в Git нет, поэтому правим на месте.
- Удалить и создать заново «под правильными именами» — не починка: на объект могут ссылаться Ingress, HPA, NetworkPolicy и мониторинг.
```

```text notes
delete\s+(deploy|deployment|svc|service)\b => Объект удаляли и создавали заново — на живом кластере это простой и потеря ссылок на объект. Достаточно исправить поле.
```

### Под не запускается

В namespace **`lab-bs2`** Deployment **`api`** (1 реплика) после «настройки ресурсов и проб» так и не заработал. Приложению на самом деле нужно около **64 МиБ** памяти, слушает оно порт `8080`.

Почините так, чтобы под `api` был готов и стабильно работал. Требования эксплуатации: у контейнера должны остаться **requests и limits по памяти**, **liveness- и readiness-пробы**.

```bash setup
lab_kns lab-bs2
kubectl -n lab-bs2 apply -f - >/dev/null <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: hashicorp/http-echo:1.0
          args: ["-listen=:8080", "-text=api ok"]
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 50m
              memory: 64Gi
            limits:
              memory: 64Gi
          readinessProbe:
            httpGet:
              path: /
              port: 8081
            periodSeconds: 3
          livenessProbe:
            httpGet:
              path: /
              port: 8081
            initialDelaySeconds: 2
            periodSeconds: 3
            failureThreshold: 2
EOF
```

```bash check
kubectl get ns lab-bs2 >/dev/null 2>&1 || fail "Нет namespace lab-bs2 — нажмите «Начать задачу» заново"
c='{.spec.template.spec.containers[0]'
rq=$(kubectl -n lab-bs2 get deploy api -o jsonpath="$c.resources.requests.memory}")
lm=$(kubectl -n lab-bs2 get deploy api -o jsonpath="$c.resources.limits.memory}")
[ -n "$rq" ] && [ -n "$lm" ] || fail "У контейнера api нет requests или limits по памяти"
kubectl -n lab-bs2 get deploy api -o jsonpath="$c.livenessProbe}" | grep -q . || fail "У контейнера api нет liveness-пробы"
kubectl -n lab-bs2 get deploy api -o jsonpath="$c.readinessProbe}" | grep -q . || fail "У контейнера api нет readiness-пробы"
kubectl -n lab-bs2 rollout status deploy/api --timeout=20s >/dev/null 2>&1
pod=$(kubectl -n lab-bs2 get pods -l app=api --field-selector=status.phase!=Succeeded -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
[ -n "$pod" ] || fail "Подов Deployment api нет"
ph=$(kubectl -n lab-bs2 get pod "$pod" -o jsonpath='{.status.phase}')
[ "$ph" = Running ] || fail "Под $pod в состоянии $ph"
lab_kready lab-bs2 app=api 15 || fail "Под $pod запущен, но не готов (READY 0/1)"
r1=$(kubectl -n lab-bs2 get pod "$pod" -o jsonpath='{.status.containerStatuses[0].restartCount}')
sleep 9
r2=$(kubectl -n lab-bs2 get pod "$pod" -o jsonpath='{.status.containerStatuses[0].restartCount}')
[ "$r1" = "$r2" ] || fail "Контейнер пода $pod перезапускается (рестартов: $r2)"
lab_kready lab-bs2 app=api 5 || fail "Под $pod перестал быть готовым"
m=$(mem_mi "$rq"); [ "$m" -ge 32 ] && [ "$m" -le 512 ] || fail "requests.memory = $rq — далеко от реальной потребности приложения"
ok "под $pod готов, рестартов нет, requests.memory=$rq, limits.memory=$lm"
```

```text hint
1. Под не запускается — в событиях пода написано, почему планировщик не может его разместить. Сравнить запрошенное с тем, что есть у узла.
2. Когда под запустился, следить за колонками готовности и рестартов. Описание пода покажет, какая проверка не проходит и на какой порт она стучится.
3. Исправить запрос и лимит памяти под реальную потребность, порты обеих проб — на порт приложения. Дождаться выкатки новой версии.
```

```bash solution
kubectl -n lab-bs2 get pods
kubectl -n lab-bs2 describe pod -l app=api | grep -A4 '^Events'
kubectl describe node | grep -A6 'Allocatable'
kubectl -n lab-bs2 set resources deploy/api --requests=cpu=50m,memory=64Mi --limits=memory=128Mi
kubectl -n lab-bs2 rollout status deploy/api --timeout=30s || true
kubectl -n lab-bs2 describe pod -l app=api | grep -E 'Liveness|Readiness|Unhealthy' | head -4
kubectl -n lab-bs2 patch deploy api --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/httpGet/port","value":8080},{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":8080}]'
kubectl -n lab-bs2 rollout status deploy/api --timeout=90s
kubectl -n lab-bs2 get pods
```

```text review
Две поломки, вторая видна только после первой:

1. `requests.memory: 64Gi` вместо `64Mi` — на узле столько нет, под висит в `Pending`, в событиях «Insufficient memory». Планировщик смотрит на **requests**, а не на реальное потребление.
2. Пробы стучатся на порт `8081`, а приложение слушает `8080`. Readiness не проходит — под `0/1` и не получает трафик; liveness не проходит — kubelet убивает контейнер, растёт `RESTARTS`, затем `CrashLoopBackOff`.

- В `describe pod` строки `Liveness probe failed: ... connection refused` прямо называют адрес пробы.
- Ставить liveness так же «агрессивно», как readiness, опасно: при медленном старте или временной перегрузке kubelet будет убивать здоровые контейнеры. Для медленного старта — `startupProbe`.
- Удалить пробы и ресурсы «чтобы заработало» — значит лишиться самовосстановления и защиты узла от прожорливого пода.
- `limits.memory` меньше реального пика → `OOMKilled`; requests сильно больше нужного → под не помещается и узлы простаивают.
```

```text notes
remove.*Probe|"op":\s*"remove" => Пробу удаляли — по условию liveness и readiness должны остаться.
```

## Тест

### Под в статусе Pending. Где искать причину?
- [ ] kubectl logs
- [x] kubectl describe pod — раздел Events (сообщения планировщика)
- [ ] journalctl на узле
- [ ] В образе контейнера
> Контейнер ещё не создан, логов нет; планировщик пишет причину в события.

### Планировщик пишет «0/1 nodes are available: 1 Insufficient memory», хотя на узле свободно 3 ГБ. Почему?
- [ ] Узел сломан
- [x] Сумма requests подов плюс запрос нового пода больше allocatable узла — планировщик смотрит на requests, а не на реальное потребление
- [ ] Нужно перезапустить kubelet
- [ ] Не хватает CPU
> Резервирование идёт по requests; реальная свободная память не учитывается.

### Статус ImagePullBackOff. Что проверить?
- [ ] Лимиты памяти
- [x] Имя и тег образа, доступ к registry и imagePullSecrets
- [ ] Readiness-пробу
- [ ] Селектор Service
> Kubelet не может скачать образ и повторяет попытки с нарастающей паузой.

### Service есть, а kubectl get endpoints для него пустой. Вероятные причины?
- [ ] Неверный targetPort
- [x] Селектор сервиса не совпадает с метками подов или поды не Ready
- [ ] Нет Ingress
- [ ] Сломан CoreDNS
> В endpoints попадают только готовые поды, совпавшие по селектору.

### Endpoints у сервиса есть, но запрос получает Connection refused. Что не так?
- [ ] Селектор сервиса
- [x] targetPort не совпадает с портом, который слушает контейнер
- [ ] Namespace
- [ ] Нет ReplicaSet
> Трафик доходит до пода, но на этом порту никто не слушает.

### Какой командой посмотреть метки подов рядом со статусом?
= kubectl get pods --show-labels
> Удобно сравнивать с колонкой SELECTOR у `kubectl get svc -o wide`.

### Под Running, READY 0/1, рестартов нет. Что не проходит?
- [ ] Liveness-проба
- [x] Readiness-проба
- [ ] Планирование
- [ ] Загрузка образа
> Readiness решает, получать ли трафик; при её провале контейнер не перезапускается.

### RESTARTS растёт, в describe «Liveness probe failed: connection refused». Что делает kubelet?
- [ ] Ничего, это предупреждение
- [x] Убивает и перезапускает контейнер после failureThreshold неудачных проверок
- [ ] Удаляет Deployment
- [ ] Переносит под на другой узел
> Liveness — «жив ли процесс»; провал = перезапуск контейнера.

### Как посмотреть логи контейнера, который уже упал и перезапустился?
= kubectl logs --previous
= kubectl logs -p
= kubectl logs имя --previous
> `--previous` — журнал предыдущего экземпляра контейнера.

### Статус CreateContainerConfigError. Что вероятнее всего?
- [ ] Опечатка в образе
- [x] Нет ConfigMap или Secret (или ключа), на которые ссылается под
- [ ] Не хватает памяти
- [ ] Сломан kube-proxy
> Контейнер не создать без конфигурации, на которую он ссылается.

### Как увидеть события всего namespace по времени?
- [ ] kubectl logs -n ns
- [x] kubectl get events -n ns --sort-by=.lastTimestamp
- [ ] kubectl top pods -n ns
- [ ] kubectl describe ns
> Хронология событий быстро показывает, что началось первым.

### Почему правка kubectl patch на живом кластере — временное решение?
- [ ] patch откатывается через час
- [x] Следующий деплой из Git (apply, Helm, Argo CD) вернёт старые значения
- [ ] patch не применяется к Deployment
- [ ] patch требует перезапуска узла
> Источник правды — манифесты в Git; исправление нужно внести туда.
