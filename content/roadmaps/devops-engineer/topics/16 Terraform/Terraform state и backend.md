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

## Лаборатория

Ресурсы в задачах — файлы (`hashicorp/local`) и контейнеры Docker (`kreuzwerker/docker`). PostgreSQL на стенде (порт 5432) годится и как **backend** для state — в Terraform есть встроенный backend `pg` с блокировками.

```bash lib
# Terraform 1.x на стенде; провайдеры скачиваются из registry.terraform.io (кэш — ~/.terraform.d/plugin-cache).
# Инфраструктура в задачах — файлы (hashicorp/local) и контейнеры Docker (kreuzwerker/docker).
lab_tf() { su - student -c "cd $1 && terraform $2" > /tmp/lab-tf.log 2>&1; }
# план без изменений: 0 — ничего не меняется, 2 — есть изменения, 1 — ошибка
lab_tfclean() { su - student -c "cd $1 && terraform plan -detailed-exitcode -input=false -lock=false" > /tmp/lab-tf.log 2>&1; echo $?; }
lab_tflog() { sed 's/\x1b\[[0-9;]*m//g' /tmp/lab-tf.log | grep -E 'Error|will be|must be|#' | head -3 | tr '\n' ' ' | cut -c1-250; }
lab_tfdir() { rm -rf "$1"; mkdir -p "$1"; chown -R student:student "$(dirname "$1")"; }
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
```

### State в общем хранилище

Проект `~/tf/app` применён, но его state лежит локальным файлом — команда с ним работать не сможет. Перенесите state в backend **`pg`**: база **`tfstate`**, схема **`app`**, строка подключения `postgres://tf:tf-pass@localhost/tfstate?sslmode=disable` (роль и база уже созданы). Существующее состояние должно **переехать**, а не создаться заново: после переноса `terraform plan` — без изменений, локального `terraform.tfstate` больше нет.

```bash setup
lab_tfdir /home/student/tf/app
sudo -u postgres psql -qX -c "DROP DATABASE IF EXISTS tfstate WITH (FORCE)" -c "DROP ROLE IF EXISTS tf" >/dev/null 2>&1
sudo -u postgres psql -qX -c "CREATE ROLE tf LOGIN PASSWORD 'tf-pass'" -c "CREATE DATABASE tfstate OWNER tf" >/dev/null
cat > /home/student/tf/app/main.tf <<'EOF'
terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

resource "local_file" "config" {
  filename = "${path.module}/out/app.conf"
  content  = "port=8080\n"
}
EOF
chown -R student:student /home/student/tf
su - student -c 'cd ~/tf/app && terraform init -input=false >/dev/null && terraform apply -auto-approve -input=false >/dev/null'
```

```bash check
d=/home/student/tf/app
grep -qE 'backend\s+"pg"' $d/*.tf || fail "В конфигурации нет backend \"pg\""
[ -s $d/terraform.tfstate ] && fail "Локальный terraform.tfstate всё ещё есть — state не перенесён (или остался дубликат)"
n=$(PGPASSWORD=tf-pass psql -h localhost -U tf -d tfstate -qXtA -c "select count(*) from app.states where name = 'default'" 2>/dev/null)
[ "$n" = 1 ] || fail "В базе tfstate (схема app) нет state рабочего пространства default"
PGPASSWORD=tf-pass psql -h localhost -U tf -d tfstate -qXtA -c "select data from app.states where name = 'default'" | grep -q 'local_file' || fail "В state из базы нет ресурса local_file.config — он не перенесён, а создан пустым"
[ "$(lab_tfclean $d)" = 0 ] || fail "После переноса terraform plan находит изменения: $(lab_tflog)"
ok "state в PostgreSQL (tfstate.app.states), plan — без изменений"
```

```text hint
1. Добавить в блок terraform описание backend нужного типа со строкой подключения и именем схемы.
2. Смена backend требует повторной инициализации — с ключом «перенести состояние» Terraform сам скопирует текущий state в новое хранилище (и спросит подтверждение; для скрипта есть ключ «не спрашивать»).
3. Убедиться, что план пуст, и удалить старые локальные файлы state (в том числе резервную копию).
```

```bash solution
cd ~/tf/app
cat > backend.tf <<'EOF'
terraform {
  backend "pg" {
    conn_str    = "postgres://tf:tf-pass@localhost/tfstate?sslmode=disable"
    schema_name = "app"
  }
}
EOF
terraform init -migrate-state -force-copy -input=false
rm -f terraform.tfstate terraform.tfstate.backup
terraform plan -detailed-exitcode && echo "изменений нет"
```

```text review
Эталон: `backend "pg"` → `terraform init -migrate-state`.

- State — карта «ресурс в коде ↔ объект в реальности». Потеряли state — Terraform попытается создать всё заново (и упрётся в уже существующие ресурсы). Два человека с разными копиями state — гонка и порча инфраструктуры.
- Удалённый backend решает это: одно хранилище и **блокировка** на время `apply`. В облаках — S3 (с блокировкой через DynamoDB или встроенной `use_lockfile`), GCS, Azure Blob, Terraform Cloud, GitLab-managed state (HTTP backend).
- В state бывают секреты (пароли баз в атрибутах) — хранилище state шифруют и ограничивают доступ.
- Пароль в `conn_str` в коде — плохо: в жизни его передают переменной окружения `PG_CONN_STR` или через `-backend-config`.
```

```text notes
rm\s+[^\n]*tfstate[^\n]*&&[^\n]*init\s+(?![^\n]*migrate) => Похоже, локальный state удаляли до переноса — так ресурсы теряются из-под управления. Сначала init -migrate-state, потом удаление.
```

### Переименовать ресурс без пересоздания

В проекте `~/tf/rename` контейнер описан как `docker_container.web`. По договорённости команды его нужно назвать **`docker_container.frontend`**. Переименуйте ресурс в коде так, чтобы Terraform **не пересоздавал** контейнер (он работает с пользователями): после переименования `terraform plan` — без изменений, ID контейнера `tf-frontend` тот же.

```bash setup
lab_tfdir /home/student/tf/rename
docker rm -f tf-frontend >/dev/null 2>&1
cat > /home/student/tf/rename/main.tf <<'EOF'
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

resource "docker_image" "nginx" {
  name         = "nginx:1.27-alpine"
  keep_locally = true
}

resource "docker_container" "web" {
  name  = "tf-frontend"
  image = docker_image.nginx.image_id
}
EOF
chown -R student:student /home/student/tf
su - student -c 'cd ~/tf/rename && terraform init -input=false >/dev/null && terraform apply -auto-approve -input=false >/dev/null'
docker inspect -f '{{.Id}}' tf-frontend > /var/lib/lab/tf-frontend-id
```

```bash check
d=/home/student/tf/rename
grep -qE 'resource\s+"docker_container"\s+"frontend"' $d/*.tf || fail "В коде нет resource \"docker_container\" \"frontend\""
grep -qE 'resource\s+"docker_container"\s+"web"' $d/*.tf && fail "В коде остался docker_container.web"
st=$(su - student -c "cd $d && terraform state list" 2>/dev/null)
echo "$st" | grep -qx 'docker_container.frontend' || fail "В state нет docker_container.frontend"
[ "$(docker inspect -f '{{.Id}}' tf-frontend 2>/dev/null)" = "$(cat /var/lib/lab/tf-frontend-id)" ] || fail "Контейнер tf-frontend пересоздан (другой ID)"
[ "$(lab_tfclean $d)" = 0 ] || fail "terraform plan находит изменения: $(lab_tflog)"
ok "docker_container.web → docker_container.frontend, контейнер тот же"
```

```text hint
1. Если просто переименовать ресурс в коде, Terraform решит: старый удалить, новый создать. Посмотрите план и убедитесь.
2. Сообщить Terraform о переименовании можно декларативно — специальным блоком в коде «откуда → куда», либо командой перемещения адреса в state.
3. План после этого должен показать перемещение без пересоздания (или вовсе «No changes»), затем apply.
```

```bash solution
cd ~/tf/rename
sed -i 's/resource "docker_container" "web"/resource "docker_container" "frontend"/' main.tf
cat >> main.tf <<'EOF'

moved {
  from = docker_container.web
  to   = docker_container.frontend
}
EOF
terraform plan
terraform apply -auto-approve
terraform state list
```

```text review
Эталон: переименование в коде + блок `moved { from = docker_container.web; to = docker_container.frontend }` → `apply`.

- `moved` — декларативный рефакторинг: изменение видно в ревью, применяется на всех окружениях одинаково. Старый способ — `terraform state mv docker_container.web docker_container.frontend` руками в каждом state.
- Так же переносят ресурсы в модуль (`to = module.web.docker_container.this`). Блок `moved` можно убрать, когда все окружения применены.
- Родственное: `import` (взять под управление созданный вручную ресурс, есть блок `import {}`), `terraform state rm` (перестать управлять, не удаляя).
- Пересоздание по ошибке — частая авария: «переименовал ресурс базы — Terraform её удалил». Поэтому план читают глазами, а для важного ставят `lifecycle { prevent_destroy = true }`.
```

```text notes
state\s+mv => Использовался terraform state mv — работает, но это ручная операция над одним state. Блок moved в коде переносится на все окружения и виден в ревью.
```

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
