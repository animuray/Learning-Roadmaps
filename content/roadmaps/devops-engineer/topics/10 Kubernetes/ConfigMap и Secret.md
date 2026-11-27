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
