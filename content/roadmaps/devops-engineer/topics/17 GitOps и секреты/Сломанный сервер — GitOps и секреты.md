---
title: Сломанный сервер — GitOps и секреты
slug: slomannyj-server-gitops-i-sekrety
description: Аварии с Argo CD и Vault без подсказок в условии — приложение не синхронизируется после переименования ветки и неудачного коммита, Vault запечатан после перезапуска, а приложение не может прочитать секрет. Чинить через Git, распечатывать ключами, политики KV v2.
duration: 60
level: Практика
quizSize: 10
---

# Сломанный сервер — GitOps и секреты

В GitOps у аварии два места: Git (что мы хотим) и контроллер (почему он не может это применить). Чинить нужно **в Git** — правка в кластере руками будет откачена или вызовет вечный OutOfSync. С секретами главное — не «чинить» токеном root: найти, какой политики не хватает.

## Argo CD: приложение не синхронизируется

1. `kubectl -n argocd get applications` — колонки SYNC и HEALTH.
2. `kubectl -n argocd get application имя -o yaml` → `status.conditions` (ComparisonError, SyncError) и `status.operationState.message` — текст ошибки последней синхронизации.
3. Частые причины:

| Сообщение | Причина |
| --- | --- |
| `unable to resolve 'master' to a commit SHA` | нет такой ветки или тега (`targetRevision`) |
| `repository not accessible` / `authentication required` | адрес репозитория или доступ |
| `app path does not exist` | неверный `path` |
| `could not find apps/v1beta1, Kind=Deployment` | устаревший или неверный `apiVersion` в манифесте |
| `error converting YAML to JSON` | синтаксис YAML в Git |
| Synced, но Progressing/Degraded | манифест применился, но поды не поднимаются — дальше обычная диагностика Kubernetes |

4. Обновить состояние сразу, не дожидаясь опроса: аннотация `argocd.argoproj.io/refresh=normal` на Application (или кнопка Refresh в интерфейсе).

## Vault: «приложение не получает секрет»

1. `vault status` — `Sealed: true` значит, что Vault после перезапуска **запечатан**: данные зашифрованы, нужен порог ключей распечатки (`vault operator unseal` нужное число раз разными ключами). Dev-режим распечатан всегда, настоящий — нет.
2. `permission denied` (403) — у токена нет нужной политики. `vault token lookup` (политики токена), `vault policy read имя`.
3. KV **v2**: данные лежат по пути `secret/data/...`, метаданные — `secret/metadata/...`. Политика на `secret/shop/*` от KV v1 к v2 не подходит.
4. В продакшене распечатку автоматизируют (auto-unseal через облачный KMS или другой Vault), а ключи распечатки хранят разные люди.

## Практика

- [ ] Пройти задачи лаборатории, первые 10 минут без подсказки
- [ ] Для каждой записать: симптом → где увидели → причина → решение
- [ ] В своём кластере с Argo CD закоммитить манифест с ошибкой и пройти путь «ошибка в статусе → исправление в Git → Synced»

## Лаборатория

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
export VAULT_ADDR=http://127.0.0.1:8210
```

### Argo CD не обновляет приложение

Приложение **`bs-shop`** в Argo CD (манифест Application — `~/k8s/bs-shop-app.yaml`) разворачивает в namespace `lab-bsgit` манифесты из репозитория `bs.git` (рабочая копия — `~/bs-manifests`). Репозиторий недавно перевели с ветки `master` на `main`, а вчера закоммитили масштабирование магазина до 2 реплик. В кластере изменений нет.

Почините так, чтобы Argo CD синхронизировал приложение с веткой `main`, а в кластере работало **2 реплики** `shop`. Изменения в кластер — только через Git и Argo CD.

```bash setup
lab_gitd
kubectl -n argocd delete application bs-shop --ignore-not-found --wait=true >/dev/null 2>&1
kubectl delete ns lab-bsgit --ignore-not-found --wait=true --timeout=120s >/dev/null 2>&1
rm -rf /srv/gitops/bs.git /home/student/bs-manifests
su - student -c 'git config --global user.name >/dev/null || git config --global user.name Student; git config --global user.email >/dev/null || git config --global user.email student@stand.local'
su - student -c 'git init -q --bare -b main /srv/gitops/bs.git && git clone -q /srv/gitops/bs.git ~/bs-manifests 2>/dev/null'
m=/home/student/bs-manifests/manifests
mkdir -p $m
cat > $m/app.yaml <<'EOF'
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
          args: ["-text=bs-shop"]
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
chown -R student:student /home/student/bs-manifests
su - student -c 'cd ~/bs-manifests && git add -A && git commit -qm "Shop manifests" && git push -q origin main'
sed -i 's/^  replicas: 1$/  replicas: 2/; 0,/^apiVersion: apps\/v1$/s//apiVersion: apps\/v1beta1/' $m/app.yaml
su - student -c 'cd ~/bs-manifests && git commit -qam "Scale shop to 2 replicas" && git push -q origin main'
ip=$(lab_node_ip)
mkdir -p /home/student/k8s
cat > /home/student/k8s/bs-shop-app.yaml <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: bs-shop
  namespace: argocd
spec:
  project: default
  source:
    repoURL: git://$ip/bs.git
    targetRevision: master
    path: manifests
  destination:
    server: https://kubernetes.default.svc
    namespace: lab-bsgit
  syncPolicy:
    automated:
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 2
      backoff:
        duration: 5s
        factor: 1
        maxDuration: 5s
EOF
chown -R student:student /home/student/k8s
kubectl apply -f /home/student/k8s/bs-shop-app.yaml >/dev/null
```

```bash check
a=$(lab_argo_app bs-shop); [ -n "$a" ] || fail "В Argo CD нет приложения bs-shop"
head=$(git --git-dir=/srv/gitops/bs.git rev-parse main 2>/dev/null)
[ -n "$head" ] || fail "В репозитории bs.git нет ветки main"
git --git-dir=/srv/gitops/bs.git show main:manifests/app.yaml 2>/dev/null | grep -qE '^\s+replicas:\s*2\s*$' || fail "В манифестах ветки main не 2 реплики"
lab_argo_refresh bs-shop
for i in $(seq 35); do
  a=$(lab_argo_app bs-shop)
  s=$(echo "$a" | jq -r .status.sync.status); h=$(echo "$a" | jq -r .status.health.status); rev=$(echo "$a" | jq -r .status.sync.revision)
  [ "$s" = Synced ] && [ "$h" = Healthy ] && [ "$rev" = "$head" ] && break
  [ $((i % 10)) = 0 ] && lab_argo_refresh bs-shop
  sleep 1
done
msg=$(echo "$a" | jq -r '[.status.conditions[]?.message, .status.operationState.message // empty] | join("; ")' | cut -c1-220)
[ "$s" = Synced ] && [ "$h" = Healthy ] || fail "Приложение bs-shop: sync=$s, health=$h. $msg"
[ "$rev" = "$head" ] || fail "Argo CD синхронизировал не последний коммит ветки main"
r=$(kubectl -n lab-bsgit get deploy shop -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "${r:-0}" = 2 ] || fail "Готовых реплик shop в lab-bsgit: ${r:-0}"
ok "bs-shop: Synced, Healthy на ${head:0:7}, 2 реплики"
```

```text hint
1. Посмотреть статус приложения в Argo CD и сообщение об ошибке: что он не может найти.
2. Исправить источник в описании приложения и применить его. Если после этого синхронизация падает — прочитать сообщение последней операции: какой объект кластер не принял и почему.
3. Ошибку в манифесте исправить в рабочей копии репозитория, закоммитить и отправить; попросить Argo CD обновить состояние.
```

```bash solution
kubectl -n argocd get application bs-shop -o jsonpath='{range .status.conditions[*]}{.message}{"\n"}{end}'
sed -i 's/targetRevision: master/targetRevision: main/' ~/k8s/bs-shop-app.yaml
kubectl apply -f ~/k8s/bs-shop-app.yaml
sleep 15
kubectl -n argocd get application bs-shop -o jsonpath='{.status.operationState.message}{"\n"}'
cd ~/bs-manifests
sed -i 's#^apiVersion: apps/v1beta1$#apiVersion: apps/v1#' manifests/app.yaml
git commit -qam "Fix Deployment apiVersion" && git push -q origin main
kubectl -n argocd annotate application bs-shop argocd.argoproj.io/refresh=normal --overwrite
kubectl -n lab-bsgit rollout status deploy/shop --timeout=90s
kubectl -n argocd get application bs-shop
```

```text review
Две поломки:

1. `targetRevision: master` — ветки `master` больше нет: `ComparisonError: unable to resolve 'master' to a commit SHA`. Argo CD не мог даже сравнить Git с кластером.
2. В коммите «Scale shop to 2 replicas» заодно испортили `apiVersion: apps/v1beta1` — такой версии API давно нет, синхронизация падала с «could not find … apps/v1beta1».

- Чинить через Git: `kubectl scale` или `kubectl apply` руками при `selfHeal: true` будет тут же откачен, а без него приложение останется OutOfSync.
- Ловить такие ошибки до мержа: в CI репозитория манифестов — `kubeconform` (проверка по схемам API) и `kubectl apply --dry-run=server`.
- Неудачная синхронизация повторяется по `syncPolicy.retry` для **той же** ревизии; новый коммит Argo CD возьмёт, когда попытки закончатся. Зависшую операцию можно прервать: Terminate в интерфейсе или `argocd app terminate-op`.
- `targetRevision: HEAD` следует за веткой по умолчанию репозитория; для продакшена часто ставят конкретный тег — откат = смена тега в Git.
```

```text notes
kubectl\s+(scale|edit|set|patch)\s+[^\n]*(deploy|deployment)\b => Deployment меняли в кластере напрямую — при GitOps это откатывается или даёт вечный OutOfSync. Изменения идут через Git.
```

### Vault не отдаёт секрет

Vault магазина работает в **обычном** режиме (служба `lab-vault-bs`, адрес `http://127.0.0.1:8210`, хранилище на диске). Ночью сервер перезапустили, и приложение не может прочитать свой секрет `secret/shop/db` (KV v2). Токен приложения — в `~/app-token.txt`. Ключи распечатки и токен администратора (в аварийном конверте) — в `~/vault-init.json`.

Почините так, чтобы приложение **со своим токеном** читало `secret/shop/db`. Права приложения не расширяйте сверх чтения своих секретов.

```bash setup
systemctl stop lab-vault-bs 2>/dev/null; systemctl reset-failed lab-vault-bs 2>/dev/null
rm -rf /var/lib/lab-vault-bs /etc/lab-vault-bs
mkdir -p /var/lib/lab-vault-bs /etc/lab-vault-bs
cat > /etc/lab-vault-bs/config.hcl <<'EOF'
storage "file" {
  path = "/var/lib/lab-vault-bs"
}
listener "tcp" {
  address     = "127.0.0.1:8210"
  tls_disable = 1
}
api_addr      = "http://127.0.0.1:8210"
disable_mlock = true
ui            = false
EOF
systemd-run -q --unit=lab-vault-bs vault server -config=/etc/lab-vault-bs/config.hcl
for i in $(seq 40); do vault status >/dev/null 2>&1; [ $? -ne 1 ] && break; sleep 0.25; done
init=$(vault operator init -key-shares=3 -key-threshold=2 -format=json)
echo "$init" > /home/student/vault-init.json
for k in 0 1; do vault operator unseal "$(echo "$init" | jq -r ".unseal_keys_b64[$k]")" >/dev/null; done
export VAULT_TOKEN=$(echo "$init" | jq -r .root_token)
vault secrets enable -path=secret kv-v2 >/dev/null
vault kv put secret/shop/db username=app password=Vault-db-2026 >/dev/null
vault kv put secret/billing/stripe api_key=sk-live-456 >/dev/null
printf 'path "secret/shop/*" {\n  capabilities = ["read", "list"]\n}\n' | vault policy write shop-app - >/dev/null
vault token create -policy=shop-app -ttl=72h -field=token > /home/student/app-token.txt
mkdir -p /var/lib/lab && cp /home/student/app-token.txt /var/lib/lab/bs-app-token
chown student:student /home/student/vault-init.json /home/student/app-token.txt
chmod 600 /home/student/vault-init.json /home/student/app-token.txt
systemctl stop lab-vault-bs; systemctl reset-failed lab-vault-bs 2>/dev/null
systemd-run -q --unit=lab-vault-bs vault server -config=/etc/lab-vault-bs/config.hcl
for i in $(seq 40); do vault status >/dev/null 2>&1; [ $? -ne 1 ] && break; sleep 0.25; done
```

```bash check
[ "$(systemctl is-active lab-vault-bs)" = active ] || fail "Служба lab-vault-bs не работает"
st=$(vault status -format=json 2>/dev/null)
[ -n "$st" ] || fail "Vault на 127.0.0.1:8210 не отвечает"
[ "$(echo "$st" | jq -r .sealed)" = false ] || fail "Vault запечатан (sealed)"
t=$(cat /var/lib/lab/bs-app-token)
[ "$(tr -d '[:space:]' < /home/student/app-token.txt)" = "$t" ] || fail "В ~/app-token.txt не токен приложения"
info=$(VAULT_TOKEN=$t vault token lookup -format=json 2>/dev/null) || fail "Токен приложения не действителен"
echo "$info" | jq -e '.data.policies | index("root")' >/dev/null && fail "У токена приложения политика root"
out=$(VAULT_TOKEN=$t vault kv get -format=json secret/shop/db 2>&1)
echo "$out" | jq -e '.data.data.password == "Vault-db-2026"' >/dev/null 2>&1 || fail "Приложение не читает secret/shop/db: $(echo "$out" | grep -oiE 'permission denied|sealed|no handler|[0-9]{3} [A-Za-z ]+' | head -1)"
VAULT_TOKEN=$t vault kv put secret/shop/db password=hacked >/dev/null 2>&1 && fail "Токен приложения может изменять секрет"
VAULT_TOKEN=$t vault kv get secret/billing/stripe >/dev/null 2>&1 && fail "Токен приложения читает секреты billing"
ok "Vault распечатан, приложение читает secret/shop/db только на чтение"
```

```text hint
1. Узнать состояние Vault. Если он запечатан — распечатать ключами из аварийного файла: нужно столько разных ключей, каков порог.
2. Попробовать прочитать секрет с токеном приложения и посмотреть, какие политики у токена и что в них написано.
3. Сравнить путь в политике с тем, по какому пути движок второй версии на самом деле хранит данные; исправить политику токеном администратора — токен приложения менять не нужно.
```

```bash solution
export VAULT_ADDR=http://127.0.0.1:8210
vault status || true
vault operator unseal "$(jq -r '.unseal_keys_b64[0]' ~/vault-init.json)"
vault operator unseal "$(jq -r '.unseal_keys_b64[1]' ~/vault-init.json)"
VAULT_TOKEN=$(cat ~/app-token.txt) vault kv get secret/shop/db || true
export VAULT_TOKEN=$(jq -r .root_token ~/vault-init.json)
vault token lookup "$(cat ~/app-token.txt)" | grep policies
vault policy read shop-app
printf 'path "secret/data/shop/*" {\n  capabilities = ["read"]\n}\npath "secret/metadata/shop/*" {\n  capabilities = ["read", "list"]\n}\n' | vault policy write shop-app -
VAULT_TOKEN=$(cat ~/app-token.txt) vault kv get secret/shop/db
```

```text review
Две поломки:

1. После перезапуска Vault **запечатан**: ключ шифрования данных хранится только в памяти и восстанавливается из ключей распечатки (здесь — 2 из 3, схема Шамира). Пока Vault запечатан, на любой запрос — ошибка «Vault is sealed».
2. Политика `shop-app` написана на путь `secret/shop/*` — так выглядит путь в KV **v1**. В KV v2 данные лежат в `secret/data/shop/*`, а `vault kv get secret/shop/db` под капотом обращается именно туда: `403 permission denied`.

- Политика меняется сразу для всех токенов с ней — пересоздавать токен приложения не нужно.
- Токен root — только для аварий и первичной настройки: после неё root-токен отзывают (`vault token revoke`) и при необходимости генерируют заново ключами распечатки (`vault operator generate-root`).
- В продакшене — **auto-unseal** через облачный KMS, HSM или Transit другого Vault: сервер распечатывается сам после перезапуска. Ключи распечатки (или recovery keys) хранят разные люди.
- Мониторинг: алерт на `vault_core_unsealed == 0` — запечатанный Vault останавливает всё, что берёт из него секреты.
```

```text notes
policy=root|-policy\s+root => Приложению выдавали токен с политикой root — у него должны быть только права на свои секреты.
```

## Тест

### Argo CD показывает ComparisonError «unable to resolve 'master' to a commit SHA». Причина?
- [ ] Нет доступа к кластеру
- [x] В репозитории нет ветки или тега из targetRevision
- [ ] Ошибка в манифесте Deployment
- [ ] Argo CD не запущен
> Argo CD не может найти ревизию, чтобы сравнить её с кластером.

### Где посмотреть текст ошибки последней синхронизации Argo CD?
- [ ] В журнале kubelet
- [x] status.operationState.message и status.conditions у ресурса Application (или в интерфейсе Argo CD)
- [ ] В .git/config
- [ ] В журнале CoreDNS
> Ошибки сравнения — в conditions, ошибки применения — в operationState.

### При selfHeal: true вы сделали kubectl scale deploy/shop --replicas=3. Что будет?
- [ ] Останется 3 реплики
- [x] Argo CD вернёт число реплик из Git
- [ ] Приложение удалится
- [ ] Argo CD выключит автосинхронизацию
> Источник правды — Git; ручные изменения откатываются.

### Как обновить состояние приложения в Argo CD, не дожидаясь периодического опроса Git?
- [ ] Перезапустить кластер
- [x] Refresh: аннотация argocd.argoproj.io/refresh на Application или кнопка в интерфейсе
- [ ] Удалить приложение
- [ ] Сделать git gc
> По умолчанию Argo CD опрашивает репозитории раз в несколько минут.

### Как поймать неверный apiVersion в манифестах до мержа?
- [ ] Никак, только при деплое
- [x] Проверять манифесты в CI: kubeconform по схемам API или kubectl apply --dry-run=server
- [ ] Включить selfHeal
- [ ] Увеличить число реплик
> Проверка в CI дешевле, чем падение синхронизации.

### vault status показывает Sealed: true. Что это значит?
- [ ] Vault удалил данные
- [x] Данные зашифрованы, ключ не загружен в память — нужна распечатка порогом ключей
- [ ] Токен root истёк
- [ ] Vault работает только на чтение
> После каждого перезапуска (без auto-unseal) Vault запечатан.

### Vault инициализирован с key-shares=5 и key-threshold=3. Сколько ключей нужно для распечатки?
= 3
> Порог — минимальное число разных ключей (схема Шамира).

### Политика разрешает read на secret/shop/*, движок — KV v2. Почему vault kv get secret/shop/db даёт 403?
- [ ] Токен истёк
- [x] В KV v2 данные лежат по пути secret/data/shop/…, политика должна разрешать его
- [ ] Нужно capability sudo
- [ ] Vault запечатан
> `vault kv` скрывает префикс data/, но политики пишутся на реальный путь API.

### Политику исправили. Нужно ли пересоздавать токены, которые её используют?
- [ ] Да, иначе изменения не применятся
- [x] Нет: политика применяется ко всем токенам с ней сразу
- [ ] Только после перезапуска Vault
- [ ] Только для токенов root
> Токен ссылается на имя политики, а не на её копию.

### Что такое auto-unseal?
- [ ] Отключение шифрования
- [x] Автоматическая распечатка после перезапуска с помощью внешнего KMS/HSM или другого Vault
- [ ] Автоматическое продление токенов
- [ ] Распечатка ключом root
> Ключ распечатки хранится во внешней системе, люди не вводят ключи вручную.

### Что делать с root-токеном после первичной настройки Vault?
- [ ] Отдать приложениям
- [x] Отозвать; при аварии сгенерировать новый через generate-root ключами распечатки
- [ ] Записать в README
- [ ] Ничего, он истекает сам
> Постоянный root-токен — главный секрет, который не должен существовать без нужды.

### Как узнать, какие политики у токена?
= vault token lookup
= vault token lookup <токен>
> Поле policies в выводе.
