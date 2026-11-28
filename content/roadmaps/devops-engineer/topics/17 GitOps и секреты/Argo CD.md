---
title: Argo CD
slug: argo-cd
description: Argo CD на практике — архитектура, установка и первый вход, подключение репозитория, ресурс Application, статусы Synced, OutOfSync, Healthy и Degraded, автоматическая синхронизация с prune и selfHeal, sync waves и hooks, Helm и Kustomize через Argo, multiple sources, App of Apps и ApplicationSet, AppProject и RBAC, Image Updater, уведомления и эксплуатация.
duration: 120
level: Средний
quizSize: 10
materials:
  - title: Argo CD Docs — Getting Started
    url: https://argo-cd.readthedocs.io/en/stable/getting_started
    type: документация
  - title: Argo CD Docs — Cluster Bootstrapping (App of Apps)
    url: https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/
    type: документация
  - title: CNCF — Argo CD v3
    url: https://www.cncf.io/announcements/2025/04/01/cloud-native-computing-foundation-announces-argo-cd-v3-update-to-enhance-scalability-and-security-for-kubernetes/
    type: статья
  - title: Argo CD Docs — Upgrading 2.14 to 3.0
    url: https://argo-cd.readthedocs.io/en/stable/operator-manual/upgrading/2.14-3.0/
    type: документация
---

# Argo CD

**Argo CD** — GitOps-контроллер для Kubernetes (проект CNCF, graduated). Следит за Git-репозиторием (или Helm/OCI-репозиторием) и приводит кластер к описанному там состоянию; показывает всё в веб-интерфейсе. Текущая линейка — **3.x** (3.0 вышла в мае 2025 года; ветки 2.x больше не развиваются).

## Архитектура

| Компонент | Роль |
| --- | --- |
| **argocd-server** | API и веб-UI, SSO, RBAC |
| **repo-server** | Клонирует репозитории и **рендерит** манифесты (Helm, Kustomize, plain YAML) |
| **application-controller** | Сравнивает отрендеренное желаемое состояние с живым состоянием кластера и синхронизирует |
| **applicationset-controller** | Генерирует много Application по шаблону |
| **Redis**, **Dex** (SSO), **notifications-controller** | Кэш, вход через внешних провайдеров, уведомления |

## Установка и вход

```bash
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl -n argocd get pods
kubectl -n argocd port-forward svc/argocd-server 8080:443

argocd admin initial-password -n argocd
argocd login localhost:8080 --username admin --insecure
argocd account update-password
kubectl -n argocd delete secret argocd-initial-admin-secret
```

- `--server-side` нужен, потому что некоторые CRD Argo CD слишком велики для обычного client-side apply.
- Для продакшена закрепите **конкретную версию** в URL вместо `stable`, а лучше ставьте Helm-чартом `argo/argo-cd` (с HA-манифестами или values) — и затем управляйте самим Argo CD через Argo CD.
- Доступ: Ingress/Gateway с TLS, **SSO** (OIDC через GitLab, Keycloak), локального admin отключают.

Подключить приватный репозиторий:

```bash
argocd repo add git@gitlab.example.com:infra/gitops.git --ssh-private-key-path ~/.ssh/argocd_deploy
```

(или декларативно — Secret с меткой `argocd.argoproj.io/secret-type: repository`). Используйте **deploy key только на чтение**.

## Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: shop-prod
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: shop
  source:
    repoURL: git@gitlab.example.com:infra/gitops.git
    targetRevision: main
    path: apps/shop/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: shop-prod
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 5
      backoff:
        duration: 10s
        factor: 2
        maxDuration: 3m
```

- **source** — откуда брать (репозиторий, ревизия: ветка, тег или коммит, путь); **destination** — куда (кластер и namespace).
- **automated** — синхронизировать автоматически при изменении в Git. **prune** — удалять из кластера ресурсы, удалённые из Git. **selfHeal** — откатывать ручные изменения в кластере.
- Финализатор — при удалении Application удаляются и её ресурсы (каскадно).

## Статусы

| Sync | Смысл |
| --- | --- |
| **Synced** | Кластер совпадает с Git |
| **OutOfSync** | Есть расхождение: новый коммит или ручное изменение |

| Health | Смысл |
| --- | --- |
| **Healthy** | Ресурсы работают (Deployment раскатан, поды готовы) |
| **Progressing** | Идёт раскатка |
| **Degraded** | Ошибка: поды падают, превышен progressDeadline |
| **Missing** / **Suspended** | Ресурса нет / приостановлен |

«Synced, но Degraded» — манифесты применены, но приложение не работает (например, CrashLoopBackOff) — Argo CD не чинит ошибки самого приложения.

```bash
argocd app list
argocd app get shop-prod
argocd app diff shop-prod
argocd app sync shop-prod
argocd app history shop-prod
argocd app rollback shop-prod 12
```

Откат через `argocd app rollback` временно расходится с Git (и при `automated` невозможен) — правильный откат в GitOps — **`git revert`**.

## Порядок и хуки

- **Sync waves** — аннотация `argocd.argoproj.io/sync-wave: "-1"`: ресурсы с меньшей волной применяются раньше (CRD, namespace, секреты → база → приложение). Argo ждёт, пока волна станет Healthy.
- **Hooks** — `argocd.argoproj.io/hook: PreSync | Sync | PostSync | SyncFail`: например, Job с миграцией базы в `PreSync`, smoke-тест в `PostSync`.
- `ignoreDifferences` — не считать расхождением поля, которые меняет кто-то другой (например, `replicas` при HPA).

## Helm и Kustomize через Argo

Argo CD **рендерит** Helm-чарт сам (как `helm template`) и применяет результат — `helm list` релиза не покажет, управляет Argo.

Свой чарт из Git с values окружения:

```yaml
spec:
  source:
    repoURL: git@gitlab.example.com:infra/gitops.git
    targetRevision: main
    path: charts/shop
    helm:
      releaseName: shop
      valueFiles:
        - values-prod.yaml
      parameters:
        - name: image.tag
          value: "1.7.3"
```

Чарт из внешнего Helm-репозитория + values из своего Git (**multiple sources**):

```yaml
spec:
  sources:
    - repoURL: https://prometheus-community.github.io/helm-charts
      chart: kube-prometheus-stack
      targetRevision: <версия чарта>
      helm:
        valueFiles:
          - $values/infrastructure/monitoring/values-prod.yaml
    - repoURL: git@gitlab.example.com:infra/gitops.git
      targetRevision: main
      ref: values
```

Версию чарта закрепляйте точно (смотрите актуальную в Artifact Hub). Kustomize подхватывается автоматически, если в `path` есть `kustomization.yaml`.

## App of Apps и ApplicationSet

**App of Apps** — одна «корневая» Application указывает на каталог, где лежат **другие Application**. Применили корень — развернулось всё: инфраструктура, мониторинг, приложения. Так же Argo CD управляет **самим собой**.

```
gitops/
├── root.yaml                 — корневая Application → path: argocd-apps/prod
└── argocd-apps/prod/
    ├── ingress.yaml          — Application (sync-wave -2)
    ├── cert-manager.yaml     — Application (sync-wave -2)
    ├── monitoring.yaml       — Application (sync-wave -1)
    └── shop.yaml             — Application (sync-wave 0)
```

App of Apps — **инструмент администратора**: кто может пушить в репозиторий корня, тот создаёт Application в любом проекте. Защищайте этот репозиторий ревью.

**ApplicationSet** — генерирует Application по шаблону из **генераторов**: список, каталоги в Git, кластеры, MR (стенд на каждый merge request):

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: shop
  namespace: argocd
spec:
  goTemplate: true
  generators:
    - list:
        elements:
          - env: dev
            cluster: https://dev-k8s.example.com
          - env: prod
            cluster: https://prod-k8s.example.com
  template:
    metadata:
      name: "shop-{{.env}}"
    spec:
      project: shop
      source:
        repoURL: git@gitlab.example.com:infra/gitops.git
        targetRevision: main
        path: "apps/shop/overlays/{{.env}}"
      destination:
        server: "{{.cluster}}"
        namespace: "shop-{{.env}}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

Документация рекомендует ApplicationSet (в том числе генератор кластеров) как основной способ для типовых сценариев, App of Apps — как альтернативу.

## Проекты, права и прочее

- **AppProject** — граница для команды: из каких репозиториев можно брать, в какие кластеры и namespace деплоить, какие типы ресурсов разрешены (например, запретить ClusterRole), окна синхронизации (не деплоить в prod ночью в пятницу).
- **RBAC** (`argocd-rbac-cm`) — кто может смотреть, синхронизировать, удалять приложения проекта; группы из SSO.
- **Мультикластер**: один Argo CD управляет многими кластерами (`argocd cluster add`).
- **Argo CD Image Updater** — следит за registry и обновляет тег образа (коммитом в Git) — замыкает цикл CI → GitOps.
- **Notifications** — сообщения в Telegram/Slack о синхронизации и деградации.
- **Секреты**: Argo CD 3 рекомендует операторы секретов (External Secrets, Sealed Secrets), а не подстановку секретов плагинами при рендеринге.
- Мониторинг: метрики Argo CD в Prometheus (`argocd_app_info` с sync и health статусами), алерты на Degraded и OutOfSync дольше N минут.

## Практика

- [ ] Установить Argo CD в локальный кластер, войти в UI и CLI, сменить пароль admin и удалить initial-admin-secret
- [ ] Подключить свой репозиторий конфигурации через deploy key только на чтение
- [ ] Создать Application для своего приложения из Kustomize overlay dev с ручной синхронизацией, посмотреть diff и синхронизировать
- [ ] Включить automated с prune и selfHeal, изменить replicas через kubectl и увидеть самовосстановление; удалить манифест из Git и увидеть prune
- [ ] Выкатить новую версию через коммит с новым тегом образа и откатить через git revert
- [ ] Развернуть свой Helm chart через Argo CD с values-prod.yaml, а внешний чарт (например, мониторинга) — через multiple sources с values из своего репозитория
- [ ] Добавить PreSync-хук с Job миграции базы и sync waves для порядка развёртывания
- [ ] Собрать App of Apps: корневая Application разворачивает ingress-контроллер, cert-manager, мониторинг и приложение
- [ ] Переписать окружения dev и prod на ApplicationSet с генератором list
- [ ] Создать AppProject для команды с ограничением репозиториев и namespace

## Лаборатория

В кластере k3s установлен **Argo CD** (namespace `argocd`). Git-сервер на стенде отдаёт репозитории из `/srv/gitops` по адресу **`git://<IP узла>/<имя>.git`** (IP узла: `kubectl get nodes -o wide`, колонка INTERNAL-IP). Ваш клон репозитория манифестов — `~/shop-manifests`, отправка изменений — обычный `git push`.

```bash lib
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
# Git-сервер для Argo CD: git daemon отдаёт /srv/gitops по git://<IP узла>/; ученик пушит в репозитории по пути на диске
lab_node_ip() { kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'; }
lab_gitd() {
  mkdir -p /srv/gitops && chown student:student /srv/gitops
  [ "$(systemctl is-active lab-gitd 2>/dev/null)" = active ] && return
  systemctl reset-failed lab-gitd 2>/dev/null
  systemd-run -q --unit=lab-gitd -p User=student git daemon --reuseaddr --base-path=/srv/gitops --export-all /srv/gitops
  sleep 1
}
# lab_shop_repo — репозиторий манифестов /srv/gitops/shop.git: Deployment shop (1 реплика) и Service в каталоге manifests/
lab_shop_repo() {
  rm -rf /srv/gitops/shop.git /home/student/shop-manifests
  su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
  su - student -c 'git init -q --bare -b main /srv/gitops/shop.git && git clone -q /srv/gitops/shop.git ~/shop-manifests 2>/dev/null'
  mkdir -p /home/student/shop-manifests/manifests
  cat > /home/student/shop-manifests/manifests/app.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop
spec:
  replicas: 1
  selector:
    matchLabels:
      app: shop
  template:
    metadata:
      labels:
        app: shop
    spec:
      containers:
        - name: shop
          image: hashicorp/http-echo:1.0
          args: ["-text=shop via gitops"]
          ports:
            - containerPort: 5678
---
apiVersion: v1
kind: Service
metadata:
  name: shop
spec:
  selector:
    app: shop
  ports:
    - port: 80
      targetPort: 5678
EOF
  chown -R student:student /home/student/shop-manifests
  su - student -c 'cd ~/shop-manifests && git add -A && git commit -qm "Shop manifests" && git push -q origin main'
}
lab_argo_app() { kubectl -n argocd get application "$1" -o json 2>/dev/null; }
lab_argo_refresh() { kubectl -n argocd annotate application "$1" argocd.argoproj.io/refresh=normal --overwrite >/dev/null 2>&1; }
```

### Первое приложение в Argo CD

В репозитории `shop.git` в каталоге `manifests/` лежат Deployment и Service магазина. Создайте в Argo CD приложение **`shop`** (ресурс `Application` в namespace `argocd`, манифест — `~/k8s/argocd-shop.yaml`):

- источник — репозиторий `git://<IP узла>/shop.git`, ветка `main`, путь `manifests`;
- назначение — этот же кластер, namespace **`lab-gitops`** (Argo CD должен создать его сам);
- **автоматическая** синхронизация.

Приложение должно стать **Synced** и **Healthy**.

```bash setup
lab_gitd
kubectl -n argocd delete application shop --ignore-not-found --wait=true >/dev/null 2>&1
kubectl delete ns lab-gitops --ignore-not-found --wait=true >/dev/null 2>&1
lab_shop_repo
mkdir -p /home/student/k8s && chown student:student /home/student/k8s
rm -f /home/student/k8s/argocd-shop.yaml
```

```bash check
a=$(lab_argo_app shop) || fail "В Argo CD нет приложения shop"
[ -n "$a" ] || fail "В Argo CD нет приложения shop"
echo "$a" | jq -r .spec.source.repoURL | grep -qE '^git://[0-9.]+/shop\.git$' || fail "Источник приложения не git://<IP узла>/shop.git: $(echo "$a" | jq -r .spec.source.repoURL)"
[ "$(echo "$a" | jq -r .spec.source.path)" = manifests ] || fail "Путь в репозитории — $(echo "$a" | jq -r .spec.source.path)"
[ "$(echo "$a" | jq -r .spec.destination.namespace)" = lab-gitops ] || fail "Namespace назначения — $(echo "$a" | jq -r .spec.destination.namespace)"
echo "$a" | jq -e '.spec.syncPolicy.automated' >/dev/null || fail "Автоматическая синхронизация не включена"
for i in $(seq 40); do a=$(lab_argo_app shop); s=$(echo "$a" | jq -r .status.sync.status); h=$(echo "$a" | jq -r .status.health.status); [ "$s" = Synced ] && [ "$h" = Healthy ] && break; sleep 1; done
[ "$s" = Synced ] && [ "$h" = Healthy ] || fail "Приложение: sync=$s, health=$h. $(echo "$a" | jq -r '[.status.conditions[]?.message] | join("; ")' | cut -c1-200)"
kubectl -n lab-gitops get deploy shop >/dev/null 2>&1 || fail "В lab-gitops нет Deployment shop"
ok "shop: Synced, Healthy — Argo CD развернул манифесты из Git"
```

```text hint
1. Узнать IP узла кластера.
2. Ресурс Application: проект default, источник (адрес репозитория, ревизия, путь) и назначение (адрес API кластера изнутри — https://kubernetes.default.svc, namespace). В политике синхронизации — автоматический режим и опция «создать namespace».
3. Применить манифест и следить за статусом приложения (поля sync и health).
```

```bash solution
ip=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
mkdir -p ~/k8s
cat > ~/k8s/argocd-shop.yaml <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: shop
  namespace: argocd
spec:
  project: default
  source:
    repoURL: git://$ip/shop.git
    targetRevision: main
    path: manifests
  destination:
    server: https://kubernetes.default.svc
    namespace: lab-gitops
  syncPolicy:
    automated: {}
    syncOptions:
      - CreateNamespace=true
EOF
kubectl apply -f ~/k8s/argocd-shop.yaml
for i in $(seq 30); do kubectl -n argocd get application shop -o jsonpath='{.status.sync.status} {.status.health.status}{"\n"}'; sleep 2; done | tail -1
```

```text review
Эталон — в «Решении».

- Argo CD **сам тянет** состояние из Git и приводит к нему кластер (pull-модель): у CI нет доступа в кластер, а «что задеплоено» = «что в Git».
- **Synced** — кластер совпадает с Git; **Healthy** — ресурсы работают (поды Ready). OutOfSync без автосинхронизации — сигнал «кто-то поменял Git, но ещё не применили» или «кто-то поменял кластер руками».
- Приложения тоже описывают кодом: паттерн **App of Apps** или ApplicationSet (по приложению на каждый каталог или кластер).
- Источник может быть каталогом манифестов, Helm-чартом (`helm.valueFiles`) или Kustomize — Argo CD отрендерит его сам.
```

## Тест

### Какой компонент Argo CD рендерит манифесты из Helm и Kustomize?
- [ ] argocd-server
- [x] repo-server
- [ ] Redis
- [ ] Dex
> Сравнением с кластером и синхронизацией занимается application-controller.

### Как получить начальный пароль администратора Argo CD?
- [ ] Он пустой
- [x] Командой argocd admin initial-password -n argocd (или из секрета argocd-initial-admin-secret)
- [ ] Он равен имени кластера
- [ ] Его присылают на почту
> После смены пароля секрет argocd-initial-admin-secret удаляют.

### Что делают prune и selfHeal в syncPolicy.automated?
- [x] prune удаляет из кластера ресурсы, которые удалили из Git
- [x] selfHeal возвращает состояние из Git, если ресурс изменили вручную в кластере
- [ ] prune удаляет старые образы из registry
- [ ] selfHeal перезапускает упавшие поды
> Перезапуском подов занимается сам Kubernetes.

### Что означает статус OutOfSync?
- [ ] Приложение не работает
- [x] Живое состояние кластера отличается от желаемого в Git — новый коммит или ручное изменение
- [ ] Репозиторий недоступен
- [ ] Кластер выключен
> Health-статус (Healthy, Degraded) показывает работоспособность отдельно.

### Приложение в статусе Synced, но Degraded. Что это значит?
- [ ] Всё в порядке
- [x] Манифесты из Git применены, но ресурсы не работают — например, поды в CrashLoopBackOff
- [ ] Argo CD не может подключиться к Git
- [ ] Идёт синхронизация
> Argo CD применяет конфигурацию, но не исправляет ошибки самого приложения.

### Как правильно откатить релиз в Argo CD с включённой автосинхронизацией?
- [ ] argocd app rollback и забыть
- [x] Сделать git revert коммита в репозитории конфигурации
- [ ] Удалить Application
- [ ] Изменить Deployment через kubectl edit
> Ручной откат разойдётся с Git, и автосинхронизация вернёт новую версию.

### Как задать порядок применения ресурсов при синхронизации?
- [ ] По алфавиту имён файлов
- [x] Аннотацией argocd.argoproj.io/sync-wave: ресурсы с меньшим номером волны применяются раньше
- [ ] Через replicas
- [ ] Порядок задать нельзя
> Для миграций и проверок используют hooks PreSync и PostSync.

### Как Argo CD разворачивает Helm-чарт?
- [ ] Выполняет helm install, и релиз виден в helm list
- [x] Сам рендерит чарт как helm template и применяет манифесты, управляя ими как Application
- [ ] Не поддерживает Helm
- [ ] Только через Helm-плагин в CI
> Values окружения задаются через valueFiles или parameters.

### Что такое паттерн App of Apps?
- [ ] Приложение из нескольких контейнеров
- [x] Корневая Application, которая указывает на каталог с другими Application — применив её, разворачивают все приложения кластера
- [ ] Helm-зависимости
- [ ] Резервная копия Argo CD
> Так Argo CD может управлять и самим собой.

### Почему App of Apps называют инструментом администратора?
- [ ] Его может создать только root в Linux
- [x] Кто может изменять репозиторий корневой Application, тот может создавать Application в любых проектах — это права уровня администратора
- [ ] Он работает только в namespace default
- [ ] Он отключает RBAC
> Репозиторий корня защищают ревью и ограниченным доступом на запись.

### Для чего нужен ApplicationSet?
- [ ] Для хранения секретов
- [x] Для генерации множества Application по шаблону из генераторов: список окружений, каталоги в Git, кластеры, merge request
- [ ] Для бэкапа кластера
- [ ] Для сборки образов
> Документация Argo CD рекомендует его для типовых сценариев многих кластеров и окружений.

### Что ограничивает AppProject?
- [x] Из каких репозиториев можно брать манифесты
- [x] В какие кластеры и namespace можно деплоить и какие типы ресурсов разрешены
- [ ] Размер Docker-образов
- [ ] Число коммитов в день
> Плюс роли и окна синхронизации для команды.

### Какой подход к секретам рекомендует Argo CD 3?
- [ ] Хранить их открытым текстом в Git
- [x] Использовать операторы секретов (External Secrets Operator, Sealed Secrets), а не подстановку секретов плагинами при рендеринге
- [ ] Передавать секреты через параметры Helm в Application
- [ ] Хранить секреты в Redis Argo CD
> Так секреты не попадают в кэш и манифесты, которые рендерит repo-server.
