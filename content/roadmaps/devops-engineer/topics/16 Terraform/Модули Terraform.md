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
