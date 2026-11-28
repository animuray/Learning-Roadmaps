---
title: GitOps
slug: gitops
description: GitOps по принципам OpenGitOps — декларативность, версии и неизменяемость, автоматическое вытягивание и постоянная сверка, pull-модель против push из CI, разделение репозиториев приложения и конфигурации, продвижение между окружениями, откат через git revert, дрейф и самовосстановление, секреты в GitOps, Argo CD и Flux.
duration: 60
level: Средний
quizSize: 10
materials:
  - title: OpenGitOps — GitOps Principles v1.0.0
    url: https://opengitops.dev/
    type: документация
  - title: OpenGitOps 1.0 announcement
    url: https://opengitops.dev/blog/1.0-announcement
    type: статья
  - title: Flux — Core Concepts
    url: https://fluxcd.io/flux/concepts
    type: документация
---

# GitOps

**GitOps** — способ управлять системами, при котором **желаемое состояние** (манифесты Kubernetes, Helm values, конфигурация) хранится в **Git**, а **агент внутри кластера** постоянно приводит реальность к этому состоянию. Изменить прод = сделать merge request.

## Четыре принципа (OpenGitOps 1.0)

1. **Декларативность** — желаемое состояние системы описано декларативно (YAML-манифесты, Helm, Kustomize), а не последовательностью команд.
2. **Версии и неизменяемость** — состояние хранится так, что есть полная история версий и их нельзя тихо подменить. Тег образа `latest` нарушает этот принцип: откатиться «на прошлую версию» невозможно — пишите конкретные теги или digest.
3. **Автоматическое вытягивание** — агенты сами забирают (pull) желаемое состояние из источника.
4. **Постоянная сверка (reconciliation)** — агенты непрерывно сравнивают фактическое состояние с желаемым и исправляют расхождения.

## Push против pull

```
 Push (классический CI/CD):
   git push ──► CI ──kubectl apply / helm upgrade──► кластер
                └─ CI хранит kubeconfig с правами на прод

 Pull (GitOps):
   git push ──► CI: тесты, сборка образа, push в registry, коммит нового тега в репо конфигурации
                                                         │
   кластер: агент (Argo CD / Flux) ──следит за──► репозиторий конфигурации ──► применяет изменения
```

| | Push | Pull (GitOps) |
| --- | --- | --- |
| Кто применяет | CI снаружи кластера | Агент внутри кластера |
| Доступ к кластеру | У CI (kubeconfig с широкими правами — желанная цель для атаки) | Кластер ходит в Git; снаружи доступ не нужен |
| Дрейф (ручной `kubectl edit`) | Не замечается до следующего деплоя | Обнаруживается и исправляется автоматически |
| Что в кластере сейчас | Нужно смотреть в кластер | Видно в Git (и в UI агента) |
| Откат | Перезапуск старого пайплайна | `git revert` |

GitOps не отменяет CI: CI по-прежнему тестирует, собирает и публикует образ. Меняется только последний шаг — вместо `kubectl apply` CI (или человек, или Image Updater) коммитит новую версию в репозиторий конфигурации.

## Репозитории

Частая схема — **два репозитория**:

- **app** — код приложения, Dockerfile, CI для сборки образа;
- **config / gitops** — манифесты или Helm values для всех окружений.

```
gitops/
├── apps/
│   └── shop/
│       ├── base/                 — общие манифесты (Kustomize)
│       └── overlays/
│           ├── dev/              — image: shop:1.8.0-rc1, replicas: 1
│           ├── staging/
│           └── prod/             — image: shop:1.7.3, replicas: 4
├── infrastructure/               — ingress-контроллер, cert-manager, мониторинг
└── clusters/
    ├── dev/                      — какие приложения ставить в какой кластер
    └── prod/
```

- **Продвижение** между окружениями — MR, который меняет тег образа в `overlays/staging` → `overlays/prod`. Ревью, история, понятно, кто и когда выкатил.
- Права: в prod-каталог merge только через ревью (protected branch, CODEOWNERS).
- Вместо веток на окружение (`dev`, `prod` ветки) обычно выбирают **каталоги** — ветки быстро расходятся.

## Что даёт GitOps

- **Аудит**: каждое изменение — коммит с автором, ревью и временем.
- **Откат**: `git revert` → агент возвращает прошлое состояние.
- **Самовосстановление**: кто-то поменял ресурс руками — агент вернёт как в Git (self-heal) или хотя бы покажет **OutOfSync**.
- **Восстановление кластера после аварии**: новый кластер + агент + тот же репозиторий = всё развернётся заново.
- **Безопасность**: нет внешнего доступа к API кластера из CI.

## Сложности

- **Секреты** нельзя класть в Git открытым текстом. Решения: **Sealed Secrets** (зашифрованный секрет в Git, расшифровывает контроллер в кластере), **SOPS** (шифрование значений в YAML ключами KMS/age, поддерживается Flux), **External Secrets Operator** (в Git — только ссылка, значение берётся из Vault или облачного хранилища секретов). Подробнее — в теме про Vault.
- Порядок развёртывания (CRD раньше ресурсов, база раньше приложения) — sync waves и зависимости.
- Не всё декларативно: миграции баз, разовые операции — Jobs/hooks.
- Много окружений и кластеров — нужен генератор (ApplicationSet, Kustomize overlays, Helm values).

## Инструменты

| | Argo CD | Flux |
| --- | --- | --- |
| Проект | CNCF graduated | CNCF graduated |
| Интерфейс | Богатый веб-UI, CLI | CLI, без собственного UI (есть сторонние) |
| Основные объекты | `Application`, `ApplicationSet`, `AppProject` | `GitRepository`/`OCIRepository` + `Kustomization`, `HelmRelease` |
| Особенности | Наглядность, SSO и RBAC, мультикластер из одного центра | Модульный GitOps Toolkit, SOPS из коробки, автообновление образов |

Терраформ тоже можно вести по GitOps-принципам (Atlantis, Flux Terraform controller), но чаще GitOps подразумевает Kubernetes.

## Практика

- [ ] Сформулировать своими словами четыре принципа OpenGitOps и для каждого найти, что нарушает его в текущем деплое вашего проекта
- [ ] Создать отдельный репозиторий конфигурации со структурой base и overlays для dev и prod на Kustomize
- [ ] Заменить в манифестах тег latest на конкретные версии образов
- [ ] Переделать CI приложения: после сборки образа он не делает kubectl apply, а создаёт коммит или MR с новым тегом в репозиторий конфигурации
- [ ] Настроить защиту каталога prod: изменения только через MR с ревью
- [ ] Выписать, какие секреты есть в проекте, и выбрать способ работы с ними в GitOps (Sealed Secrets, SOPS или External Secrets)

## Лаборатория

В кластере работает Argo CD, приложение **`shop`** уже развёрнуто из репозитория `git://<IP узла>/shop.git` (каталог `manifests/`) в namespace `lab-gitops`. Ваш клон репозитория — `~/shop-manifests`.

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

### Изменения — только через Git

Магазину нужно **3 реплики**. Сделайте это по-GitOps:

1. измените число реплик **в Git** (коммит и push в `main`) — не командами `kubectl` в кластере;
2. включите в приложении `shop` **самовосстановление** (selfHeal): ручная правка в кластере должна откатываться к состоянию из Git, и **удаление лишнего** (prune): ресурс, удалённый из Git, должен удаляться из кластера.

Argo CD опрашивает Git раз в 3 минуты — чтобы не ждать, попросите его обновиться (кнопка Refresh в интерфейсе или аннотация `argocd.argoproj.io/refresh=normal` на приложении).

```bash setup
lab_gitd
kubectl -n argocd delete application shop --ignore-not-found --wait=true >/dev/null 2>&1
kubectl delete ns lab-gitops --ignore-not-found --wait=true >/dev/null 2>&1
lab_shop_repo
ip=$(lab_node_ip)
cat <<EOF | kubectl apply -f - >/dev/null
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: shop
  namespace: argocd
spec:
  project: default
  source: {repoURL: "git://$ip/shop.git", targetRevision: main, path: manifests}
  destination: {server: "https://kubernetes.default.svc", namespace: lab-gitops}
  syncPolicy:
    automated: {}
    syncOptions: [CreateNamespace=true]
EOF
for i in $(seq 60); do [ "$(kubectl -n argocd get application shop -o jsonpath='{.status.sync.status}')" = Synced ] && break; sleep 1; done
```

```bash check
a=$(lab_argo_app shop) || fail "Приложения shop нет"
[ "$(echo "$a" | jq -r .spec.syncPolicy.automated.selfHeal)" = true ] || fail "Самовосстановление (selfHeal) не включено"
[ "$(echo "$a" | jq -r .spec.syncPolicy.automated.prune)" = true ] || fail "Удаление лишнего (prune) не включено"
r=$(git -C /srv/gitops/shop.git show main:manifests/app.yaml 2>/dev/null | python3 -c 'import sys,yaml; print([d for d in yaml.safe_load_all(sys.stdin) if d and d["kind"] == "Deployment"][0]["spec"]["replicas"])' 2>/dev/null)
[ "$r" = 3 ] || fail "В Git (ветка main) у Deployment shop реплик: ${r:-?}"
lab_argo_refresh shop
head=$(git -C /srv/gitops/shop.git rev-parse main)
for i in $(seq 40); do a=$(lab_argo_app shop); [ "$(echo "$a" | jq -r .status.sync.revision)" = "$head" ] && [ "$(echo "$a" | jq -r .status.sync.status)" = Synced ] && break; sleep 1; done
[ "$(echo "$a" | jq -r .status.sync.revision)" = "$head" ] || fail "Argo CD ещё не применил последний коммит из Git"
for i in $(seq 30); do [ "$(kubectl -n lab-gitops get deploy shop -o jsonpath='{.spec.replicas}')" = 3 ] && break; sleep 1; done
[ "$(kubectl -n lab-gitops get deploy shop -o jsonpath='{.spec.replicas}')" = 3 ] || fail "В кластере у shop не 3 реплики"
kubectl -n lab-gitops scale deploy shop --replicas=5 >/dev/null
for i in $(seq 40); do [ "$(kubectl -n lab-gitops get deploy shop -o jsonpath='{.spec.replicas}')" = 3 ] && break; sleep 1; done
[ "$(kubectl -n lab-gitops get deploy shop -o jsonpath='{.spec.replicas}')" = 3 ] || fail "Ручное изменение в кластере (5 реплик) не откатилось к Git"
ok "3 реплики из Git; ручная правка в кластере откатилась автоматически"
```

```text hint
1. Изменить число реплик в манифесте клона, закоммитить и отправить на сервер.
2. Политика автоматической синхронизации приложения принимает два флага: самовосстановление и удаление лишнего. Изменить приложение можно правкой его манифеста или патчем ресурса Application.
3. Попросить Argo CD обновить состояние из Git (аннотация) и дождаться синхронизации.
```

```bash solution
cd ~/shop-manifests
sed -i 's/replicas: 1/replicas: 3/' manifests/app.yaml
git commit -qam "shop: 3 replicas"
git push -q origin main
kubectl -n argocd patch application shop --type=merge -p '{"spec":{"syncPolicy":{"automated":{"selfHeal":true,"prune":true}}}}'
kubectl -n argocd annotate application shop argocd.argoproj.io/refresh=normal --overwrite
sleep 15
kubectl -n lab-gitops get deploy shop
```

```text review
Эталон: коммит с `replicas: 3` → push → `automated: {selfHeal: true, prune: true}` → refresh.

- **Git — единственный источник правды.** `kubectl edit` в проде при selfHeal откатится через секунды — и это правильно: правка, которой нет в Git, потеряется при следующем деплое и не прошла ревью.
- **prune** без опаски включают, когда всё описано в Git; иначе Argo удалит «чужие» ресурсы. Защитить конкретный ресурс: аннотация `argocd.argoproj.io/sync-options: Prune=false`.
- Откат в GitOps — `git revert` коммита: история изменений инфраструктуры = история Git (кто, когда, зачем, с ревью).
- Вместо опроса раз в 3 минуты настраивают webhook из GitLab/GitHub в Argo CD — синхронизация сразу после push.
- Секреты в GitOps-репозитории — только зашифрованными (Sealed Secrets, SOPS) или ссылками на внешнее хранилище (External Secrets Operator + Vault).
```

```text notes
kubectl\s+(-n\s+\S+\s+)?(scale|edit|patch)\s+(deploy|deployment)\b => Deployment правили командой kubectl напрямую — при включённом selfHeal Argo CD вернёт состояние из Git. Изменения — через коммит.
```

## Тест

### Какие четыре принципа GitOps определяет OpenGitOps?
- [x] Декларативность
- [x] Версии и неизменяемость
- [x] Автоматическое вытягивание (pull)
- [x] Постоянная сверка (reconciliation)
- [ ] Ручное применение изменений администратором
> Это версия 1.0 принципов, опубликованная в 2021 году.

### Чем pull-модель GitOps отличается от push-деплоя из CI?
- [x] В pull агент внутри кластера сам забирает желаемое состояние из Git и применяет его
- [x] В push CI снаружи выполняет kubectl apply или helm upgrade и хранит доступ к кластеру
- [ ] В pull не нужен CI для сборки образов
- [ ] Push безопаснее, потому что доступ к кластеру есть у всех
> CI в GitOps по-прежнему тестирует и собирает образы.

### Почему тег latest в манифестах нарушает принципы GitOps?
- [ ] Он не поддерживается Kubernetes
- [x] Состояние перестаёт быть версионированным: по Git нельзя понять, какая версия запущена, и откатиться на прошлую
- [ ] latest работает только в Docker Compose
- [ ] Он занимает больше места
> Используйте конкретные теги или digest образов.

### Как откатить неудачный релиз в GitOps?
- [ ] Удалить кластер
- [x] Сделать git revert коммита в репозитории конфигурации — агент вернёт прошлое состояние
- [ ] Выполнить kubectl edit вручную
- [ ] Перезапустить CI с начала
> История изменений хранится в Git.

### Что произойдёт, если кто-то изменит ресурс руками через kubectl edit в кластере под управлением GitOps?
- [ ] Ничего, изменение останется навсегда
- [x] Агент обнаружит расхождение с Git (OutOfSync) и при включённом самовосстановлении вернёт состояние из Git
- [ ] Git автоматически обновится
- [ ] Кластер перестанет работать
> Поэтому изменения делают через Git.

### Почему pull-модель безопаснее с точки зрения доступа к кластеру?
- [ ] Она шифрует все поды
- [x] CI не нужен kubeconfig с правами на прод: кластер сам обращается к Git, внешний доступ к API не требуется
- [ ] Она отключает RBAC
- [ ] Она не использует сеть
> Kubeconfig с широкими правами в CI — желанная цель для атаки.

### Как правильно хранить секреты в GitOps-репозитории?
- [ ] Открытым текстом в Secret-манифестах
- [x] Зашифрованными (Sealed Secrets, SOPS) или в виде ссылок на внешнее хранилище через External Secrets Operator
- [ ] В base64 — этого достаточно
- [ ] В README
> base64 — это кодирование, а не шифрование.

### Как обычно продвигают релиз из staging в prod в GitOps?
- [ ] Копируют образ вручную на узлы
- [x] Merge request, который меняет тег образа в каталоге prod репозитория конфигурации, с ревью
- [ ] Перезапускают кластер
- [ ] Меняют ветку по умолчанию
> Видно, кто, когда и что выкатил.

### Какие инструменты реализуют GitOps для Kubernetes?
- [x] Argo CD
- [x] Flux
- [ ] Jenkins без дополнительных инструментов
- [ ] Prometheus
> Оба — graduated-проекты CNCF.

### Какую роль играет CI в GitOps-процессе?
- [ ] Никакую, CI не нужен
- [x] Тестирует код, собирает и публикует образ, а затем обновляет версию в репозитории конфигурации вместо прямого деплоя
- [ ] Применяет манифесты в кластер через kubectl
- [ ] Хранит state кластера
> Деплой выполняет агент в кластере.

### Почему для окружений чаще используют каталоги, а не отдельные ветки?
- [ ] Ветки запрещены в GitOps
- [x] Ветки окружений быстро расходятся и их трудно сравнивать и сливать; каталоги в одной ветке наглядны и легко продвигаются через MR
- [ ] Каталоги быстрее клонируются
- [ ] Argo CD не умеет работать с ветками
> Различия окружений — в overlays или values.

### Как GitOps помогает восстановиться после потери кластера?
- [ ] Никак
- [x] Новый кластер с установленным агентом и тем же репозиторием конфигурации развернёт все приложения заново
- [ ] Восстанавливает данные баз автоматически
- [ ] Возвращает удалённые PV
> Данные в томах и базах всё равно нужно бэкапить отдельно.
