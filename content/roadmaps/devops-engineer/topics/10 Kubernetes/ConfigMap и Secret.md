---
title: ConfigMap и Secret
slug: configmap-i-secret
description: Отделение конфигурации от образа — ConfigMap и Secret, создание, передача в под переменными окружения и файлами, обновление конфигурации, типы секретов, base64 и безопасность, шифрование в etcd и внешние хранилища секретов.
duration: 60
level: Основы
quizSize: 10
materials:
  - title: Kubernetes Docs — Configuration (ConfigMaps и Secrets)
    url: https://kubernetes.io/docs/concepts/configuration/_print
    type: документация
  - title: Kubernetes Docs — kubectl Quick Reference
    url: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
    type: документация
  - title: Kubernetes Docs — Using RBAC Authorization
    url: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
    type: документация
---

# ConfigMap и Secret

Один и тот же образ должен работать в dev, stage и prod. Всё, что отличается между окружениями, — **вне образа**:

- **ConfigMap** — обычная конфигурация: режим работы, адреса сервисов, файлы конфигов;
- **Secret** — чувствительные данные: пароли, токены, ключи, TLS-сертификаты.

## ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_MODE: production
  LOG_LEVEL: info
  nginx.conf: |
    server {
      listen 80;
      location / { proxy_pass http://127.0.0.1:8000; }
    }
```

```bash
kubectl create configmap app-config --from-literal=APP_MODE=production --from-file=nginx.conf
kubectl get configmap app-config -o yaml
```

## Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-db
type: Opaque
stringData:
  DB_USER: app
  DB_PASSWORD: S3cr3t!
```

```bash
kubectl create secret generic app-db --from-literal=DB_PASSWORD='S3cr3t!'
kubectl create secret tls app-tls --cert=tls.crt --key=tls.key
kubectl create secret docker-registry regcred --docker-server=registry.gitlab.com --docker-username=deploy --docker-password="$TOKEN"
kubectl get secret app-db -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
```

- В поле `data` значения пишутся в **base64**, в `stringData` — открытым текстом (Kubernetes закодирует сам).
- Типы: `Opaque` (произвольные), `kubernetes.io/tls`, `kubernetes.io/dockerconfigjson` (для `imagePullSecrets`), `kubernetes.io/service-account-token`, `kubernetes.io/basic-auth`.
- Размер ConfigMap или Secret — до 1 МиБ.

> [!warning] base64 — это не шифрование
> Любой, кто может прочитать Secret (`get secret`), увидит пароль. По умолчанию Secret'ы лежат в etcd **без шифрования**. Что делать:
> - ограничить доступ к Secret через **RBAC** (не давать `get/list secrets` всем подряд);
> - включить **шифрование at rest** в etcd (EncryptionConfiguration, KMS-провайдер) — в managed-кластерах часто включено;
> - **не коммитить** Secret-манифесты в Git открытым текстом: **Sealed Secrets**, **SOPS**, **External Secrets Operator** (синхронизация из HashiCorp Vault, облачных менеджеров секретов).

## Как передать в под

```yaml
spec:
  containers:
    - name: app
      image: registry.example.com/app:1.4.2
      envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-db
      env:
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: app-db
              key: DB_PASSWORD
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
      volumeMounts:
        - name: nginx-conf
          mountPath: /etc/nginx/conf.d
          readOnly: true
        - name: tls
          mountPath: /etc/tls
          readOnly: true
  volumes:
    - name: nginx-conf
      configMap:
        name: app-config
        items:
          - key: nginx.conf
            path: default.conf
    - name: tls
      secret:
        secretName: app-tls
        defaultMode: 0400
```

| Способ | Плюсы | Минусы |
| --- | --- | --- |
| Переменные окружения (`env`, `envFrom`) | Просто, приложению не нужно читать файлы | **Не обновляются** без перезапуска пода; видны в `describe`/`/proc` |
| Файлы (`volumes`) | Подходят для конфигов; **обновляются** в поде автоматически (с задержкой до ~минуты) | Приложение должно перечитать файл; с `subPath` обновление не работает |

`fieldRef` (Downward API) — передать в контейнер сведения о поде: имя, namespace, IP, ноду.

## Обновление конфигурации

Изменили ConfigMap — поды с переменными окружения **ничего не узнают**. Варианты:

- `kubectl rollout restart deploy/app`;
- добавлять в шаблон пода аннотацию с хешем конфига (так делают Helm-чарты: `checksum/config`), тогда изменение конфига само запустит rollout;
- **неизменяемые** ConfigMap с версией в имени (`app-config-v7`) и `immutable: true` — безопаснее и разгружает API server.

## Практика

- [ ] Создать ConfigMap из литералов и из файла, передать в под через `envFrom` и проверить `kubectl exec ... -- env`
- [ ] Смонтировать `nginx.conf` из ConfigMap в под nginx, изменить ConfigMap и подождать, пока файл обновится внутри пода
- [ ] Создать Secret и раскодировать его значение через `base64 -d` — убедиться, что это не шифрование
- [ ] Создать `docker-registry` секрет и скачать образ из приватного GitLab Registry через `imagePullSecrets`
- [ ] Изменить ConfigMap, используемый через переменные окружения, и убедиться, что под не видит изменений до `rollout restart`
- [ ] Попробовать Sealed Secrets или SOPS, чтобы хранить зашифрованный секрет в Git

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

### Конфигурация из ConfigMap

В `~/k8s/app.properties` лежит конфиг приложения. В namespace **`lab-cfg`**:

1. создайте ConfigMap **`app-config`**: ключ `LOG_LEVEL` = `debug` **и** файл `app.properties` из `~/k8s/app.properties`;
2. создайте под **`app`** (`busybox:1.36`, команда — сон), у которого:
   - переменная окружения `LOG_LEVEL` берётся из ConfigMap;
   - файл `app.properties` из ConfigMap подключён как `/etc/app/app.properties`.

```bash setup
lab_kns lab-cfg
mkdir -p /home/student/k8s
printf 'db.host=db.lab-cfg.svc\ndb.port=5432\nfeature.newcart=true\n' > /home/student/k8s/app.properties
chown -R student:student /home/student/k8s
```

```bash check
cm=$(lab_kj -n lab-cfg get cm app-config) || fail "ConfigMap app-config нет"
[ "$(echo "$cm" | jq -r '.data.LOG_LEVEL')" = debug ] || fail "В ConfigMap нет LOG_LEVEL=debug"
[ "$(echo "$cm" | jq -r '.data["app.properties"]')" = "$(cat /home/student/k8s/app.properties)" ] || fail "В ConfigMap нет файла app.properties с содержимым ~/k8s/app.properties"
kubectl -n lab-cfg wait --for=condition=Ready pod/app --timeout=60s >/dev/null 2>&1 || fail "Пода app нет или он не Ready"
p=$(lab_kj -n lab-cfg get pod app)
echo "$p" | jq -e '.spec.containers[0].env[]? | select(.name == "LOG_LEVEL" and .valueFrom.configMapKeyRef.name == "app-config")' >/dev/null \
  || echo "$p" | jq -e '.spec.containers[0].envFrom[]? | select(.configMapRef.name == "app-config")' >/dev/null || fail "LOG_LEVEL в поде не берётся из ConfigMap"
[ "$(kubectl -n lab-cfg exec app -- printenv LOG_LEVEL 2>/dev/null)" = debug ] || fail "В поде переменная LOG_LEVEL не равна debug"
[ "$(kubectl -n lab-cfg exec app -- cat /etc/app/app.properties 2>/dev/null)" = "$(cat /home/student/k8s/app.properties)" ] || fail "В поде нет /etc/app/app.properties с конфигом"
ok "LOG_LEVEL=debug и /etc/app/app.properties — из ConfigMap"
```

```text hint
1. ConfigMap можно создать одной командой с двумя источниками: литерал «ключ=значение» и файл.
2. В поде: переменная окружения со ссылкой на ключ ConfigMap; том типа configMap и точка монтирования в каталог (ключ станет файлом с тем же именем).
```

```bash solution
kubectl -n lab-cfg create configmap app-config --from-literal=LOG_LEVEL=debug --from-file=app.properties=$HOME/k8s/app.properties
cat > ~/k8s/app-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: app
  namespace: lab-cfg
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sleep", "infinity"]
      env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL
      volumeMounts:
        - name: config
          mountPath: /etc/app
  volumes:
    - name: config
      configMap:
        name: app-config
        items:
          - key: app.properties
            path: app.properties
EOF
kubectl apply -f ~/k8s/app-pod.yaml
kubectl -n lab-cfg wait --for=condition=Ready pod/app --timeout=60s
kubectl -n lab-cfg exec app -- cat /etc/app/app.properties
```

```text review
Эталон — в «Решении».

- Переменные окружения из ConfigMap читаются **при старте** контейнера: изменили ConfigMap — нужен перезапуск подов (`kubectl rollout restart deploy/...`). Файлы из тома обновляются сами (с задержкой ~минута), но приложение должно их перечитать.
- `envFrom: configMapRef` — все ключи разом; `items` в томе — только выбранные ключи.
- Конфиг отдельно от образа: один образ для dev, stage и prod, разные ConfigMap. В Helm их генерируют из values, и аннотация с хешем конфига перезапускает поды при его изменении.
```

### Пароль из Secret

Создайте в namespace **`lab-cfg`** Secret **`db-credentials`** с ключами `username` = `app` и `password` = `Pa55-word-77`, и под **`worker`** (`busybox:1.36`, сон), в котором пароль доступен **файлом** `/etc/secret/password` с правами **0400** (не переменной окружения).

```bash setup
lab_kns lab-cfg
```

```bash check
s=$(lab_kj -n lab-cfg get secret db-credentials) || fail "Secret db-credentials нет"
[ "$(echo "$s" | jq -r '.data.username' | base64 -d 2>/dev/null)" = app ] || fail "username в Secret не app"
[ "$(echo "$s" | jq -r '.data.password' | base64 -d 2>/dev/null)" = Pa55-word-77 ] || fail "password в Secret не тот"
kubectl -n lab-cfg wait --for=condition=Ready pod/worker --timeout=60s >/dev/null 2>&1 || fail "Пода worker нет или он не Ready"
p=$(lab_kj -n lab-cfg get pod worker)
echo "$p" | jq -e '[.spec.containers[0].env[]? | select(.valueFrom.secretKeyRef != null)] | length == 0' >/dev/null || fail "Секрет передан переменной окружения — их видно в kubectl describe и в /proc"
[ "$(kubectl -n lab-cfg exec worker -- cat /etc/secret/password 2>/dev/null)" = Pa55-word-77 ] || fail "В поде нет /etc/secret/password с паролем"
m=$(kubectl -n lab-cfg exec worker -- stat -L -c %a /etc/secret/password 2>/dev/null)
[ "$m" = 400 ] || fail "Права на /etc/secret/password — $m"
ok "пароль подключён файлом с правами 0400"
```

```text hint
1. Secret общего вида создаётся командой с литералами «ключ=значение».
2. В поде — том типа secret с правами по умолчанию для файлов (восьмеричное число в YAML пишут с ведущим нулём) и выбором ключа.
3. Проверить файл и его права внутри пода.
```

```bash solution
kubectl -n lab-cfg create secret generic db-credentials --from-literal=username=app --from-literal=password='Pa55-word-77'
mkdir -p ~/k8s
cat > ~/k8s/worker.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: worker
  namespace: lab-cfg
spec:
  containers:
    - name: worker
      image: busybox:1.36
      command: ["sleep", "infinity"]
      volumeMounts:
        - name: creds
          mountPath: /etc/secret
          readOnly: true
  volumes:
    - name: creds
      secret:
        secretName: db-credentials
        defaultMode: 0400
        items:
          - key: password
            path: password
EOF
kubectl apply -f ~/k8s/worker.yaml
kubectl -n lab-cfg wait --for=condition=Ready pod/worker --timeout=60s
```

```text review
Эталон: `kubectl create secret generic` + том `secret` с `defaultMode: 0400`.

- Secret в Kubernetes — это **base64, а не шифрование**: `kubectl get secret -o yaml` и `base64 -d` — и пароль виден. Защищают его RBAC (кто может читать Secret) и шифрование etcd at rest.
- Файл лучше переменной: переменные видны в `kubectl describe pod`, попадают в дампы процессов и логи ошибок; файл можно закрыть правами и обновлять без перезапуска.
- В Git Secret не кладут. Варианты: Sealed Secrets (зашифрованный манифест), External Secrets Operator (из Vault/облака), SOPS — тема «HashiCorp Vault» и GitOps.
```

## Тест

### Чем ConfigMap отличается от Secret по назначению?
- [x] ConfigMap — для обычной конфигурации
- [x] Secret — для чувствительных данных: паролей, токенов, ключей, сертификатов
- [ ] Secret всегда надёжно зашифрован
- [ ] ConfigMap нельзя монтировать как файлы
> Технически оба — наборы ключ-значение.

### Как хранятся значения в поле data у Secret?
- [ ] Зашифрованы AES-256
- [x] Закодированы в base64 — это кодирование, а не шифрование
- [ ] Открытым текстом
- [ ] В виде хешей
> Открытым текстом значения можно писать в поле stringData.

### Как защитить секреты в Kubernetes?
- [x] Ограничить доступ к Secret через RBAC
- [x] Включить шифрование секретов в etcd (encryption at rest)
- [x] Не хранить Secret открытым текстом в Git — использовать Sealed Secrets, SOPS или External Secrets Operator
- [ ] Перекодировать значения в base64 дважды
> base64 любой раскодирует одной командой.

### Обновится ли значение у работающего пода, если поменять ConfigMap, переданный через envFrom?
- [ ] Да, сразу
- [x] Нет: переменные окружения читаются при старте контейнера, нужен перезапуск пода
- [ ] Да, через минуту
- [ ] Под упадёт
> Файлы из смонтированного ConfigMap, напротив, обновляются автоматически (кроме subPath).

### Как передать в контейнер все ключи ConfigMap как переменные окружения?
- [ ] env с configMap: all
- [x] envFrom с configMapRef
- [ ] volumeMounts
- [ ] command
> Для одного ключа — env с valueFrom.configMapKeyRef.

### Какой тип Secret используется для скачивания образов из приватного реестра?
- [ ] Opaque
- [ ] kubernetes.io/tls
- [x] kubernetes.io/dockerconfigjson
- [ ] kubernetes.io/basic-auth
> Секрет указывают в imagePullSecrets пода или ServiceAccount.

### Как раскодировать значение ключа DB_PASSWORD из Secret app-db?
- [ ] kubectl decrypt secret app-db
- [x] kubectl get secret app-db -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
- [ ] kubectl describe secret app-db — покажет значение
- [ ] Это невозможно
> describe показывает только размеры значений, но get -o yaml отдаёт их в base64.

### Зачем Helm-чарты добавляют в шаблон пода аннотацию с хешем ConfigMap?
- [ ] Для красоты
- [x] Чтобы изменение конфигурации меняло шаблон пода и автоматически запускало rollout
- [ ] Чтобы зашифровать ConfigMap
- [ ] Чтобы ConfigMap не удалялся
> Иначе поды продолжат работать со старой конфигурацией.

### Что даёт immutable: true у ConfigMap?
- [x] Защиту от случайного изменения работающей конфигурации
- [x] Снижение нагрузки на API server — kubelet не следит за изменениями
- [ ] Шифрование данных
- [ ] Автоматический перезапуск подов
> Новую версию создают с другим именем, например app-config-v8.

### Как передать в контейнер имя его пода?
- [ ] Через ConfigMap
- [x] Через Downward API: env с valueFrom.fieldRef.fieldPath: metadata.name
- [ ] Через Secret
- [ ] Это невозможно
> Так же можно передать namespace, IP пода и имя ноды.

### Какой максимальный размер у одного ConfigMap или Secret?
= 1 МиБ
= 1 мб
= 1mib
= 1mb
> Большие данные храните в томах или во внешних системах.
