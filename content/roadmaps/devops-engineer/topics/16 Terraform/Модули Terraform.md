---
title: Модули Terraform
slug: moduli-terraform
description: Модули для переиспользования кода — корневой и дочерние модули, структура main.tf, variables.tf, outputs.tf, входы с типами и валидацией, выходы, вызов через блок module, источники — локальные пути, Git с тегами, реестр, версии, композиция модулей, когда модуль нужен и когда нет, тестирование и документация.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: Terraform Docs — Creating Modules
    url: https://developer.hashicorp.com/terraform/language/modules/develop
    type: документация
  - title: Terraform Docs — Standard Module Structure
    url: https://developer.hashicorp.com/terraform/language/modules/develop/structure
    type: документация
  - title: Yandex Cloud — Использование модулей Terraform
    url: https://yandex.cloud/en/docs/terraform/tutorials/terraform-modules
    type: документация
---

# Модули Terraform

**Модуль** — набор `.tf`-файлов в одном каталоге. Каталог, где вы запускаете `terraform plan`, — **корневой модуль**; он может вызывать **дочерние** модули. Модуль — как функция: принимает **входы** (variables), создаёт ресурсы, возвращает **выходы** (outputs).

Зачем:

- **не копировать** одинаковый код для dev/staging/prod и разных сервисов;
- **стандартизировать**: «наша ВМ» всегда с метками, группой безопасности, мониторингом и бэкапами;
- скрыть сложность: команда пишет `module "postgres"` с пятью параметрами вместо сорока ресурсов.

## Структура модуля

```
modules/
└── vm/
    ├── main.tf        — ресурсы
    ├── variables.tf   — входы (с описаниями!)
    ├── outputs.tf     — выходы
    ├── versions.tf    — required_providers
    └── README.md      — назначение, пример, входы/выходы
```

`modules/vm/variables.tf`:

```hcl
variable "name" {
  type        = string
  description = "Имя ВМ"
}

variable "subnet_id" {
  type        = string
  description = "Подсеть, в которой создаётся ВМ"
}

variable "cores" {
  type    = number
  default = 2
}

variable "memory_gb" {
  type    = number
  default = 2
}

variable "public_ip" {
  type    = bool
  default = false
}

variable "security_group_ids" {
  type    = list(string)
  default = []
}

variable "labels" {
  type    = map(string)
  default = {}
}
```

`modules/vm/main.tf`:

```hcl
data "yandex_compute_image" "ubuntu" {
  family = "ubuntu-2404-lts"
}

resource "yandex_compute_instance" "this" {
  name        = var.name
  platform_id = "standard-v3"

  resources {
    cores  = var.cores
    memory = var.memory_gb
  }

  boot_disk {
    initialize_params {
      image_id = data.yandex_compute_image.ubuntu.id
      size     = 20
    }
  }

  network_interface {
    subnet_id          = var.subnet_id
    nat                = var.public_ip
    security_group_ids = var.security_group_ids
  }

  labels = merge({ managed = "terraform" }, var.labels)
}
```

`modules/vm/outputs.tf`:

```hcl
output "id" {
  value = yandex_compute_instance.this.id
}

output "private_ip" {
  value = yandex_compute_instance.this.network_interface[0].ip_address
}

output "public_ip" {
  value = yandex_compute_instance.this.network_interface[0].nat_ip_address
}
```

Провайдер в переиспользуемом модуле **не настраивают** (блок `provider` — в корневом модуле), а только указывают `required_providers`.

## Вызов модуля

```hcl
module "web" {
  source = "./modules/vm"

  for_each           = toset(["web-1", "web-2"])
  name               = each.key
  subnet_id          = module.network.subnet_ids["d"]
  public_ip          = false
  security_group_ids = [module.network.web_sg_id]
  labels             = { role = "web", env = var.env }
}

output "web_ips" {
  value = { for k, m in module.web : k => m.private_ip }
}
```

- Выходы модуля доступны как `module.<имя>.<output>` — так модули связываются: `module.network` отдаёт id подсетей → `module.web` их принимает.
- После добавления или смены `source` — `terraform init` (модули скачиваются в `.terraform/modules`).
- Ресурсы модуля в state имеют адреса вида `module.web["web-1"].yandex_compute_instance.this`.

## Источники модулей

```hcl
module "network" {
  source = "./modules/network"
}

module "vm" {
  source = "git::https://gitlab.example.com/infra/terraform-modules.git//vm?ref=v1.4.0"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"
}
```

- **Локальный путь** — модули в том же репозитории.
- **Git** с `?ref=v1.4.0` — **закрепляйте версию тегом**, а не веткой `main`: иначе изменения модуля внезапно прилетят во все окружения.
- **Реестр** — публичный (в примере — популярный модуль сети для AWS) или приватный, например GitLab Terraform Module Registry; версия задаётся через `version`.
- Изменения модуля выпускают **новой версией** и обновляют окружения по очереди: dev → staging → prod.

## Хороший модуль

- Решает **одну понятную задачу** (сеть, ВМ, база, кластер), а не «вся инфраструктура».
- Наружу — только **часто меняемые** параметры с разумными значениями по умолчанию; всё остальное — внутри.
- Переменные с `type`, `description`, `validation`; выходы с описаниями.
- Без жёстко прописанных окружений, имён и id — всё через входы.
- Неглубокая вложенность: лучше **композиция** плоских модулей в корневом, чем модуль в модуле в модуле.
- README с примером, автодокументация входов и выходов (terraform-docs), примеры в `examples/`.
- Тесты: `terraform validate`, линтер **tflint**, проверки безопасности (**Checkov**, Trivy), `terraform test` (с 1.6) — разворачивание во временном каталоге облака и проверка выходов.

Когда модуль **не нужен**: код используется один раз и не повторится — обёртка ради обёртки только усложнит чтение.

## Практика

- [ ] Вынести создание ВМ в локальный модуль modules/vm с входами, выходами и README
- [ ] Вынести сеть, подсети и группы безопасности в модуль modules/network и связать его выходы со входами модуля vm
- [ ] Создать две ВМ одним вызовом модуля с for_each и вывести их адреса
- [ ] Добавить в переменные модуля type, description и validation; передать неверное значение и увидеть ошибку
- [ ] Перенести модули в отдельный Git-репозиторий, поставить тег v1.0.0 и подключить через source с ref
- [ ] Выпустить v1.1.0 с изменением и обновить сначала dev, потом prod
- [ ] Прогнать tflint и Checkov по модулям и исправить найденное
- [ ] Открыть популярный модуль из публичного реестра и разобрать его входы, выходы и структуру каталогов

## Лаборатория

Ресурсы — контейнеры Docker (провайдер `kreuzwerker/docker`).

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

### Свой модуль

В `~/tf/sites` создайте модуль **`modules/site`**, который поднимает nginx-контейнер:

- входные переменные: **`name`** (имя контейнера) и **`port`** (внешний порт, число);
- output **`url`** — `http://localhost:<port>`.

В корневой конфигурации вызовите модуль **дважды**: `site_a` — контейнер `site-a` на порту **8191**, `site_b` — `site-b` на порту **8192**; выведите их URL в outputs **`site_a_url`** и **`site_b_url`**. Примените.

```bash setup
lab_tfdir /home/student/tf/sites
docker rm -f site-a site-b >/dev/null 2>&1; true
```

```bash check
d=/home/student/tf/sites
[ -d $d/modules/site ] || fail "Нет модуля ~/tf/sites/modules/site"
grep -qE 'variable\s+"name"' $d/modules/site/*.tf && grep -qE 'variable\s+"port"' $d/modules/site/*.tf || fail "У модуля нет входных переменных name и port"
grep -qE 'output\s+"url"' $d/modules/site/*.tf || fail "У модуля нет output url"
st=$(su - student -c "cd $d && terraform state list" 2>/dev/null)
for m in site_a site_b; do echo "$st" | grep -qE "^module\.$m\.docker_container\." || fail "В state нет контейнера модуля $m"; done
for p in site-a:8191 site-b:8192; do
  n=${p%%:*}; port=${p#*:}
  [ "$(docker inspect -f '{{.State.Running}}' $n 2>/dev/null)" = true ] || fail "Контейнер $n не запущен"
  curl -s --max-time 3 localhost:$port | grep -q 'Welcome to nginx' || fail "localhost:$port не отдаёт nginx"
done
[ "$(su - student -c "cd $d && terraform output -raw site_b_url" 2>/dev/null)" = http://localhost:8192 ] || fail "output site_b_url не http://localhost:8192"
[ "$(lab_tfclean $d)" = 0 ] || fail "terraform plan находит изменения: $(lab_tflog)"
ok "два экземпляра модуля site: 8191 и 8192"
```

```text hint
1. Модуль — просто каталог с файлами .tf: переменные, ресурсы, outputs. Провайдер модуль получает от корневой конфигурации (в модуле достаточно required_providers).
2. В корне — два блока module с путём к каталогу и значениями переменных; output корня ссылается на output модуля.
3. После добавления модулей нужна повторная инициализация.
```

```bash solution
d=~/tf/sites && mkdir -p $d/modules/site && cd $d
cat > modules/site/main.tf <<'EOF'
terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker", version = "~> 3.0" }
  }
}

variable "name" { type = string }
variable "port" { type = number }

resource "docker_image" "nginx" {
  name         = "nginx:1.27-alpine"
  keep_locally = true
}

resource "docker_container" "this" {
  name  = var.name
  image = docker_image.nginx.image_id
  ports {
    internal = 80
    external = var.port
  }
}

output "url" {
  value = "http://localhost:${var.port}"
}
EOF
cat > main.tf <<'EOF'
terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker", version = "~> 3.0" }
  }
}

provider "docker" {}

module "site_a" {
  source = "./modules/site"
  name   = "site-a"
  port   = 8191
}

module "site_b" {
  source = "./modules/site"
  name   = "site-b"
  port   = 8192
}

output "site_a_url" { value = module.site_a.url }
output "site_b_url" { value = module.site_b.url }
EOF
terraform init -input=false
terraform apply -auto-approve
terraform output
```

```text review
Эталон — в «Решении».

- Модуль = «функция» инфраструктуры: входы (variables), результат (outputs), внутренности скрыты. Один модуль «сервис» — десять сервисов одинаково правильно (с мониторингом, бэкапами, метками).
- Источники модулей: локальный путь, Git с тегом (`git::https://...//modules/site?ref=v1.2.0`), Terraform Registry. Версию **фиксируют** — иначе изменение модуля незаметно поменяет все проекты.
- Для множества одинаковых экземпляров — `for_each` у модуля: `for_each = { a = 8191, b = 8192 }`.
- Хороший модуль делает одно дело, имеет описания и типы переменных, разумные значения по умолчанию и проверки `validation`.
```

## Тест

### Что такое модуль в Terraform?
- [ ] Провайдер облака
- [x] Набор .tf-файлов в одном каталоге с входами, ресурсами и выходами — переиспользуемый блок инфраструктуры
- [ ] Файл state
- [ ] Отдельная программа
> Каталог, где запускают plan, — корневой модуль.

### Как получить выходное значение дочернего модуля network?
- [ ] var.network.subnet_id
- [x] module.network.subnet_id (если модуль объявил output subnet_id)
- [ ] data.network.subnet_id
- [ ] output.network.subnet_id
> Так связывают модули между собой.

### Какие файлы входят в стандартную минимальную структуру модуля?
- [x] main.tf
- [x] variables.tf
- [x] outputs.tf
- [ ] terraform.tfstate
> Плюс README и versions.tf.

### Почему модуль из Git нужно подключать с конкретным тегом через ref?
- [ ] Без ref модуль не скачается
- [x] Иначе изменения в ветке main внезапно применятся во всех окружениях при следующем init
- [ ] Теги быстрее скачиваются
- [ ] Git не поддерживает ветки
> Новые версии модулей выкатывают по окружениям постепенно.

### Что нужно выполнить после добавления нового модуля или смены его source?
= terraform init
> Модули скачиваются в каталог .terraform/modules.

### Где должен настраиваться блок provider при использовании переиспользуемых модулей?
- [ ] В каждом модуле
- [x] В корневом модуле; дочерний модуль указывает только required_providers
- [ ] Только в outputs.tf
- [ ] Нигде
> Так один модуль работает в разных каталогах, аккаунтах и регионах.

### Какие параметры стоит выносить во входные переменные модуля?
- [ ] Абсолютно все аргументы всех ресурсов
- [x] Часто меняемые параметры с разумными значениями по умолчанию; остальное оставить внутри модуля
- [ ] Никакие
- [ ] Только пароли
> Слишком «универсальный» модуль трудно понять и поддерживать.

### Зачем в переменных модуля указывать type и validation?
- [ ] Для ускорения apply
- [x] Чтобы ошибки во входных данных обнаруживались сразу на этапе plan с понятным сообщением
- [ ] Это обязательно для outputs
- [ ] Чтобы скрыть значения
> description к тому же служит документацией.

### Какая структура модулей рекомендуется?
- [ ] Как можно больше уровней вложенности
- [x] Относительно плоская: композиция небольших модулей в корневом модуле
- [ ] Один модуль на всю компанию
- [ ] Модули без выходов
> Глубокая вложенность затрудняет переиспользование.

### Какие инструменты помогают проверять Terraform-модули?
- [x] tflint
- [x] Checkov или Trivy для проверок безопасности
- [x] terraform test
- [ ] pg_dump
> Плюс terraform validate и fmt в CI.

### Когда модуль создавать не стоит?
- [ ] Когда код повторяется в трёх окружениях
- [x] Когда код используется один раз и не будет переиспользован — обёртка только усложнит чтение
- [ ] Когда ресурсов больше двух
- [ ] Модуль нужен всегда
> Модуль должен решать понятную задачу.

### Как выглядит адрес ресурса внутри модуля в state?
- [ ] yandex_compute_instance.this
- [x] module.web["web-1"].yandex_compute_instance.this
- [ ] web.yandex.this
- [ ] state.module.web
> Его используют в terraform state show и в блоках moved.
