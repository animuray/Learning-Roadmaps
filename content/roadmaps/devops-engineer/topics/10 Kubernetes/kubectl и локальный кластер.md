---
title: kubectl и локальный кластер
slug: kubectl-i-lokalnyj-klaster
description: Локальные кластеры Minikube, kind и k3d, kubeconfig и контексты, основные команды kubectl — get, describe, logs, exec, apply, delete, port-forward — вывод в YAML и JSONPath, explain и dry-run.
duration: 90
level: Основы
quizSize: 10
materials:
  - title: Kubernetes Docs — kubectl Quick Reference
    url: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
    type: документация
  - title: kind — Quick Start
    url: https://kind.sigs.k8s.io/docs/user/quick-start/
    type: документация
  - title: Kubernetes Docs — Debug Running Pods
    url: https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/
    type: документация
---

# kubectl и локальный кластер

## Локальный кластер

| Инструмент | Как работает | Когда удобен |
| --- | --- | --- |
| **kind** | Ноды кластера — Docker-контейнеры, внутри — настоящий kubeadm | Быстро, мультинодовый кластер, CI. Используется для тестов самого Kubernetes |
| **Minikube** | ВМ или контейнер, много аддонов (`minikube addons enable ingress`) | Учёба, нужны аддоны |
| **k3d** | Обёртка над **k3s** (лёгкий дистрибутив) в Docker | Очень быстро и легко, встроенный балансировщик |
| Docker Desktop / Rancher Desktop | Встроенный кластер | Если уже стоят |

```bash
kind create cluster --name dev
cat > kind-3nodes.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF
kind create cluster --name lab --config kind-3nodes.yaml
kind load docker-image myapp:0.1 --name lab    # положить локальный образ в кластер
kind delete cluster --name lab

minikube start --nodes 2
k3d cluster create dev --agents 2
```

## kubeconfig и контексты

kubectl читает `~/.kube/config` (или файл из `$KUBECONFIG`): **кластеры** (адрес API, CA), **пользователи** (сертификат или токен) и **контексты** (кластер + пользователь + namespace по умолчанию).

```bash
kubectl config get-contexts
kubectl config use-context kind-lab
kubectl config set-context --current --namespace=dev
kubectl cluster-info
```

> [!warning] Не тот контекст
> Самая дорогая ошибка — выполнить `delete` в проде, думая, что вы в dev. Держите контекст в приглашении shell (kube-ps1), используйте kubectx/kubens, разные kubeconfig для прода.

## Чтение: get, describe, logs

```bash
kubectl get pods                         # в текущем namespace
kubectl get pods -n kube-system
kubectl get pods -A                      # во всех namespaces
kubectl get pods -o wide                 # IP пода и нода
kubectl get pods -l app=web              # по метке
kubectl get pods -w                      # следить за изменениями
kubectl get deploy,svc,ingress
kubectl get pod web-7d9f -o yaml         # полный объект со status
kubectl get pods -o jsonpath='{.items[*].spec.containers[*].image}'
kubectl get events --sort-by=.metadata.creationTimestamp

kubectl describe pod web-7d9f            # подробности и СОБЫТИЯ внизу — первое, что смотреть при проблемах
kubectl describe node worker-1

kubectl logs web-7d9f                    # логи контейнера
kubectl logs web-7d9f -c sidecar         # конкретного контейнера в поде
kubectl logs web-7d9f --previous         # предыдущего экземпляра (после краша)
kubectl logs -f deploy/web               # следить, по Deployment
kubectl logs -l app=web --tail=50

kubectl top pods                         # CPU/память (нужен metrics-server)
kubectl top nodes
```

## Изменение: apply и компания

```bash
kubectl apply -f deployment.yaml         # создать или обновить (декларативно) — основной способ
kubectl apply -f k8s/                    # все манифесты каталога
kubectl diff -f deployment.yaml          # что изменится
kubectl delete -f deployment.yaml
kubectl delete pod web-7d9f

kubectl create deployment web --image=nginx --replicas=2 --dry-run=client -o yaml > deploy.yaml
kubectl create configmap app --from-literal=MODE=prod
kubectl create secret generic db --from-literal=password=s3cr3t

kubectl scale deploy web --replicas=5
kubectl set image deploy/web web=nginx:1.27
kubectl rollout status deploy/web
kubectl rollout undo deploy/web
kubectl edit deploy web                  # правка в редакторе — удобно для экспериментов, но не для прода
kubectl label pod web-7d9f tier=frontend
```

`--dry-run=client -o yaml` — генератор заготовок манифестов: не пишите YAML с нуля.

## Доступ внутрь

```bash
kubectl exec -it web-7d9f -- sh
kubectl exec web-7d9f -- env
kubectl port-forward svc/web 8080:80                    # localhost:8080 → сервис в кластере
kubectl run tmp --rm -it --image=busybox:1.36 -- sh     # одноразовый под для отладки сети
kubectl debug -it web-7d9f --image=busybox:1.36 --target=web   # отладочный контейнер в работающем поде
kubectl cp web-7d9f:/etc/nginx/nginx.conf ./nginx.conf
```

## Справка

```bash
kubectl explain deployment.spec.strategy
kubectl explain pod.spec.containers.resources --recursive
kubectl api-resources                    # все типы объектов, сокращения (po, deploy, svc, cm…)
kubectl auth can-i delete pods -n prod
```

Полезно: автодополнение (`source <(kubectl completion bash)`), алиас `alias k=kubectl`, плагины через **krew**, TUI **k9s**.

## Практика

- [ ] Поставить kubectl и kind, создать кластер из одной control-plane и двух worker-нод
- [ ] Посмотреть контексты, переключить namespace по умолчанию на `dev`
- [ ] Сгенерировать манифест Deployment через `kubectl create ... --dry-run=client -o yaml`, применить, масштабировать до 3 и посмотреть `-o wide`
- [ ] Найти поды по метке, вывести образы всех подов через `jsonpath`
- [ ] Специально указать несуществующий образ и разобрать ошибку через `describe` (раздел Events)
- [ ] Открыть приложение через `port-forward`, зайти в под через `exec`, запустить одноразовый `busybox` для проверки DNS
- [ ] Посмотреть `kubectl explain` для полей Deployment и `kubectl api-resources`
- [ ] Установить k9s и пройтись по ресурсам кластера

## Лаборатория

На стенде работает одноузловой кластер **k3s**. `kubectl` у ученика уже настроен (`~/.kube/config`): `kubectl get nodes`.

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

### Найти под и прочитать его логи

В namespace **`lab-shop`** работает несколько подов. Под сервиса оплаты помечен меткой **`app=payments`**. При запуске он пишет в лог строку с номером транзакции вида `txn=...`. Найдите под **по метке** и запишите номер транзакции (то, что после `txn=`) в `~/txn.txt`.

```bash setup
lab_kns lab-shop
txn=$(tr -dc A-Z0-9 </dev/urandom | head -c 10)
echo "$txn" > /var/lib/lab/k8s-txn
for app in catalog cart payments delivery; do
  msg="service $app started"; [ $app = payments ] && msg="payments ready txn=$txn"
  kubectl -n lab-shop run $app-$(tr -dc a-z0-9 </dev/urandom | head -c 5) --image=busybox:1.36 --labels=app=$app --restart=Never \
    --command -- sh -c "echo '$msg'; sleep 100000" >/dev/null
done
lab_kready lab-shop app=payments
rm -f /home/student/txn.txt
```

```bash check
want=$(cat /var/lib/lab/k8s-txn)
[ -f /home/student/txn.txt ] || fail "Нет ~/txn.txt"
got=$(tr -d '[:space:]' < /home/student/txn.txt); got=${got#txn=}
[ "$got" = "$want" ] || fail "В ~/txn.txt «$got» — это не номер транзакции из лога пода payments"
ok "txn=$want"
```

```text hint
1. Список подов в namespace с фильтром по метке; имена подов случайные — по имени их не угадать.
2. Логи можно смотреть по имени пода, а можно сразу по метке.
3. Namespace указывается ключом во всех командах — иначе kubectl ищет в default.
```

```bash solution
kubectl -n lab-shop get pods --show-labels
kubectl -n lab-shop logs -l app=payments
kubectl -n lab-shop logs -l app=payments | grep -o 'txn=[A-Z0-9]*' | cut -d= -f2 > ~/txn.txt
```

```text review
Эталон: `kubectl -n lab-shop logs -l app=payments`.

- Метки (labels) — главный способ выбирать объекты: `-l app=payments`, `-l 'env in (prod,stage)'`, `-l '!canary'`. Ими же Service и Deployment находят свои поды.
- Логи: `-f` — следить, `--previous` — лог предыдущего, упавшего контейнера (главное при CrashLoopBackOff), `-c` — конкретный контейнер в поде, `--since=10m`, `--tail=100`.
- Шпаргалка: `get` (список), `describe` (подробно + события — первое при проблемах), `logs`, `exec -it ... -- sh`, `apply -f`, `delete`, `explain pod.spec.containers` (документация по полям).
```

### Namespace по умолчанию

Каждый раз писать `-n lab-dev` утомительно. Сделайте так, чтобы в **текущем контексте** kubectl namespace по умолчанию был **`lab-dev`**: команда `kubectl get pods` без `-n` должна показывать поды из `lab-dev`.

```bash setup
lab_kns lab-dev
kubectl -n lab-dev run devbox --image=busybox:1.36 --restart=Never --command -- sleep 100000 >/dev/null
su - student -c 'kubectl config set-context --current --namespace=default' >/dev/null
```

```bash check
ns=$(su - student -c "kubectl config view --minify -o jsonpath='{..namespace}'" 2>/dev/null)
[ "$ns" = lab-dev ] || fail "Namespace текущего контекста — «${ns:-default}»"
su - student -c 'kubectl get pods --no-headers' 2>/dev/null | grep -q devbox || fail "kubectl get pods без -n не показывает поды lab-dev"
ok "контекст $(su - student -c 'kubectl config current-context'): namespace lab-dev"
```

```text hint
1. Настройки подключения хранятся в kubeconfig: кластеры, пользователи и контексты (кластер + пользователь + namespace).
2. У подкоманды config есть способ изменить текущий контекст — задать в нём namespace.
3. Проверить: вывести урезанный конфиг только для текущего контекста.
```

```bash solution
kubectl config get-contexts
kubectl config set-context --current --namespace=lab-dev
kubectl get pods
```

```text review
Эталон: `kubectl config set-context --current --namespace=lab-dev`.

- Контекст = кластер + пользователь + namespace. Переключение между кластерами: `kubectl config use-context prod` — опасная операция: легко выполнить команду «не в том кластере». Многие выводят контекст в приглашение оболочки (kube-ps1) и красят прод красным.
- Удобные утилиты: `kubectx` и `kubens`, `k9s` — консольный интерфейс к кластеру.
- Несколько kubeconfig: `KUBECONFIG=~/.kube/dev:~/.kube/prod` — kubectl склеит их.
```

```text notes
alias\s+k(ubectl)?= => Сделан алиас с -n — работает, но namespace в контексте видят все инструменты (helm, k9s), а алиас — только оболочка.
```

## Тест

### Чем kind отличается от Minikube?
- [x] kind запускает ноды кластера как Docker-контейнеры и легко создаёт мультинодовые кластеры
- [x] Minikube может работать в ВМ и имеет удобные аддоны
- [ ] kind работает только в облаке
- [ ] Minikube не поддерживает kubectl
> k3d — ещё один вариант на базе лёгкого дистрибутива k3s.

### Где kubectl по умолчанию ищет настройки подключения к кластеру?
= ~/.kube/config
= kubeconfig
> Другой файл можно указать в переменной KUBECONFIG или флагом --kubeconfig.

### Что такое контекст в kubeconfig?
- [ ] Namespace
- [x] Сочетание кластера, пользователя и namespace по умолчанию
- [ ] Версия Kubernetes
- [ ] Набор манифестов
> Переключение — kubectl config use-context.

### Под в статусе ImagePullBackOff. Какая команда первой покажет причину?
- [ ] kubectl logs pod
- [x] kubectl describe pod — в разделе Events будет ошибка скачивания образа
- [ ] kubectl top pod
- [ ] kubectl get nodes
> Контейнер не запустился, поэтому логов у него ещё нет.

### Как посмотреть логи контейнера до его последнего перезапуска (после краша)?
- [ ] kubectl logs pod -f
- [x] kubectl logs pod --previous
- [ ] kubectl describe pod --logs
- [ ] kubectl get pod -o logs
> Текущий экземпляр мог только что стартовать и ещё ничего не написать.

### Как увидеть, на какой ноде и с каким IP работает под?
= kubectl get pods -o wide
= -o wide
> Полный объект — -o yaml.

### Почему kubectl apply -f считается основным способом управления?
- [ ] Он работает быстрее
- [x] Он декларативный: создаёт или обновляет объекты по манифестам, которые хранятся в Git
- [ ] Он не требует прав
- [ ] Он удаляет старые объекты
> kubectl edit и императивные команды удобны для экспериментов, но изменения теряются.

### Как быстро сгенерировать заготовку манифеста Deployment?
- [ ] kubectl explain deployment
- [x] kubectl create deployment web --image=nginx --dry-run=client -o yaml
- [ ] kubectl get deployment --template
- [ ] kubectl apply --generate
> Затем заготовку дорабатывают и сохраняют в Git.

### Как открыть сервис кластера на своём компьютере без Ingress?
- [ ] kubectl exec svc/web
- [x] kubectl port-forward svc/web 8080:80
- [ ] kubectl expose localhost
- [ ] kubectl proxy-pass
> Трафик идёт через API server — удобно для отладки, но не для продакшена.

### Какая команда объясняет поля ресурса прямо в терминале?
= kubectl explain
> Например, kubectl explain deployment.spec.strategy.

### Как вывести поды всех namespaces?
- [x] kubectl get pods -A
- [x] kubectl get pods --all-namespaces
- [ ] kubectl get pods -n all
- [ ] kubectl get pods --global
> -n имя выбирает конкретный namespace.

### Как проверить, есть ли у вас право удалять поды в namespace prod?
- [ ] kubectl get rbac
- [x] kubectl auth can-i delete pods -n prod
- [ ] kubectl describe user
- [ ] kubectl check delete
> Ответ — yes или no.

### Как загрузить локально собранный образ в кластер kind без реестра?
- [ ] docker push kind
- [x] kind load docker-image myapp:0.1 --name имя_кластера
- [ ] kubectl import image
- [ ] Это невозможно
> Ноды kind — отдельные контейнеры со своим containerd и не видят образы Docker хоста.
