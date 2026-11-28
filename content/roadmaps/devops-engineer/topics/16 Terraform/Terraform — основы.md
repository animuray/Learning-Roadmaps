---
title: Terraform — основы
slug: terraform-osnovy
description: Инфраструктура как код и декларативный подход, Terraform и OpenTofu, язык HCL, провайдеры и зеркало для России, ресурсы и источники данных, переменные, locals и outputs, зависимости и граф, цикл init, fmt, validate, plan, apply и destroy, lock-файл провайдеров, count и for_each, lifecycle, import и типичные ошибки.
duration: 120
level: Средний
quizSize: 10
materials:
  - title: Yandex Cloud — Начало работы с Terraform
    url: https://yandex.cloud/en/docs/terraform/quickstart
    type: документация
  - title: Terraform Docs — Manage values in modules (variables, locals, outputs)
    url: https://developer.hashicorp.com/terraform/language/values
    type: документация
  - title: Yandex Cloud — ошибка Failed to query available provider packages (зеркало)
    url: https://yandex.cloud/en/docs/troubleshooting/terraform/known-issues/failed-to-quety-available-provider-packages
    type: документация
  - title: OpenTofu Manifesto
    url: https://opentofu.org/manifesto
    type: статья
---

# Terraform — основы

**Infrastructure as Code (IaC)** — инфраструктура описывается в файлах, лежит в Git, проходит ревью и применяется автоматически. Никаких «я тогда руками в консоли создал, не помню, с какими настройками».

**Terraform** — самый распространённый IaC-инструмент для облаков. Он **декларативный**: вы описываете **желаемое состояние** («нужна сеть, две подсети, ВМ»), а Terraform сам вычисляет, что создать, изменить или удалить.

| | Terraform | Ansible |
| --- | --- | --- |
| Задача | **Создать** инфраструктуру: сети, ВМ, базы, бакеты, DNS | **Настроить** то, что внутри серверов: пакеты, конфиги, службы |
| Подход | Декларативный, хранит state | Процедурный (задачи по порядку), без state |
| Вместе | Terraform создаёт ВМ → cloud-init или Ansible настраивает | |

> [!note] Лицензия и OpenTofu
> В 2023 году HashiCorp перевёл Terraform с открытой MPL 2.0 на **BSL 1.1** (не open source). Сообщество сделало форк **OpenTofu** под MPL 2.0, проект живёт в Linux Foundation и CNCF. Команды и синтаксис совместимы (`tofu init`, `tofu plan`), провайдеры общие. Всё ниже применимо к обоим. Текущая ветка Terraform — 1.16.

## Установка и провайдеры в России

**Провайдер** — плагин, который умеет работать с API конкретной системы: `yandex-cloud/yandex`, `selectel/selectel`, `hashicorp/aws`, `kubernetes`, `helm`, `cloudflare`, `gitlab`, `grafana`…

HashiCorp блокирует российские IP при скачивании Terraform и провайдеров из своего реестра. Решение — зеркало Yandex Cloud. Бинарник Terraform скачивают с зеркала, а в `~/.terraformrc` прописывают:

```hcl
provider_installation {
  network_mirror {
    url     = "https://terraform-mirror.yandexcloud.net/"
    include = ["registry.terraform.io/*/*"]
  }
  direct {
    exclude = ["registry.terraform.io/*/*"]
  }
}
```

OpenTofu использует свой реестр (`registry.opentofu.org`).

## Первая конфигурация

```
infra/
├── versions.tf      — версии Terraform и провайдеров
├── providers.tf     — настройки провайдеров
├── variables.tf     — входные переменные
├── main.tf          — ресурсы
├── outputs.tf       — выходные значения
└── terraform.tfvars — значения переменных (секреты — не в Git!)
```

`versions.tf`:

```hcl
terraform {
  required_version = ">= 1.10"
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "~> 0.150"
    }
  }
}
```

`providers.tf`:

```hcl
provider "yandex" {
  folder_id = var.folder_id
  zone      = "ru-central1-d"
}
```

Учётные данные — **не в коде**: переменные окружения `YC_TOKEN` или `YC_SERVICE_ACCOUNT_KEY_FILE` (ключ сервисного аккаунта).

`main.tf`:

```hcl
resource "yandex_vpc_network" "app" {
  name = "app-net"
}

resource "yandex_vpc_subnet" "app_d" {
  name           = "app-d"
  zone           = "ru-central1-d"
  network_id     = yandex_vpc_network.app.id
  v4_cidr_blocks = ["10.10.3.0/24"]
}

data "yandex_compute_image" "ubuntu" {
  family = "ubuntu-2404-lts"
}

resource "yandex_compute_instance" "web" {
  name        = "web-1"
  platform_id = "standard-v3"

  resources {
    cores         = 2
    memory        = 2
    core_fraction = 20
  }

  boot_disk {
    initialize_params {
      image_id = data.yandex_compute_image.ubuntu.id
      size     = 20
    }
  }

  network_interface {
    subnet_id = yandex_vpc_subnet.app_d.id
    nat       = true
  }

  metadata = {
    user-data = file("${path.module}/cloud-init.yaml")
  }

  labels = local.common_labels
}
```

## Язык HCL: главное

- **resource** `"тип" "имя"` — объект, которым управляет Terraform. Адрес: `yandex_compute_instance.web`.
- **data** — **источник данных**: прочитать то, что уже существует (образ, существующая сеть, зона DNS), не управляя им.
- **Ссылки** `yandex_vpc_network.app.id` создают **неявные зависимости**: Terraform строит граф и создаёт сеть раньше подсети. Явная зависимость — `depends_on` (нужна редко).
- **variable** — входы, **locals** — вычисляемые значения внутри, **output** — что вывести (и передать в другие конфигурации):

```hcl
variable "folder_id" {
  type        = string
  description = "Каталог Yandex Cloud"
}

variable "web_count" {
  type    = number
  default = 2
  validation {
    condition     = var.web_count >= 1 && var.web_count <= 10
    error_message = "От 1 до 10 веб-серверов."
  }
}

variable "db_password" {
  type      = string
  sensitive = true
}

locals {
  common_labels = {
    project = "shop"
    env     = terraform.workspace
    managed = "terraform"
  }
}

output "web_public_ip" {
  value = yandex_compute_instance.web.network_interface[0].nat_ip_address
}
```

Значения переменных: `terraform.tfvars`, `*.auto.tfvars`, `-var-file=prod.tfvars`, `-var 'web_count=3'`, переменные окружения `TF_VAR_db_password`.

### Несколько одинаковых ресурсов

```hcl
resource "yandex_compute_instance" "worker" {
  count = var.web_count
  name  = "worker-${count.index + 1}"
}

resource "yandex_vpc_subnet" "zone" {
  for_each       = { a = "10.10.1.0/24", b = "10.10.2.0/24", d = "10.10.3.0/24" }
  name           = "app-${each.key}"
  zone           = "ru-central1-${each.key}"
  network_id     = yandex_vpc_network.app.id
  v4_cidr_blocks = [each.value]
}
```

`for_each` по ключам лучше `count` для разных объектов: удаление элемента из середины списка при `count` пересоздаёт все последующие ресурсы.

### lifecycle

```hcl
lifecycle {
  prevent_destroy       = true
  create_before_destroy = true
  ignore_changes        = [metadata]
}
```

`prevent_destroy` — защита от случайного удаления важного (база, бакет с бэкапами).

## Рабочий цикл

```bash
terraform init
terraform fmt -recursive
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
terraform output
terraform state list
terraform destroy
```

- **init** — скачать провайдеры и модули, настроить backend; создаёт `.terraform/` (не в Git) и **`.terraform.lock.hcl`** (фиксирует версии и хеши провайдеров — **в Git**).
- **plan** — показать, что изменится: `+` создать, `~` изменить на месте, `-/+` **пересоздать** (опасно для баз и ВМ с данными!), `-` удалить. Читайте план внимательно.
- **apply** — применить; с сохранённым файлом плана применяется ровно то, что вы проверили.
- **destroy** — удалить всё, чем управляет конфигурация.

## Импорт и дрейф

- **Дрейф (drift)** — кто-то поменял ресурс руками в консоли. `terraform plan` покажет расхождение и предложит вернуть описанное в коде состояние.
- **Импорт** существующего ресурса под управление Terraform — блок `import` (с 1.5) или команда:

```hcl
import {
  to = yandex_vpc_network.legacy
  id = "enp1234567890abcdef"
}
```

`terraform plan -generate-config-out=generated.tf` сгенерирует описание импортируемого ресурса.

## Частые ошибки

- Секреты в `.tf`/`.tfvars` в Git и в **state** (state хранит значения в открытом виде — см. следующую тему).
- `.terraform/` и `*.tfstate` в Git; нет `.gitignore`.
- `apply` без чтения плана → пересоздание базы.
- Ручные изменения в консоли после Terraform.
- Версии провайдеров без ограничений → неожиданные изменения после `init -upgrade`.

## Практика

- [ ] Установить Terraform или OpenTofu и настроить зеркало провайдеров в ~/.terraformrc
- [ ] Создать сервисный аккаунт для Terraform и передать ключ через переменную окружения
- [ ] Описать сеть, подсеть и ВМ с cloud-init; выполнить init, fmt, validate, plan и apply
- [ ] Вывести публичный IP через output и подключиться к ВМ по SSH
- [ ] Изменить размер диска и тип платформы — посмотреть в плане разницу между изменением на месте и пересозданием
- [ ] Создать три подсети через for_each и несколько ВМ через count
- [ ] Поменять что-нибудь у ВМ вручную в консоли и найти дрейф через terraform plan
- [ ] Импортировать вручную созданную сеть через блок import
- [ ] Добавить .gitignore для .terraform, tfstate и tfvars с секретами, закоммитить .terraform.lock.hcl
- [ ] Удалить всё через terraform destroy

## Лаборатория

Облака на стенде нет, поэтому «инфраструктура» в задачах — локальные файлы (провайдер `hashicorp/local`) и контейнеры Docker (провайдер `kreuzwerker/docker`). Язык, команды и state — ровно те же, что для AWS или Yandex Cloud.

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

### Первый ресурс

В `~/tf/hello` опишите конфигурацию Terraform:

- провайдер **`hashicorp/local`** (версия `~> 2.5`) в блоке `required_providers`;
- переменная **`greeting`** со значением по умолчанию `Привет, Terraform`;
- ресурс **`local_file.hello`** — файл `out/hello.txt` в каталоге проекта с содержимым из переменной;
- output **`hello_path`** — путь к файлу.

Примените конфигурацию. Повторный `terraform plan` не должен находить изменений.

```bash setup
lab_tfdir /home/student/tf/hello
```

```bash check
d=/home/student/tf/hello
ls $d/*.tf >/dev/null 2>&1 || fail "В ~/tf/hello нет файлов .tf"
grep -qE 'hashicorp/local' $d/*.tf || fail "Провайдер hashicorp/local не объявлен в required_providers"
[ -f $d/terraform.tfstate ] || fail "Конфигурация не применена: нет terraform.tfstate"
su - student -c "cd $d && terraform state list" 2>/dev/null | grep -qx 'local_file.hello' || fail "В state нет ресурса local_file.hello"
[ "$(cat $d/out/hello.txt 2>/dev/null)" = "Привет, Terraform" ] || fail "out/hello.txt отсутствует или содержимое не «Привет, Terraform»"
[ "$(lab_tfclean $d)" = 0 ] || fail "terraform plan находит изменения: $(lab_tflog)"
o=$(su - student -c "cd $d && terraform output -raw hello_path" 2>/dev/null)
[ -n "$o" ] || fail "Нет output hello_path"
lab_tf $d "apply -auto-approve -input=false -var greeting=Проверка" && [ "$(cat $d/out/hello.txt)" = Проверка ] || fail "Содержимое файла не берётся из переменной greeting"
lab_tf $d "apply -auto-approve -input=false"
ok "local_file.hello создан, hello_path = $o"
```

```text hint
1. Блок terraform с required_providers: источник провайдера и ограничение версии.
2. Переменная — блок variable с типом и значением по умолчанию; ресурс файла — имя файла (путь проекта доступен выражением path.module) и содержимое; output — значение, которое Terraform печатает после применения.
3. Порядок работы: инициализация (скачать провайдеры), план, применение. Повторный план после применения — «No changes».
```

```bash solution
cd ~/tf/hello
cat > main.tf <<'EOF'
terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

variable "greeting" {
  type    = string
  default = "Привет, Terraform"
}

resource "local_file" "hello" {
  filename = "${path.module}/out/hello.txt"
  content  = var.greeting
}

output "hello_path" {
  value = local_file.hello.filename
}
EOF
terraform init -input=false
terraform plan
terraform apply -auto-approve
terraform plan -detailed-exitcode && echo "изменений нет"
```

```text review
Эталон — в «Решении».

- Цикл Terraform: `init` (провайдеры и backend) → `plan` (сравнить код, state и реальность) → `apply` → state обновлён. `plan` перед каждым `apply` — обязательный ритуал, в CI его вывод смотрят в merge request.
- Ограничение версии провайдера (`~> 2.5` — 2.5 и выше, но не 3.0) и файл `.terraform.lock.hcl` (коммитится!) дают одинаковые версии у всей команды.
- `.terraform/` и `*.tfstate` в Git не кладут: первый — скачанные провайдеры, второй — состояние, часто с секретами (следующая тема — удалённый state).
- `terraform fmt` и `terraform validate` — первые шаги проверки кода в CI.
```

### Контейнер через Terraform

В `~/tf/web` опишите через провайдер **`kreuzwerker/docker`** (версия `~> 3.0`):

- образ `nginx:1.27-alpine` (`docker_image`, **не удалять** образ при destroy);
- контейнер **`tf-web`** (`docker_container`) из этого образа с портом **8190** на хосте → 80.

Примените. Затем **кто-то вручную удалил контейнер** (`docker rm -f tf-web`) — восстановите его тоже через Terraform, без правки кода.

```bash setup
lab_tfdir /home/student/tf/web
docker rm -f tf-web >/dev/null 2>&1; true
```

```bash check
d=/home/student/tf/web
grep -qE 'kreuzwerker/docker' $d/*.tf 2>/dev/null || fail "Провайдер kreuzwerker/docker не объявлен"
st=$(su - student -c "cd $d && terraform state list" 2>/dev/null)
echo "$st" | grep -qE '^docker_container\.' || fail "В state нет docker_container"
echo "$st" | grep -qE '^docker_image\.' || fail "В state нет docker_image"
[ "$(docker inspect -f '{{.State.Running}}' tf-web 2>/dev/null)" = true ] || fail "Контейнер tf-web не запущен"
curl -s --max-time 3 localhost:8190 | grep -q 'Welcome to nginx' || fail "localhost:8190 не отдаёт nginx"
grep -qE 'keep_locally\s*=\s*true' $d/*.tf || fail "Образ будет удалён при terraform destroy — нужно keep_locally = true"
docker rm -f tf-web >/dev/null
[ "$(lab_tfclean $d)" = 2 ] || fail "После ручного удаления контейнера terraform plan не видит расхождения"
lab_tf $d "apply -auto-approve -input=false" || fail "terraform apply не смог восстановить контейнер: $(lab_tflog)"
[ "$(docker inspect -f '{{.State.Running}}' tf-web 2>/dev/null)" = true ] || fail "terraform apply не восстановил tf-web"
ok "tf-web управляется Terraform: удалённый вручную контейнер возвращается apply"
```

```text hint
1. Провайдер Docker подключается к локальному демону без настроек — пустой блок provider.
2. Ресурс образа: имя образа и флаг «оставлять локально». Ресурс контейнера: имя, ссылка на образ (атрибут ресурса образа) и блок портов: внутренний и внешний.
3. После ручного удаления посмотрите план: Terraform сравнивает state с реальностью и хочет вернуть описанное состояние.
```

```bash solution
cd ~/tf/web
cat > main.tf <<'EOF'
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
  name  = "tf-web"
  image = docker_image.nginx.image_id
  ports {
    internal = 80
    external = 8190
  }
}
EOF
terraform init -input=false
terraform apply -auto-approve
docker rm -f tf-web
terraform plan
terraform apply -auto-approve
```

```text review
Эталон — в «Решении».

- **Drift** (дрейф) — реальность разошлась с кодом (кто-то поправил руками в консоли облака). `terraform plan` его показывает, `apply` возвращает описанное состояние. Регулярный `plan` по расписанию в CI — способ ловить дрейф.
- `docker_container.web.image = docker_image.nginx.image_id` — ссылка на атрибут создаёт **зависимость**: Terraform сам выстроит порядок (сначала образ, потом контейнер) и параллелит независимое. Граф — `terraform graph`.
- `keep_locally` — образом пользуются и другие, удалять его при `destroy` нельзя. В облаке аналог — `prevent_destroy` в `lifecycle` для баз и бакетов с данными.
```

## Тест

### Чем Terraform отличается от Ansible?
- [x] Terraform декларативно создаёт и изменяет инфраструктуру — сети, ВМ, базы — и хранит её состояние
- [x] Ansible настраивает то, что внутри серверов: пакеты, конфигурацию, службы
- [ ] Ansible создаёт облачные сети лучше Terraform
- [ ] Это одно и то же
> Их часто используют вместе.

### Что означает декларативный подход Terraform?
- [ ] Нужно описать каждый шаг создания по порядку
- [x] Описывается желаемое состояние, а Terraform сам вычисляет, что создать, изменить или удалить
- [ ] Terraform работает только через консоль облака
- [ ] Всё создаётся вручную
> Порядок определяется графом зависимостей между ресурсами.

### Что такое провайдер в Terraform?
- [ ] Облачная компания
- [x] Плагин, который умеет работать с API конкретной системы: облака, Kubernetes, DNS
- [ ] Файл состояния
- [ ] Модуль из реестра
> Например, yandex-cloud/yandex или hashicorp/aws.

### Чем блок data отличается от resource?
- [x] resource описывает объект, которым Terraform управляет: создаёт, меняет, удаляет
- [x] data только читает существующий объект, например образ ОС или существующую сеть
- [ ] data создаёт ресурсы быстрее
- [ ] Разницы нет
> Источники данных не изменяют инфраструктуру.

### Какая команда скачивает провайдеры и настраивает backend?
= terraform init
> Её запускают первой в каждой новой директории конфигурации.

### Что означает символ `-/+` в выводе terraform plan?
- [ ] Ресурс изменится на месте
- [x] Ресурс будет удалён и создан заново — для ВМ и баз это может означать потерю данных
- [ ] Ресурс будет импортирован
- [ ] Ничего не изменится
> Всегда внимательно читайте план перед apply.

### Нужно ли коммитить файл .terraform.lock.hcl?
- [x] Да — он фиксирует версии и хеши провайдеров, чтобы у всех и в CI были одинаковые версии
- [ ] Нет, его генерирует каждый сам
- [ ] Нет, в нём хранятся пароли
- [ ] Его вообще нельзя создавать
> Каталог .terraform и файлы state в Git не коммитят.

### Как Terraform понимает, что подсеть нужно создать после сети?
- [ ] По порядку блоков в файле
- [x] По ссылке на атрибут сети (например, yandex_vpc_network.app.id) — это неявная зависимость в графе
- [ ] По алфавиту имён
- [ ] Это нужно указывать вручную всегда
> Явный depends_on нужен редко.

### Почему for_each часто лучше count для набора разных объектов?
- [ ] count не поддерживается
- [x] Ресурсы for_each адресуются по ключам; при удалении элемента из середины списка count сдвигает индексы и пересоздаёт следующие ресурсы
- [ ] for_each быстрее скачивает провайдеры
- [ ] count нельзя использовать с переменными
> count удобен для N одинаковых объектов.

### Как защитить ресурс, например бакет с бэкапами, от случайного удаления через Terraform?
- [ ] Удалить его из state
- [x] Добавить lifecycle с prevent_destroy = true
- [ ] Выставить count = 0
- [ ] Не указывать имя
> План с удалением такого ресурса завершится ошибкой.

### Как передать секретное значение переменной, не записывая его в файлы?
- [ ] Вписать в main.tf
- [x] Через переменную окружения TF_VAR_имя и пометить переменную sensitive = true
- [ ] Закоммитить terraform.tfvars
- [ ] Через output
> sensitive скрывает значение в выводе, но в state оно всё равно хранится.

### Что такое OpenTofu?
- [ ] Платная версия Terraform
- [x] Открытый форк Terraform под MPL 2.0 в Linux Foundation, созданный после перехода Terraform на BSL
- [ ] Провайдер для Yandex Cloud
- [ ] Альтернатива Ansible для настройки серверов
> Команды и синтаксис совместимы с Terraform.

### Как в России обычно устанавливают провайдеры Terraform?
- [ ] Только через VPN
- [x] Через зеркало, например terraform-mirror.yandexcloud.net, прописанное в provider_installation файла ~/.terraformrc
- [ ] Копируют исходники вручную
- [ ] Провайдеры не нужны
> HashiCorp блокирует доступ к своему реестру с российских IP.
