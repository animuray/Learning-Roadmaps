---
title: RBAC
slug: rbac
description: Аутентификация и авторизация в Kubernetes, Role и ClusterRole, RoleBinding и ClusterRoleBinding, ServiceAccount и токены подов, проверка прав через kubectl auth can-i, принцип наименьших привилегий и опасные права.
duration: 60
level: Средний
quizSize: 10
materials:
  - title: Kubernetes Docs — Using RBAC Authorization
    url: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
    type: документация
  - title: Kubernetes Docs — kubectl Quick Reference
    url: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
    type: документация
---

# RBAC

Каждый запрос к API server проходит три этапа:

1. **Аутентификация** — кто вы? Клиентский сертификат из kubeconfig, токен ServiceAccount, OIDC (вход через корпоративный SSO), облачный IAM. **Пользователей как объектов в Kubernetes нет** — есть только имена и группы из сертификата или токена.
2. **Авторизация** — что вам можно? Обычно **RBAC** (Role-Based Access Control).
3. **Admission** — можно ли создать именно такой объект? Проверки и изменения объектов (лимиты, политики безопасности, Kyverno/Gatekeeper).

## Объекты RBAC

| Объект | Область | Что делает |
| --- | --- | --- |
| **Role** | Namespace | Набор разрешений в одном namespace |
| **ClusterRole** | Кластер | Разрешения на ресурсы кластера (nodes, PV, namespaces) или шаблон для любых namespace |
| **RoleBinding** | Namespace | Выдаёт Role (или ClusterRole) субъектам **в этом namespace** |
| **ClusterRoleBinding** | Кластер | Выдаёт ClusterRole **во всём кластере** |

Субъекты: `User`, `Group`, `ServiceAccount`.

Разрешения **только разрешающие** — запрещающих правил нет. Всё, что не разрешено, запрещено.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: prod
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ci-deployer
  namespace: prod
subjects:
  - kind: ServiceAccount
    name: gitlab-deployer
    namespace: prod
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io
```

- `apiGroups: [""]` — основная группа API (pods, services, configmaps, secrets); `apps` — deployments, statefulsets; `batch` — jobs; `networking.k8s.io` — ingresses, networkpolicies.
- `verbs`: `get`, `list`, `watch`, `create`, `update`, `patch`, `delete`, `deletecollection`; `*` — всё.
- Подресурсы: `pods/log`, `pods/exec`, `deployments/scale`.
- `roleRef` у binding **нельзя изменить** — только пересоздать.

### RoleBinding + ClusterRole

Частый приём: одна ClusterRole как шаблон (`view`, `edit`, `admin`, или своя) и RoleBinding в нужных namespace — права действуют **только в namespace биндинга**.

Встроенные ClusterRole: **`cluster-admin`** (всё), **`admin`** (почти всё в namespace, включая RBAC), **`edit`** (изменять ресурсы, без RBAC), **`view`** (только чтение, без секретов).

## ServiceAccount

**ServiceAccount** — учётная запись для **программ** в кластере: подов, CI, операторов, контроллеров.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app
  namespace: prod
automountServiceAccountToken: false
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: prod
spec:
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      serviceAccountName: app
      containers:
        - name: app
          image: registry.example.com/app:1.4.2
```

- У каждого namespace есть ServiceAccount `default`; поды без `serviceAccountName` используют его.
- В под монтируется **короткоживущий токен** (`/var/run/secrets/kubernetes.io/serviceaccount/token`), автоматически обновляемый. Если приложению не нужен API Kubernetes — отключите монтирование (`automountServiceAccountToken: false`).
- Токен для внешних систем (CI): `kubectl create token gitlab-deployer -n prod --duration=1h`.
- В облаках ServiceAccount связывают с облачными ролями (Workload Identity / IRSA) — без статических ключей.

## Проверка прав

```bash
kubectl auth can-i create deployments -n prod
kubectl auth can-i '*' '*' --all-namespaces
kubectl auth can-i list secrets -n prod --as=system:serviceaccount:prod:app
kubectl auth can-i --list -n prod
kubectl get rolebindings,clusterrolebindings -A -o wide | grep gitlab-deployer
```

## Опасные права

Некоторые права фактически дают **полный контроль**:

- `create pods` (или deployments и т. п.) в namespace — можно запустить под с любым ServiceAccount этого namespace и смонтировать его секреты;
- `get/list secrets` — доступ ко всем паролям и токенам namespace;
- `pods/exec` — выполнение команд в чужих контейнерах;
- `escalate`, `bind`, `impersonate` — выдать себе больше прав;
- создание привилегированных подов, `hostPath: /` — выход на ноду (закрывается Pod Security Admission: уровни `baseline`/`restricted`).

**Принцип наименьших привилегий:** отдельный ServiceAccount на каждое приложение и CI, только нужные verbs и ресурсы, Role вместо ClusterRole, `cluster-admin` — только людям-администраторам и в крайних случаях. Регулярно проверяйте, кому что выдано.

## Практика

- [ ] Посмотреть встроенные ClusterRole `view`, `edit`, `admin` (`kubectl describe clusterrole edit`)
- [ ] Создать ServiceAccount `ci` в namespace `dev`, Role с правами на Deployments и RoleBinding
- [ ] Проверить права через `kubectl auth can-i ... --as=system:serviceaccount:dev:ci`: в `dev` — да, в `default` — нет
- [ ] Выпустить токен через `kubectl create token`, собрать отдельный kubeconfig и выполнить `kubectl get deploy -n dev` от имени ci
- [ ] Выдать ClusterRole `view` через RoleBinding в одном namespace и убедиться, что права не распространяются на другие
- [ ] Из пода с ServiceAccount по умолчанию попробовать обратиться к API (`curl` с токеном) и получить 403; затем отключить automountServiceAccountToken
- [ ] Включить Pod Security Admission `restricted` на namespace и попробовать создать привилегированный под

## Лаборатория

Кластер — k3s на стенде. Проверить права от чужого имени: `kubectl auth can-i <действие> <ресурс> -n <ns> --as=<кто>`.

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

### Учётная запись для деплоя

CI-системе нужен доступ к namespace **`lab-rbac`**, но не ко всему кластеру. Создайте:

- ServiceAccount **`ci-deployer`** в `lab-rbac`;
- Role **`deployer`**: читать (`get`, `list`, `watch`) **поды** и **логи подов**; создавать и обновлять (`get`, `list`, `create`, `update`, `patch`) **Deployment**;
- RoleBinding **`ci-deployer`**, связывающую их.

Ни удалять Deployment, ни читать Secret, ни что-либо делать в других namespace учётная запись не должна.

```bash setup
lab_kns lab-rbac
lab_kns lab-other
```

```bash check
sa=system:serviceaccount:lab-rbac:ci-deployer
kubectl -n lab-rbac get sa ci-deployer >/dev/null 2>&1 || fail "ServiceAccount ci-deployer нет"
can() { kubectl auth can-i "$1" "$2" -n "$3" --as=$sa 2>/dev/null; }
for a in "get pods" "list pods" "watch pods" "get pods/log" "create deployments.apps" "patch deployments.apps" "update deployments.apps"; do
  [ "$(can $a lab-rbac)" = yes ] || fail "ci-deployer не может: $a в lab-rbac"
done
[ "$(can delete deployments.apps lab-rbac)" = no ] || fail "ci-deployer может удалять Deployment"
[ "$(can get secrets lab-rbac)" = no ] || fail "ci-deployer может читать Secret"
[ "$(can create pods lab-rbac)" = no ] || fail "ci-deployer может создавать поды напрямую"
[ "$(can list pods lab-other)" = no ] || fail "ci-deployer видит поды в другом namespace"
kubectl get clusterrolebinding -o json | jq -e --arg s ci-deployer '.items[] | select(.subjects[]? | .name == $s)' >/dev/null && fail "Права выданы на весь кластер (ClusterRoleBinding)"
ok "ci-deployer: только нужное и только в lab-rbac"
```

```text hint
1. Учётная запись сервиса, роль и привязка — три объекта в одном namespace. Роль и привязку можно создать командами kubectl create с ключами глаголов, ресурсов и субъекта.
2. Логи пода — отдельный подресурс (через косую черту). Deployment — ресурс группы apps.
3. Проверить каждое действие от имени учётной записи: её полное имя начинается с system:serviceaccount.
```

```bash solution
kubectl -n lab-rbac create serviceaccount ci-deployer
kubectl -n lab-rbac create role deployer \
  --verb=get,list,watch --resource=pods,pods/log
kubectl -n lab-rbac get role deployer -o json \
  | jq '.rules += [{"apiGroups": ["apps"], "resources": ["deployments"], "verbs": ["get", "list", "create", "update", "patch"]}]' \
  | kubectl apply -f -
kubectl -n lab-rbac create rolebinding ci-deployer --role=deployer --serviceaccount=lab-rbac:ci-deployer
kubectl auth can-i --list -n lab-rbac --as=system:serviceaccount:lab-rbac:ci-deployer
```

```text review
Эталон: ServiceAccount + Role (правила по `apiGroups`/`resources`/`verbs`) + RoleBinding.

- **Role/RoleBinding** — права в одном namespace; **ClusterRole/ClusterRoleBinding** — на весь кластер (или ClusterRole + RoleBinding — один набор правил, выданный в нескольких namespace).
- Принцип наименьших прав: CI не нужно удалять Deployment и читать Secret. `kubectl auth can-i --list --as=...` — проверить, что именно разрешено.
- Права **только добавляются**, запрещающих правил нет. Осторожно с `*` в verbs и resources и с правами на `secrets`, `pods/exec`, `rolebindings` — через них можно повысить себе права.
- Токен ServiceAccount для CI: `kubectl create token ci-deployer --duration=1h` (короткоживущий). Ещё лучше — OIDC из GitLab/GitHub в облачный кластер без хранимых токенов.
```

```text notes
clusterrolebinding|cluster-admin => Использовались кластерные права — для доступа к одному namespace хватает Role и RoleBinding.
```

## Тест

### Чем Role отличается от ClusterRole?
- [x] Role действует в пределах одного namespace
- [x] ClusterRole действует на уровне кластера и может описывать ресурсы вне namespace, например nodes
- [ ] ClusterRole нельзя использовать в RoleBinding
- [ ] Role может запрещать действия
> RBAC-правила только разрешающие.

### Что делает RoleBinding, ссылающийся на ClusterRole?
- [ ] Выдаёт права во всём кластере
- [x] Выдаёт права из ClusterRole, но только в namespace этого RoleBinding
- [ ] Ничего, это ошибка
- [ ] Удаляет ClusterRole
> Так одну роль-шаблон используют во многих namespace.

### Можно ли в RBAC явно запретить действие?
- [ ] Да, через verbs: deny
- [x] Нет: правила только разрешающие, всё не разрешённое запрещено
- [ ] Да, через ClusterRoleBinding
- [ ] Только для секретов
> Поэтому важно не выдавать лишнего.

### Что такое ServiceAccount?
- [ ] Пользователь Linux на ноде
- [x] Учётная запись для программ в кластере — подов, CI, контроллеров, — от имени которой они обращаются к API
- [ ] Учётная запись администратора облака
- [ ] Тип Secret
> Пользователей-людей Kubernetes как объектов не хранит.

### Какой ServiceAccount используют поды, если serviceAccountName не указан?
= default
> ServiceAccount default есть в каждом namespace.

### Как проверить, может ли ServiceAccount app из namespace prod читать секреты?
- [ ] kubectl get rbac app
- [x] kubectl auth can-i get secrets -n prod --as=system:serviceaccount:prod:app
- [ ] kubectl describe sa app --permissions
- [ ] kubectl check secrets
> --list покажет все права.

### Почему право create pods в namespace опасно?
- [ ] Поды занимают место
- [x] Можно создать под с любым ServiceAccount этого namespace, смонтировать секреты и получить их права
- [ ] Это право позволяет удалить кластер
- [ ] Оно не опасно
> Опасны также get secrets, pods/exec, escalate, bind, impersonate.

### Что делает встроенная ClusterRole view?
- [ ] Даёт полный доступ
- [x] Даёт права только на чтение большинства ресурсов, без доступа к Secret
- [ ] Позволяет изменять ресурсы
- [ ] Позволяет управлять RBAC
> edit даёт изменение без RBAC, admin — почти всё в namespace.

### Зачем ставить automountServiceAccountToken: false?
- [ ] Чтобы под не запустился
- [x] Чтобы не монтировать в под токен API, если приложению не нужен доступ к Kubernetes API — меньше риск при компрометации
- [ ] Чтобы отключить RBAC
- [ ] Чтобы использовать токен по умолчанию
> Большинству приложений API Kubernetes не нужен.

### Как выдать CI доступ к деплою только в namespace prod?
- [ ] Выдать cluster-admin
- [x] Создать ServiceAccount, Role с нужными правами на Deployments в prod и RoleBinding в prod
- [ ] Использовать kubeconfig администратора
- [ ] Выдать ClusterRoleBinding на edit
> Это принцип наименьших привилегий.

### Какие три этапа проходит запрос к API server?
- [x] Аутентификация — кто это
- [x] Авторизация — разрешено ли действие (обычно RBAC)
- [x] Admission — проверка и изменение конкретного объекта перед сохранением
- [ ] Шифрование в etcd до проверки прав
> Admission-контроллеры, например Pod Security Admission и Kyverno.

### Можно ли изменить roleRef у существующего RoleBinding?
- [ ] Да, через kubectl edit
- [x] Нет: binding нужно удалить и создать заново
- [ ] Да, через patch
- [ ] Только у ClusterRoleBinding
> Так защищаются от незаметной подмены роли.
