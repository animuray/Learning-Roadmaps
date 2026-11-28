---
title: HashiCorp Vault
slug: hashicorp-vault
description: Зачем нужно хранилище секретов, HashiCorp Vault и форк OpenBao, запуск в dev и продакшен-режиме, seal и unseal по схеме Шамира и auto-unseal, KV secrets engine v2 и версии, базовые команды vault, политики, токены и методы аутентификации userpass, AppRole, Kubernetes, JWT, динамические секреты, аудит, интеграция с Kubernetes через External Secrets Operator и Vault Agent.
duration: 120
level: Продвинутый
quizSize: 10
materials:
  - title: Vault Docs — KV secrets engine version 2
    url: https://developer.hashicorp.com/vault/docs/v1.17.x/secrets/kv/kv-v2
    type: документация
  - title: Vault Docs — Seal/Unseal
    url: https://developer.hashicorp.com/vault/docs/v1.20.x/concepts/seal
    type: документация
  - title: Vault Docs — AppRole auth method
    url: https://developer.hashicorp.com/vault/docs/v1.17.x/auth/approle
    type: документация
  - title: OpenBao — открытый форк Vault
    url: https://openbao.org
    type: документация
  - title: DigitalOcean — Vault secrets в Kubernetes через External Secrets Operator
    url: https://www.digitalocean.com/community/tutorials/how-to-access-vault-secrets-inside-of-kubernetes-using-external-secrets-operator-eso
    type: статья
---

# HashiCorp Vault

Пароли баз, API-ключи, TLS-ключи, токены — **секреты**. Плохие места для них: Git, переменные в коде, общий файл на сервере, мессенджер. **Хранилище секретов** даёт:

- одно защищённое место с **шифрованием**;
- **права** на уровне путей: сервис shop читает только свои секреты;
- **аудит**: кто, когда и какой секрет прочитал;
- **ротацию** и **динамические секреты** — временные учётные данные, которые сами истекают;
- выдачу секретов программам без «секретного нуля» в коде (аутентификация через платформу: Kubernetes, облако, CI).

**HashiCorp Vault** — самое известное такое хранилище. Альтернативы: облачные (Yandex Lockbox, AWS Secrets Manager), а также **OpenBao** — открытый форк Vault.

> [!note] Лицензия и OpenBao
> С августа 2023 года Vault распространяется под **BSL 1.1** (не open source). Сообщество сделало форк **OpenBao** от последней MPL-версии (Vault 1.14); он развивается под эгидой Linux Foundation (OpenSSF), лицензия MPL 2.0, команда `bao` вместо `vault`, конфигурация и API в основном совместимы. Некоторые функции, которые у Vault есть только в Enterprise (например, namespaces), в OpenBao доступны бесплатно. Всё ниже применимо к обоим.

## Запуск

Dev-режим — **только для обучения** (всё в памяти, автоматически распечатан, root-токен выводится в консоль):

```bash
vault server -dev
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<root token из вывода>'
vault status
```

Продакшен: конфигурационный файл, хранилище **Raft** (встроенное, кластер из 3–5 узлов), **TLS**, отключённый swap/`mlock`:

```hcl
storage "raft" {
  path    = "/opt/vault/data"
  node_id = "vault-1"
}

listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "/etc/vault/tls/vault.crt"
  tls_key_file  = "/etc/vault/tls/vault.key"
}

api_addr     = "https://vault-1.internal:8200"
cluster_addr = "https://vault-1.internal:8201"
ui           = true
```

В Kubernetes — официальный Helm-чарт (Vault или OpenBao) в HA-режиме с Raft.

## Seal и unseal

После старта Vault **запечатан (sealed)**: данные на диске есть, но расшифровать их нельзя.

```
 данные ← ключ шифрования (keyring) ← root key ← unseal key
                                                    └─ разбит по схеме Шамира на N частей, нужно K любых
```

```bash
vault operator init -key-shares=5 -key-threshold=3
vault operator unseal
vault operator unseal
vault operator unseal
vault status
```

- `init` выполняется **один раз**: выдаёт 5 частей ключа и **root-токен**. Части раздают разным людям и хранят раздельно; root-токен после настройки отзывают (`vault token revoke`) и генерируют заново только при необходимости.
- После каждого перезапуска узел нужно распечатать K частями — неудобно для автоматизации.
- **Auto-unseal**: ключ хранится в облачном KMS (Yandex KMS, AWS KMS), HSM или другом Vault (Transit) — узел распечатывается сам. Вместо частей ключа выдаются **recovery keys** для административных операций.
- `vault operator seal` — экстренно запечатать при подозрении на взлом.

## KV secrets engine v2

**Secrets engines** — модули, которые хранят или генерируют секреты; монтируются на пути. **KV** (key-value) — простое хранилище; **версия 2** хранит **историю версий**.

```bash
vault secrets enable -path=secret kv-v2
vault secrets list

vault kv put -mount=secret shop/prod/db username=shop password='S3cr3t!'
vault kv get -mount=secret shop/prod/db
vault kv get -mount=secret -field=password shop/prod/db
vault kv get -mount=secret -format=json shop/prod/db

vault kv put -mount=secret shop/prod/db username=shop password='N3w!'
vault kv get -mount=secret -version=1 shop/prod/db
vault kv patch -mount=secret shop/prod/db password='Rot4ted!'

vault kv delete -mount=secret shop/prod/db
vault kv undelete -mount=secret -versions=3 shop/prod/db
vault kv destroy -mount=secret -versions=1 shop/prod/db
vault kv metadata get -mount=secret shop/prod/db
vault kv list -mount=secret shop/prod
```

- `put` перезаписывает **все** поля секрета новой версией; `patch` меняет только указанные.
- `delete` — **мягкое** удаление (можно `undelete`); `destroy` — безвозвратно удалить данные версии; `metadata delete` — удалить ключ со всеми версиями.
- В API и **политиках** у KV v2 пути с префиксами: `secret/data/...` (данные), `secret/metadata/...` (метаданные). Частая ошибка — написать в политике `secret/shop/*` вместо `secret/data/shop/*`.
- Не передавайте значения секретов аргументами в общей истории shell — `vault kv put ... password=-` прочитает значение из stdin, или используйте файл `@file.json`.

## Политики

Права описываются политиками на **пути** с **capabilities**: `create`, `read`, `update`, `patch`, `delete`, `list`, `sudo`, `deny`. По умолчанию всё запрещено.

`shop-prod.hcl`:

```hcl
path "secret/data/shop/prod/*" {
  capabilities = ["read"]
}

path "secret/metadata/shop/prod/*" {
  capabilities = ["list"]
}
```

```bash
vault policy write shop-prod shop-prod.hcl
vault policy list
vault policy read shop-prod
vault token create -policy=shop-prod -ttl=1h
vault token capabilities <token> secret/data/shop/prod/db
```

## Токены и методы аутентификации

Любой вход в Vault заканчивается выдачей **токена** с политиками и **TTL** (временем жизни). Токены продлеваются (`renew`) и отзываются (`revoke`); корневой токен (root) не имеет ограничений — им не работают повседневно.

| Метод | Для кого | Как |
| --- | --- | --- |
| **userpass**, **LDAP**, **OIDC** | Люди | Логин/пароль, корпоративный каталог, SSO (Keycloak, GitLab) |
| **AppRole** | Программы на ВМ, CI | `role_id` (как логин, можно встроить) + `secret_id` (как пароль, доставляется отдельно и коротко живёт) |
| **Kubernetes** | Поды | Под предъявляет токен своего ServiceAccount, Vault проверяет его через API Kubernetes и выдаёт политики роли |
| **JWT/OIDC** | CI (GitLab CI, GitHub Actions) | Пайплайн предъявляет подписанный JWT с данными проекта и ветки — без хранимых секретов |
| **Облачные** (AWS, GCP, Azure) | ВМ и функции в облаке | Удостоверение платформы |

```bash
vault auth enable approle
vault write auth/approle/role/shop-ci token_policies=shop-prod token_ttl=20m secret_id_ttl=10m secret_id_num_uses=1
vault read auth/approle/role/shop-ci/role-id
vault write -f auth/approle/role/shop-ci/secret-id
vault write auth/approle/login role_id=<role_id> secret_id=<secret_id>

vault auth enable kubernetes
vault write auth/kubernetes/config kubernetes_host=https://kubernetes.default.svc
vault write auth/kubernetes/role/shop bound_service_account_names=shop bound_service_account_namespaces=shop-prod token_policies=shop-prod ttl=1h
```

Рекомендация HashiCorp: выбирайте **самый специфичный для платформы** метод — в Kubernetes это Kubernetes auth, в облаке — облачный, в CI — JWT.

## Динамические секреты и другое

- **Database secrets engine**: Vault сам создаёт в PostgreSQL пользователя с нужными правами на 1 час и удаляет его по истечении. Утёкший пароль быстро становится бесполезным, у каждого сервиса свой пользователь.
- **PKI** — свой центр сертификации: короткоживущие TLS-сертификаты по запросу.
- **Transit** — «шифрование как сервис»: приложение отправляет данные, получает шифротекст, ключи никогда не покидают Vault.
- **Аудит**: `vault audit enable file file_path=/var/log/vault_audit.log` — каждый запрос в журнал (значения секретов хешируются). Включайте сразу.

## Vault и Kubernetes

| Способ | Как работает |
| --- | --- |
| **External Secrets Operator** | `SecretStore` описывает подключение к Vault (через Kubernetes auth), `ExternalSecret` — какие ключи взять; оператор создаёт обычный `Secret` и обновляет его. Хорошо сочетается с GitOps: в Git только ссылки |
| **Vault Agent Injector** | Аннотации пода → sidecar с Vault Agent пишет секреты в файл внутри пода и обновляет их |
| **Vault CSI Provider** | Секреты монтируются как том через Secrets Store CSI Driver |
| **Vault Secrets Operator** | Оператор HashiCorp, синхронизирует секреты Vault в Secret |

```yaml
apiVersion: external-secrets.io/v1
kind: SecretStore
metadata:
  name: vault
  namespace: shop-prod
spec:
  provider:
    vault:
      server: https://vault.internal:8200
      path: secret
      version: v2
      auth:
        kubernetes:
          mountPath: kubernetes
          role: shop
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: shop-db
  namespace: shop-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault
    kind: SecretStore
  target:
    name: shop-db
  data:
    - secretKey: DB_PASSWORD
      remoteRef:
        key: shop/prod/db
        property: password
```

Argo CD с версии 3 рекомендует именно операторы секретов, а не подстановку секретов плагинами при рендеринге манифестов.

## Эксплуатация

- Кластер Raft из 3–5 узлов, **снапшоты** Raft (`vault operator raft snapshot save`) по расписанию в защищённое хранилище — без бэкапа и ключей распечатывания данные не вернуть.
- TLS везде, доступ к 8200 только из нужных сетей.
- Мониторинг: метрики `/v1/sys/metrics` в Prometheus, алерт на sealed-состояние и ошибки аутентификации.
- Короткие TTL токенов, отзыв root-токена, аудит-лог в централизованное логирование.
- Части ключа Шамира или recovery keys — у разных людей, процедура «аварийного распечатывания» записана.

## Практика

- [ ] Запустить Vault (или OpenBao) в dev-режиме, включить KV v2 и выполнить put, get, patch, просмотр старой версии, delete, undelete и destroy
- [ ] Написать политику только на чтение секретов shop/prod, выпустить токен с ней и проверить, что запись запрещена
- [ ] Поднять Vault в обычном режиме с Raft-хранилищем, выполнить init с 5 частями и порогом 3, распечатать, перезапустить и распечатать снова
- [ ] Включить аудит в файл и найти в журнале свои запросы
- [ ] Настроить AppRole для CI: получить role_id и одноразовый secret_id, войти и прочитать секрет
- [ ] Развернуть Vault в Kubernetes через Helm, включить Kubernetes auth и роль для ServiceAccount приложения
- [ ] Установить External Secrets Operator, описать SecretStore и ExternalSecret и получить пароль базы в обычный Secret для приложения
- [ ] Изменить секрет в Vault и убедиться, что Secret в кластере обновился после refreshInterval
- [ ] (Дополнительно) Настроить database secrets engine для PostgreSQL и получить временного пользователя

## Лаборатория

Vault запущен в **dev-режиме** (служба `lab-vault`): адрес `http://127.0.0.1:8200`, токен администратора — **`root`**. Для работы в терминале: `export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root`. Движок KV v2 смонтирован в `secret/`. (Dev-режим хранит всё в памяти и сразу распечатан — только для учёбы.)

```bash lib
export VAULT_ADDR=http://127.0.0.1:8200
# lab_vault — чистый dev-сервер Vault (всё в памяти)
lab_vault() {
  systemctl stop lab-vault 2>/dev/null; systemctl reset-failed lab-vault 2>/dev/null
  systemd-run -q --unit=lab-vault vault server -dev -dev-root-token-id=root -dev-listen-address=127.0.0.1:8200
  for i in $(seq 40); do VAULT_TOKEN=root vault status >/dev/null 2>&1 && return 0; sleep 0.25; done
}
lab_v() { VAULT_TOKEN=root vault "$@" 2>/dev/null; }
```

### Секрет и доступ только на чтение

1. Сохраните в Vault секрет **`secret/shop/db`** с полями `username=app` и `password=S3cret-vault`.
2. Создайте политику **`shop-read`**: **только чтение** секретов под `secret/shop/` (KV v2).
3. Выпустите токен с политикой `shop-read` (без политики `default` не обойтись — она есть всегда) на **1 час** и сохраните его в `~/shop-token.txt`.

С этим токеном приложение должно читать `secret/shop/db`, но не менять его и не видеть `secret/billing/`.

```bash setup
lab_vault
lab_v kv put secret/billing/stripe api_key=sk-live-123 >/dev/null
rm -f /home/student/shop-token.txt
```

```bash check
lab_v kv get -format=json secret/shop/db | jq -e '.data.data.username == "app" and .data.data.password == "S3cret-vault"' >/dev/null || fail "В secret/shop/db нет username=app и password=S3cret-vault"
lab_v policy read shop-read >/dev/null || fail "Политики shop-read нет"
[ -f /home/student/shop-token.txt ] || fail "Нет ~/shop-token.txt"
t=$(tr -d '[:space:]' < /home/student/shop-token.txt)
info=$(VAULT_TOKEN=$t vault token lookup -format=json 2>/dev/null) || fail "Токен из ~/shop-token.txt не действителен"
echo "$info" | jq -e '.data.policies | index("shop-read")' >/dev/null || fail "У токена нет политики shop-read"
echo "$info" | jq -e '.data.policies | index("root")' >/dev/null && fail "Это токен root — приложению нужен токен с минимальными правами"
ttl=$(echo "$info" | jq -r .data.creation_ttl)
[ "$ttl" -le 3600 ] && [ "$ttl" -gt 0 ] || fail "Срок жизни токена — $ttl с, нужен 1 час"
VAULT_TOKEN=$t vault kv get secret/shop/db >/dev/null 2>&1 || fail "С токеном shop-read не читается secret/shop/db"
VAULT_TOKEN=$t vault kv put secret/shop/db password=hacked >/dev/null 2>&1 && fail "С токеном shop-read можно изменить секрет"
VAULT_TOKEN=$t vault kv get secret/billing/stripe >/dev/null 2>&1 && fail "С токеном shop-read видны секреты billing"
ok "токен shop-read: читает secret/shop/*, не пишет, не видит billing"
```

```text hint
1. Записать секрет в KV-движок командой kv put с полями «ключ=значение».
2. Политика — HCL-файл: путь и разрешения. У KV v2 данные лежат по пути с вставкой data/ после имени движка; для чтения нужны права read (и при желании list для metadata/).
3. Создать токен с политикой и сроком жизни, вывести только сам токен в файл.
4. Проверить: войти с этим токеном (переменная окружения) и попробовать прочитать и записать.
```

```bash solution
export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root
vault kv put secret/shop/db username=app password=S3cret-vault
cat > /tmp/shop-read.hcl <<'EOF'
path "secret/data/shop/*" {
  capabilities = ["read"]
}
path "secret/metadata/shop/*" {
  capabilities = ["list", "read"]
}
EOF
vault policy write shop-read /tmp/shop-read.hcl
vault token create -policy=shop-read -ttl=1h -field=token > ~/shop-token.txt
VAULT_TOKEN=$(cat ~/shop-token.txt) vault kv get secret/shop/db
```

```text review
Эталон — в «Решении»: `kv put` → политика на `secret/data/shop/*` → `vault token create -policy=shop-read -ttl=1h`.

- Политика по умолчанию — «ничего нельзя»; права выдаются по путям. В KV v2 путь в политике — с `data/` (содержимое) и `metadata/` (версии, список).
- Root-токен — только для первичной настройки, в работе его отзывают. Приложения входят своими способами аутентификации: **AppRole** (role_id + secret_id), **Kubernetes auth** (по токену ServiceAccount пода), JWT/OIDC из CI — без долгоживущих паролей.
- Короткие TTL и аудит (`vault audit enable file ...`) — каждое чтение секрета видно в журнале.
- Ещё сильнее — **динамические секреты**: движок database выдаёт приложению временного пользователя PostgreSQL на час и сам его удаляет.
```

### Версии секрета

Пароль базы ротировали: в `secret/shop/db` записали новую версию, и приложение сломалось. Нужно срочно узнать **предыдущий** пароль. Найдите, какое значение `password` было **в версии 1** секрета `secret/shop/db`, и запишите его в `~/old-password.txt`. Текущую версию не трогайте.

```bash setup
lab_vault
old="Old-$(tr -dc a-z0-9 </dev/urandom | head -c 8)"; echo "$old" > /var/lib/lab/vault-old
lab_v kv put secret/shop/db username=app password="$old" >/dev/null
lab_v kv put secret/shop/db username=app password="New-$(tr -dc a-z0-9 </dev/urandom | head -c 8)" >/dev/null
lab_v kv get -format=json secret/shop/db | jq -r .data.metadata.version > /var/lib/lab/vault-ver
rm -f /home/student/old-password.txt
```

```bash check
[ -f /home/student/old-password.txt ] || fail "Нет ~/old-password.txt"
[ "$(tr -d '[:space:]' < /home/student/old-password.txt)" = "$(cat /var/lib/lab/vault-old)" ] || fail "В ~/old-password.txt не пароль из версии 1"
[ "$(lab_v kv get -format=json secret/shop/db | jq -r .data.metadata.version)" = "$(cat /var/lib/lab/vault-ver)" ] || fail "Секрет изменён — появилась новая версия (откат или запись)"
ok "пароль версии 1 найден, текущая версия не тронута"
```

```text hint
1. KV v2 хранит историю версий: метаданные секрета показывают, сколько их и когда созданы.
2. У команды чтения есть ключ номера версии и ключ «вывести только одно поле».
```

```bash solution
export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root
vault kv metadata get secret/shop/db
vault kv get -version=1 -field=password secret/shop/db > ~/old-password.txt
```

```text review
Эталон: `vault kv metadata get` → `vault kv get -version=1 -field=password secret/shop/db`.

- KV v2 хранит версии (по умолчанию 10, `max_versions`): можно прочитать старую, откатиться `vault kv rollback -version=1` (создаёт новую версию со старыми данными), удалить версию с возможностью восстановления (`delete`/`undelete`) или безвозвратно (`destroy`).
- Ротация без простоя: приложение должно перечитывать секрет (Vault Agent или External Secrets сами обновят файл/Secret), а старый пароль некоторое время продолжает работать на стороне базы.
```

## Тест

### Почему секреты не хранят в Git, даже в приватном репозитории?
- [x] Их видят все, у кого есть доступ к репозиторию, и они остаются в истории навсегда
- [x] Нет аудита чтения и удобной ротации
- [ ] Git не поддерживает спецсимволы
- [ ] Git удаляет файлы с паролями
> Хранилище секретов даёт шифрование, права, аудит и ротацию.

### Что означает состояние sealed у Vault?
- [ ] Vault удалён
- [x] Данные на диске есть, но Vault не может их расшифровать, пока его не распечатают ключом
- [ ] Vault работает в режиме только чтения
- [ ] Vault перегружен
> После каждого перезапуска узел стартует запечатанным.

### Как работает распечатывание по схеме Шамира?
- [ ] Нужен один пароль администратора
- [x] Ключ разбит на N частей, и для распечатывания нужно ввести любые K из них (например, 3 из 5)
- [ ] Ключ хранится в Git
- [ ] Распечатывание происходит автоматически всегда
> Части раздают разным людям, чтобы ни один человек не мог распечатать Vault в одиночку.

### Что даёт auto-unseal?
- [ ] Отключает шифрование
- [x] Vault распечатывается автоматически с помощью внешнего KMS, HSM или другого Vault, без ручного ввода частей ключа
- [ ] Удаляет root-токен
- [ ] Ускоряет чтение секретов
> Вместо частей ключа выдаются recovery keys для административных операций.

### Чем KV v2 отличается от KV v1?
- [ ] KV v2 не шифрует данные
- [x] KV v2 хранит историю версий секретов, поддерживает мягкое удаление и восстановление
- [ ] KV v1 поддерживает только один секрет
- [ ] Разницы нет
> В политиках у KV v2 используются пути с data/ и metadata/.

### Какой путь нужно указать в политике, чтобы разрешить чтение секретов KV v2, смонтированного в secret/, по пути shop/prod?
- [ ] `secret/shop/prod/*`
- [x] `secret/data/shop/prod/*`
- [ ] `kv/shop/prod/*`
- [ ] `shop/prod/*`
> Это частая ошибка при переходе с KV v1.

### Какой командой прочитать только поле password секрета?
- [ ] vault read password
- [x] vault kv get -mount=secret -field=password shop/prod/db
- [ ] vault kv list password
- [ ] vault secrets get password
> -format=json выводит секрет целиком в JSON.

### Чем vault kv delete отличается от vault kv destroy?
- [x] delete — мягкое удаление последней версии, её можно вернуть через undelete
- [x] destroy безвозвратно удаляет данные указанных версий
- [ ] destroy удаляет весь Vault
- [ ] Это одно и то же
> Полностью ключ со всеми версиями удаляет vault kv metadata delete.

### Какой метод аутентификации лучше подходит подам в Kubernetes?
= kubernetes
= kubernetes auth
> Под предъявляет токен ServiceAccount, Vault проверяет его через API Kubernetes.

### Как устроена аутентификация AppRole?
- [ ] Только логин и пароль человека
- [x] Пара role_id (идентификатор роли) и secret_id (секрет, который доставляется отдельно и коротко живёт), в обмен выдаётся токен с политиками
- [ ] Через SSH-ключ
- [ ] Через сертификат Kubernetes
> Подходит для программ на ВМ и CI.

### Что такое динамические секреты?
- [ ] Секреты, которые часто меняют вручную
- [x] Учётные данные, которые Vault создаёт по запросу с ограниченным сроком жизни и автоматически отзывает, например временный пользователь PostgreSQL
- [ ] Секреты в переменных окружения
- [ ] Зашифрованные файлы в Git
> Утёкший временный пароль быстро становится бесполезным.

### Как External Secrets Operator доставляет секреты из Vault в Kubernetes?
- [ ] Записывает их в Git
- [x] По ресурсам SecretStore (подключение к Vault) и ExternalSecret (какие ключи взять) создаёт и обновляет обычный Kubernetes Secret
- [ ] Монтирует весь Vault в под
- [ ] Отправляет секреты по почте
> В GitOps-репозитории хранятся только ссылки, а не значения.

### Что такое OpenBao?
- [ ] Облачная версия Vault от HashiCorp
- [x] Открытый форк Vault под MPL 2.0 в Linux Foundation, созданный после перехода Vault на BSL
- [ ] Плагин для Argo CD
- [ ] Формат секретов Kubernetes
> Команда — bao, API и конфигурация в основном совместимы с Vault.
