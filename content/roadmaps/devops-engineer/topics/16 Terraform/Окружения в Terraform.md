---
title: Окружения в Terraform
slug: okruzheniya-v-terraform
description: Как описать dev, staging и prod одним кодом — tfvars-файлы, каталоги окружений с общими модулями, workspaces и их ограничения, отдельный state и отдельные каталоги или облака для изоляции, продвижение изменений между окружениями, Terraform в CI/CD с plan в merge request, Terragrunt и Atlantis.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: Terraform Docs — Creating Modules
    url: https://developer.hashicorp.com/terraform/language/modules/develop
    type: документация
  - title: Terraform Docs — Manage values in modules
    url: https://developer.hashicorp.com/terraform/language/values
    type: документация
  - title: Yandex Cloud — Загрузка состояний Terraform в Object Storage
    url: https://yandex.cloud/en/docs/storage/tutorials/terraform-state-storage
    type: документация
---

# Окружения в Terraform

Обычно нужно минимум три окружения:

- **dev** — для разработки и экспериментов, дешёвое, можно ломать;
- **staging** — копия прода по архитектуре, для проверки перед выкаткой;
- **prod** — боевое, изменения только через ревью и CI.

Цель: **один и тот же код** (модули) с **разными параметрами** (размеры, число узлов, домены) и **изолированными** состояниями и доступами, чтобы ошибка в dev не задела prod.

## Параметры: tfvars

```hcl
variable "env" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env — dev, staging или prod."
  }
}

variable "web_count" {
  type = number
}

variable "db_preset" {
  type = string
}

variable "db_hosts" {
  type = number
}
```

`dev.tfvars`:

```hcl
env       = "dev"
web_count = 1
db_preset = "s3-c2-m8"
db_hosts  = 1
```

`prod.tfvars`:

```hcl
env       = "prod"
web_count = 3
db_preset = "s3-c8-m32"
db_hosts  = 3
```

```bash
terraform plan -var-file=prod.tfvars
```

Различия окружений — **только в значениях переменных**, а не в копиях кода с ручными правками.

## Способ 1: каталоги окружений (рекомендуемый)

```
infra/
├── modules/
│   ├── network/
│   ├── vm/
│   └── postgres/
└── envs/
    ├── dev/
    │   ├── main.tf          — вызовы модулей
    │   ├── backend.tf       — key = "dev/terraform.tfstate"
    │   └── terraform.tfvars
    ├── staging/
    └── prod/
        ├── main.tf
        ├── backend.tf       — key = "prod/terraform.tfstate"
        └── terraform.tfvars
```

`envs/prod/main.tf`:

```hcl
module "network" {
  source = "../../modules/network"
  env    = var.env
  cidrs  = { a = "10.30.1.0/24", b = "10.30.2.0/24", d = "10.30.3.0/24" }
}

module "web" {
  source    = "../../modules/vm"
  for_each  = toset([for i in range(var.web_count) : "web-${i + 1}"])
  name      = "${var.env}-${each.key}"
  subnet_id = module.network.subnet_ids["d"]
  labels    = { env = var.env }
}
```

Плюсы: у каждого окружения **свой state**, свой backend, свои права; видно в файлах, что где развёрнуто; можно закрепить для prod старую версию модуля, пока новая тестируется в dev.

Минус: немного повторяющегося «клея» (вызовы модулей). Его убирают **Terragrunt** (обёртка над Terraform: общие backend и входы через `terragrunt.hcl`, DRY) или генерацией.

## Способ 2: workspaces

```bash
terraform workspace new dev
terraform workspace new prod
terraform workspace select prod
terraform workspace list
terraform plan -var-file=prod.tfvars
```

Одна конфигурация, отдельный state на каждый workspace (в S3 — `env:/prod/...`). В коде доступно `terraform.workspace`.

Ограничения:

- **один backend и одни учётные данные** на все окружения — сложно дать CI права только на dev;
- легко ошибиться, применив изменения не в том workspace (текущий выбранный не виден в коде);
- нельзя иметь разные версии модулей для dev и prod.

Workspaces удобны для **временных одинаковых копий** (стенд на каждую ветку, тестовые окружения), а для dev/staging/prod чаще выбирают каталоги.

## Изоляция окружений

| Уровень | Как |
| --- | --- |
| **State** | Отдельный ключ или бакет для каждого окружения |
| **Облачные ресурсы** | Отдельный каталог (folder) или облако на окружение в Yandex Cloud, отдельный проект или аккаунт у других провайдеров |
| **Доступы** | Отдельные сервисные аккаунты для Terraform dev и prod; у dev нет прав на prod |
| **Сеть** | Разные облачные сети и непересекающиеся CIDR; prod не доступен из dev без явных правил |
| **Секреты** | Разные пароли и ключи; секреты prod — только в защищённых переменных CI или Vault |
| **Квоты и расходы** | Метки `env`, бюджеты, отдельный биллинг prod |

## Продвижение изменений

```
 ветка feature ──► MR: terraform plan для dev и prod (вывод в комментарии)
                     │ ревью
                     ▼
 merge в main ──► apply dev (автоматически) ──► apply staging ──► apply prod (ручное подтверждение)
```

Терраформ в CI (например, GitLab CI):

- `fmt -check`, `validate`, **tflint**, **Checkov/Trivy** на каждый MR;
- `plan -out` сохраняется артефактом, а `apply` применяет **именно этот план**;
- `apply` для prod — `when: manual` и только из защищённой ветки; учётные данные prod — в protected-переменных;
- `-lock-timeout`, чтобы параллельные пайплайны ждали блокировку;
- регулярный `plan` по расписанию для обнаружения **дрейфа**.

Готовые решения: **Atlantis** (plan/apply командами в комментариях к MR), GitLab-managed Terraform state, Spacelift, env0, HCP Terraform.

## Практика

- [ ] Разложить свою конфигурацию на modules и envs/dev, envs/prod с отдельными backend-ключами
- [ ] Вынести различия окружений в terraform.tfvars каждого окружения и добавить validation для env
- [ ] Создать для dev и prod отдельные каталоги в облаке и отдельные сервисные аккаунты с правами только на свой каталог
- [ ] Развернуть dev и prod с непересекающимися CIDR и проверить, что из dev нет доступа к базе prod
- [ ] Попробовать workspaces на временном стенде: создать, переключиться, удалить; найти, где лежат их state
- [ ] Настроить GitLab CI: fmt, validate, tflint и plan на MR, apply dev после merge, apply prod вручную
- [ ] Обновить версию модуля сначала в dev, проверить и только потом в prod
- [ ] Настроить ночной plan по расписанию и сделать ручное изменение в консоли, чтобы увидеть обнаружение дрейфа

## Тест

### Чем должны отличаться окружения dev и prod в Terraform?
- [ ] Отдельными копиями кода с ручными правками
- [x] Значениями переменных (tfvars), состоянием и доступами при общем коде модулей
- [ ] Только названием каталога
- [ ] Ничем
> Различия в коде делают окружения непредсказуемыми.

### Как применить параметры конкретного окружения из файла?
- [ ] terraform apply prod
- [x] terraform plan -var-file=prod.tfvars (и затем apply)
- [ ] terraform init prod.tfvars
- [ ] terraform env prod
> terraform.tfvars и *.auto.tfvars подхватываются автоматически.

### Какие преимущества у раскладки по каталогам envs/dev, envs/prod?
- [x] У каждого окружения свой state, backend и права доступа
- [x] Можно закрепить для prod другую версию модуля, пока новая тестируется в dev
- [ ] Код вообще не повторяется
- [ ] Не нужен backend
> Повторяющийся «клей» убирают Terragrunt или генерацией.

### Какой главный недостаток workspaces для разделения dev и prod?
- [ ] Их нельзя создать
- [x] Один backend и одни учётные данные на все окружения, и легко применить изменения не в том workspace
- [ ] Они не хранят state
- [ ] Они работают только в OpenTofu
> Workspaces удобны для временных одинаковых стендов.

### Какая переменная содержит имя текущего workspace?
= terraform.workspace
> Её используют, например, в именах и метках ресурсов.

### Как изолировать prod от dev в облаке?
- [x] Отдельный каталог или облако для каждого окружения
- [x] Отдельные сервисные аккаунты Terraform с правами только на своё окружение
- [x] Отдельные сети с непересекающимися CIDR и разные секреты
- [ ] Один общий state на всё
> Ошибка в dev не должна затрагивать prod.

### Как правильно применять изменения в prod через CI?
- [ ] Запускать apply с ноутбука разработчика
- [x] Сохранить план из MR артефактом и применить именно его вручную подтверждаемой задачей из защищённой ветки
- [ ] Автоматически применять любой push в любую ветку
- [ ] Применять без plan
> Учётные данные prod хранятся в защищённых переменных CI.

### В каком порядке выкатывать новую версию модуля?
- [ ] Сразу во все окружения
- [x] Сначала dev, затем staging, затем prod
- [ ] Сначала prod
- [ ] Порядок не важен
> Так ошибки ловятся до продакшена.

### Зачем запускать terraform plan по расписанию?
- [ ] Чтобы ускорить apply
- [x] Чтобы обнаружить дрейф — ручные изменения в облаке, расходящиеся с кодом
- [ ] Чтобы обновить провайдеры
- [ ] Чтобы удалить старые ресурсы
> Ненулевой план без изменений в коде — повод разобраться.

### Что такое Terragrunt?
- [ ] Провайдер Yandex Cloud
- [x] Обёртка над Terraform, которая убирает повторы: общие настройки backend и входов для многих окружений и модулей
- [ ] Форк Terraform
- [ ] Система мониторинга
> Альтернатива для автоматизации MR — Atlantis.

### Какой инструмент выполняет plan и apply по командам в комментариях к merge request?
= Atlantis
> Результат плана публикуется прямо в MR.

### Почему для prod выбирают более крупные параметры через tfvars, а не через отдельный модуль?
- [ ] Модули не поддерживают разные размеры
- [x] Чтобы архитектура окружений оставалась одинаковой, а отличались только значения — так staging действительно проверяет то, что уйдёт в prod
- [ ] tfvars быстрее
- [ ] Так требует облако
> Различия в архитектуре снижают ценность тестирования на staging.
