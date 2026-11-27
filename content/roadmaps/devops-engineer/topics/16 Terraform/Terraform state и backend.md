---
title: Terraform state и backend
slug: terraform-state-i-backend
description: Что хранит terraform.tfstate и зачем он нужен, почему его нельзя терять и хранить в Git, удалённый backend в S3-совместимом хранилище, блокировка state через lockfile или YDB/DynamoDB, версионирование бакета, команды terraform state, remote state между конфигурациями, разделение state, восстановление и безопасность.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: Yandex Cloud — Загрузка состояний Terraform в Object Storage
    url: https://yandex.cloud/en/docs/storage/tutorials/terraform-state-storage
    type: документация
  - title: Yandex Cloud — Блокировка состояний Terraform с помощью Managed Service for YDB
    url: https://yandex.cloud/ru/docs/tutorials/infrastructure-management/terraform-state-lock
    type: документация
  - title: Terraform Docs — Backend s3 (use_lockfile)
    url: https://developer.hashicorp.com/terraform/language/v1.17.x/backend/s3
    type: документация
  - title: Terraform v1.11 — S3 native state locking
    url: https://developer.hashicorp.com/terraform/language/v1.11.x/upgrade-guides
    type: документация
---

# Terraform state и backend

## Что такое state

После `apply` Terraform записывает в **state** (`terraform.tfstate`, JSON) соответствие между кодом и реальными объектами:

```
 код:   yandex_compute_instance.web   ←→   state: id = fhm1abc..., ip = 10.10.3.5, все атрибуты   ←→   облако: ВМ fhm1abc...
```

Зачем:

- знать, **какие объекты** управляются конфигурацией (ВМ с таким же именем, созданная руками, Terraform не трогает);
- вычислять **разницу** в `plan` между кодом, state и реальностью;
- хранить атрибуты, которые нужны другим ресурсам (id, IP);
- ускорять работу с большой инфраструктурой.

**Потеря state** — Terraform «забывает» инфраструктуру: следующий `apply` попытается создать всё заново (дубли, конфликты имён), а старые ресурсы придётся импортировать вручную.

## Почему не локальный файл и не Git

| Проблема | Последствие |
| --- | --- |
| Файл на ноутбуке | Ноутбук сломался — state потерян; коллега не может работать |
| Файл в Git | **Секреты в открытом виде** (пароли баз, ключи, приватные ключи) попадают в историю; конфликты при одновременной работе |
| Два человека запустили apply одновременно | Повреждённый state и непредсказуемая инфраструктура |

> [!warning] В state лежат секреты
> `sensitive = true` скрывает значения только в выводе, но **в state они хранятся открытым текстом**. Доступ к хранилищу state — как к хранилищу паролей: минимальный, по ролям, с шифрованием и аудитом.

## Удалённый backend

**Backend** определяет, где хранится state. Стандарт — **S3-совместимое хранилище** (Yandex Object Storage, Selectel, AWS S3); также бывают `pg` (PostgreSQL), `gcs`, `azurerm`, `kubernetes`, `http` (GitLab-managed state), HCP Terraform.

Yandex Object Storage (Terraform 1.6+):

```hcl
terraform {
  backend "s3" {
    endpoints = {
      s3 = "https://storage.yandexcloud.net"
    }
    bucket = "shop-tfstate-7f3a"
    key    = "prod/network/terraform.tfstate"
    region = "ru-central1"

    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
```

```bash
export AWS_ACCESS_KEY_ID="<id_статического_ключа>"
export AWS_SECRET_ACCESS_KEY="<секретный_ключ>"
terraform init
terraform init -migrate-state
terraform init -backend-config=backend-prod.hcl
```

- Блок `backend` **не поддерживает переменные** — значения для разных окружений передают через `-backend-config` (partial configuration).
- `-migrate-state` переносит существующий локальный state в новый backend.
- Бакет для state создают **отдельно** (вручную или отдельной bootstrap-конфигурацией) — курица и яйцо: Terraform не может хранить state в бакете, который сам же создаёт в этой конфигурации.

Настройки бакета для state:

- **закрытый**, доступ только у сервисного аккаунта Terraform и CI;
- **версионирование** включено — можно откатиться на предыдущую версию испорченного state;
- шифрование (KMS), правило жизненного цикла для старых версий;
- `prevent_destroy` в bootstrap-конфигурации.

## Блокировка state

Пока идёт `apply`, state **блокируется**: второй запуск получит ошибку `Error acquiring the state lock` (или подождёт, если задан `-lock-timeout=5m`), а не испортит state.

- **S3-нативная блокировка** — `use_lockfile = true` (с Terraform 1.10, GA в 1.11): рядом со state создаётся файл `.tflock` с условной записью. Требует поддержки условных запросов хранилищем — проверяйте у своего провайдера.
- **DynamoDB-совместимая таблица** — `dynamodb_table` (в AWS теперь устаревает в пользу lockfile). В Yandex Cloud для этого используют **Managed Service for YDB** с DynamoDB-совместимым API (`dynamodb_endpoint` + таблица с ключом `LockID`) — так описано в официальном руководстве.
- Другие backend'ы (`pg`, `http` GitLab, HCP) блокируют сами.

Если процесс упал и блокировка «зависла»: убедиться, что никто не применяет изменения, затем `terraform force-unlock <LOCK_ID>`.

## Команды для работы со state

```bash
terraform state list
terraform state show yandex_compute_instance.web
terraform state mv yandex_compute_instance.web yandex_compute_instance.frontend
terraform state rm yandex_vpc_network.legacy
terraform state pull > backup.tfstate
terraform refresh
terraform plan -refresh-only
```

- `state mv` — переименовать ресурс в коде без пересоздания (сейчас удобнее блок `moved` в коде).
- `state rm` — «отпустить» ресурс: он останется в облаке, но Terraform перестанет им управлять (сейчас есть блок `removed`).
- **Никогда не редактируйте state вручную** без крайней необходимости и бэкапа.

```hcl
moved {
  from = yandex_compute_instance.web
  to   = yandex_compute_instance.frontend
}
```

## Remote state и разделение

Один огромный state на всю компанию — медленный `plan`, большой радиус поражения, блокировки мешают всем. Делят по **слоям** и **окружениям**:

```
 prod/network/terraform.tfstate     — сети, подсети, NAT
 prod/database/terraform.tfstate    — managed PostgreSQL
 prod/k8s/terraform.tfstate         — кластер
 dev/network/terraform.tfstate ...
```

Одна конфигурация читает outputs другой:

```hcl
data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    endpoints = { s3 = "https://storage.yandexcloud.net" }
    bucket    = "shop-tfstate-7f3a"
    key       = "prod/network/terraform.tfstate"
    region    = "ru-central1"

    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

resource "yandex_compute_instance" "app" {
  network_interface {
    subnet_id = data.terraform_remote_state.network.outputs.subnet_ids["d"]
  }
}
```

Альтернатива remote state — читать существующие ресурсы через `data` по имени или меткам.

## Практика

- [ ] Посмотреть локальный terraform.tfstate после apply и найти в нём id, IP и секреты
- [ ] Создать отдельной bootstrap-конфигурацией закрытый бакет для state с версионированием и prevent_destroy
- [ ] Перенести state в Object Storage через terraform init -migrate-state и удалить локальный файл
- [ ] Настроить блокировку state (lockfile или YDB по руководству провайдера) и запустить plan из двух терминалов одновременно
- [ ] Переименовать ресурс через блок moved и убедиться, что plan не пересоздаёт его
- [ ] Разделить конфигурацию на network и app, передать id подсети через terraform_remote_state
- [ ] Испортить state (например, удалить ресурс из него через state rm), найти проблему в plan и восстановить предыдущую версию state из версионированного бакета
- [ ] Настроить разные ключи backend для dev и prod через -backend-config

## Тест

### Зачем Terraform нужен state?
- [x] Чтобы знать, какие реальные объекты соответствуют ресурсам в коде
- [x] Чтобы вычислять разницу между кодом и инфраструктурой в plan
- [ ] Чтобы хранить исходный код конфигурации
- [ ] Чтобы скачивать провайдеры
> Без state Terraform «забывает» созданную инфраструктуру.

### Что произойдёт, если потерять state?
- [ ] Ничего, Terraform восстановит его сам
- [x] Terraform перестанет знать о созданных ресурсах и при apply попытается создать их заново; старые придётся импортировать
- [ ] Вся инфраструктура удалится
- [ ] Провайдеры перестанут работать
> Поэтому state хранят в надёжном удалённом backend с версионированием.

### Почему state нельзя хранить в Git?
- [x] В state открытым текстом лежат секреты: пароли, ключи, токены
- [x] Одновременная работа приводит к конфликтам и порче state без блокировок
- [ ] Git не поддерживает JSON
- [ ] Terraform не читает файлы из Git
> Используют удалённый backend с закрытым доступом.

### Скрывает ли sensitive = true значение переменной в state?
- [ ] Да, в state оно зашифровано
- [x] Нет: sensitive скрывает значение только в выводе команд, а в state оно хранится открытым текстом
- [ ] Да, оно вообще не записывается
- [ ] Только в OpenTofu
> Доступ к state нужно защищать как к хранилищу паролей.

### Зачем нужна блокировка state?
- [ ] Чтобы никто не мог читать код
- [x] Чтобы два одновременных apply не испортили state и инфраструктуру
- [ ] Чтобы ускорить plan
- [ ] Чтобы шифровать state
> Второй запуск получит ошибку блокировки; с -lock-timeout он подождёт освобождения.

### Какой параметр включает нативную блокировку state в backend s3?
= use_lockfile
= use_lockfile = true
> Блокировка через DynamoDB-таблицу в AWS признана устаревшей.

### Почему блок backend нельзя параметризовать переменными и как передать разные значения для окружений?
- [ ] Можно, через var.*
- [x] Backend настраивается до загрузки переменных, поэтому значения передают через terraform init -backend-config
- [ ] Только через terraform.tfvars
- [ ] Это невозможно вообще
> Это называется partial configuration.

### Что сделать, если блокировка state «зависла» после упавшего процесса?
- [ ] Удалить бакет
- [x] Убедиться, что никто не применяет изменения, и выполнить terraform force-unlock с идентификатором блокировки
- [ ] Удалить state
- [ ] Перезапустить облако
> Снимать чужую активную блокировку опасно.

### Как переименовать ресурс в коде, чтобы Terraform его не пересоздал?
- [ ] Просто поменять имя
- [x] Добавить блок moved с from и to (или выполнить terraform state mv)
- [ ] Удалить и создать заново
- [ ] Использовать count
> Без этого plan покажет удаление старого и создание нового ресурса.

### Зачем включать версионирование бакета со state?
- [ ] Для ускорения init
- [x] Чтобы восстановить предыдущую версию state, если текущая повреждена или удалена
- [ ] Чтобы Terraform сам делал откат инфраструктуры
- [ ] Это обязательно для работы backend
> Это страховка от ошибок с state.

### Как одной конфигурации Terraform получить outputs другой?
- [ ] Скопировать значения вручную
- [x] Через data "terraform_remote_state", который читает state другой конфигурации из backend
- [ ] Через модуль с тем же именем
- [ ] Это невозможно
> Альтернатива — найти существующие ресурсы через data-источники по имени или меткам.

### Почему state делят по слоям и окружениям?
- [x] Меньше радиус поражения ошибки и быстрее plan
- [x] Команды не блокируют друг друга одним общим state
- [ ] Terraform не поддерживает больше 10 ресурсов в state
- [ ] Так требует S3
> Например, prod/network, prod/database, dev/network.
