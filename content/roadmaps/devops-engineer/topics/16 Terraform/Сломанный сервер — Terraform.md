---
title: Сломанный сервер — Terraform
slug: slomannyj-server-terraform
description: Аварии с Terraform без подсказок в условии — apply падает, потому что ресурс уже создан руками; после обновления провайдера не работают ни init, ни plan. Import, lock-файл провайдеров и ограничения версий.
duration: 60
level: Практика
quizSize: 10
---

# Сломанный сервер — Terraform

Terraform ломается предсказуемо: расходятся три вещи — **код**, **state** и **реальность**. Плюс версии: самого Terraform, провайдеров и lock-файла. Главное правило аварии — не удалять ничего «чтобы прошло», пока не понятно, что Terraform собирается сделать.

## Алгоритм

1. **Прочитать план** целиком: `terraform plan`. Знаки `+` (создать), `~` (изменить), `-/+` (пересоздать — с простоем!), `-` (удалить).
2. **Что в state:** `terraform state list`, `terraform state show адрес`.
3. **Код ↔ state ↔ реальность:**

| Ситуация | Инструмент |
| --- | --- |
| Объект есть в реальности, но не в state («already exists») | `terraform import` или блок `import {}` |
| Ресурс переименован в коде | блок `moved {}` или `terraform state mv` |
| Объект больше не должен управляться Terraform | блок `removed {}` или `terraform state rm` |
| Объект изменили руками (drift) | `terraform plan -refresh-only`, затем вернуть в код или применить |
| Объект сломан и должен быть пересоздан | `terraform apply -replace=адрес` |

4. **Версии:** `terraform version`, `terraform providers`, `.terraform.lock.hcl`. Ограничения в коде (`required_version`, `required_providers`) и lock-файл должны быть согласованы; смена версии провайдера — `terraform init -upgrade`.

## Практика

- [ ] Пройти задачи лаборатории, первые 10 минут без подсказки
- [ ] Для каждой записать: симптом → что показал план → причина → решение
- [ ] В своём проекте импортировать в Terraform ресурс, созданный когда-то вручную, и добиться пустого плана

## Лаборатория

```bash lib
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
# Terraform 1.x на стенде; провайдеры скачиваются из registry.terraform.io (кэш — ~/.terraform.d/plugin-cache).
# Инфраструктура в задачах — файлы (hashicorp/local) и контейнеры Docker (kreuzwerker/docker).
lab_tf() { su - student -c "cd $1 && terraform $2" > /tmp/lab-tf.log 2>&1; }
# план без изменений: 0 — ничего не меняется, 2 — есть изменения, 1 — ошибка
lab_tfclean() { su - student -c "cd $1 && terraform plan -detailed-exitcode -input=false -lock=false" > /tmp/lab-tf.log 2>&1; echo $?; }
lab_tflog() { sed 's/\x1b\[[0-9;]*m//g' /tmp/lab-tf.log | grep -E 'Error|will be|must be|#' | head -3 | tr '\n' ' ' | cut -c1-250; }
lab_tfdir() { rm -rf "$1"; mkdir -p "$1"; chown -R student:student "$(dirname "$1")"; }
```

### Ресурс уже существует

Проект `~/tf/bs-net` описывает две сети Docker: `tf-backend` и `tf-frontend`. `terraform apply` падает. Выяснилось, что сеть `tf-backend` когда-то создали вручную, и к ней уже подключена работающая база (`tf-db`).

Почините так, чтобы `terraform apply` проходил, обе сети управлялись Terraform и `terraform plan` был пустым. Сеть `tf-backend` **не удалять и не пересоздавать** — база должна остаться в ней.

```bash setup
lab_img busybox:1.36
d=/home/student/tf/bs-net
lab_tfdir $d
docker rm -f tf-db >/dev/null 2>&1
docker network rm tf-backend tf-frontend >/dev/null 2>&1
cat > $d/main.tf <<'EOF'
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

resource "docker_network" "backend" {
  name = "tf-backend"
  ipam_config {
    subnet = "10.250.77.0/24"
  }
}

resource "docker_network" "frontend" {
  name = "tf-frontend"
}
EOF
chown -R student:student /home/student/tf
docker network create --subnet 10.250.77.0/24 tf-backend >/dev/null
docker run -d --name tf-db --network tf-backend busybox:1.36 sleep infinity >/dev/null
mkdir -p /var/lib/lab && docker network inspect -f '{{.Id}}' tf-backend > /var/lib/lab/tf-backend-id
su - student -c 'cd ~/tf/bs-net && terraform init -input=false >/dev/null'
```

```bash check
d=/home/student/tf/bs-net
[ "$(docker network inspect -f '{{.Id}}' tf-backend 2>/dev/null)" = "$(cat /var/lib/lab/tf-backend-id)" ] || fail "Сеть tf-backend удалена или пересоздана"
docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' tf-db 2>/dev/null | grep -qw tf-backend || fail "База tf-db больше не подключена к tf-backend"
grep -qE 'resource\s+"docker_network"\s+"backend"' $d/*.tf && grep -qE 'resource\s+"docker_network"\s+"frontend"' $d/*.tf || fail "В коде нет обеих сетей"
st=$(su - student -c "cd $d && terraform state list" 2>/dev/null)
echo "$st" | grep -qx 'docker_network.backend' || fail "Сети tf-backend нет в state"
echo "$st" | grep -qx 'docker_network.frontend' || fail "Сети tf-frontend нет в state"
[ "$(su - student -c "cd $d && terraform state show -no-color docker_network.backend" | awk -F'"' '$1 ~ /^ *id *= *$/ {print $2}')" = "$(cat /var/lib/lab/tf-backend-id)" ] || fail "В state за docker_network.backend числится другая сеть"
docker network inspect tf-frontend >/dev/null 2>&1 || fail "Сети tf-frontend нет в Docker"
[ "$(lab_tfclean $d)" = 0 ] || fail "terraform plan находит изменения: $(lab_tflog)"
ok "обе сети под управлением Terraform, tf-backend та же, plan пуст"
```

```text hint
1. Запустить применение и прочитать ошибку: какой объект Terraform пытается создать и почему не может.
2. Существующий объект нужно не создавать, а принять под управление: сообщить Terraform, какой реальный объект соответствует ресурсу в коде (по его идентификатору).
3. После этого посмотреть план: по этой сети не должно быть пересоздания. Если план хочет её заменить — найти атрибут с пометкой о пересоздании и описать в коде то, что есть в реальности. Затем применить, чтобы создалась вторая сеть.
```

```bash solution
cd ~/tf/bs-net
terraform apply -auto-approve -input=false -no-color 2>&1 | grep -A2 Error || true
docker network inspect -f '{{.Id}}' tf-backend
terraform import docker_network.backend "$(docker network inspect -f '{{.Id}}' tf-backend)"
terraform plan -no-color | grep -B2 -A4 'forces replacement' || true
sed -i 's|    subnet = "10.250.77.0/24"|    subnet  = "10.250.77.0/24"\n    gateway = "10.250.77.1"|' main.tf
terraform plan
terraform apply -auto-approve -input=false
terraform plan -detailed-exitcode && echo "изменений нет"
```

```text review
Причина: сеть `tf-backend` существовала в реальности, но не в state — Terraform считал, что её нужно создать, а Docker отвечал «already exists».

- `terraform import адрес ID` записывает существующий объект в state. С Terraform 1.5 то же можно описать в коде блоком `import { to = docker_network.backend  id = "…" }` — его видно в ревью, и `terraform plan -generate-config-out=gen.tf` даже напишет код ресурса по реальному объекту.
- После импорта **обязательно** смотрите план. Здесь код не описывал шлюз, а у реальной сети он есть (`10.250.77.1`), и `ipam_config` помечен «forces replacement»: примени план — и сеть пересоздали бы вместе с отключением базы. Правят код под реальность, а не наоборот.
- Удалить сеть руками, «чтобы Terraform создал заново», — простой для всего, что к ней подключено; а с базами и бакетами — потеря данных.
- Не все ресурсы импортируются чисто: у сложных (контейнеры, ВМ) после импорта часто остаются расхождения, которые нужно перенести в код.
```

```text notes
docker\s+network\s+rm => Сеть удаляли руками — так отключают всё, что к ней подключено. Существующий объект принимают под управление импортом.
state\s+push => Использовался state push — ручная правка state рискованна; для существующих объектов есть import.
```

### После обновления провайдера ничего не работает

В проекте `~/tf/bs-upgrade` решили перейти на провайдер `hashicorp/local` ветки **2.5** (нужна новая функция). Коллега поправил версии в коде, и теперь `terraform plan` не работает вовсе.

Почините так, чтобы `terraform plan` работал и был пустым, провайдер `local` был версии **2.5.x** (так и записано в lock-файле), а ограничение в коде не пускало ни 2.4, ни 2.6 и выше.

```bash setup
d=/home/student/tf/bs-upgrade
lab_tfdir $d
cat > $d/main.tf <<'EOF'
terraform {
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "= 2.4.1"
    }
  }
}

resource "local_file" "motd" {
  filename = "${path.module}/out/motd"
  content  = "Добро пожаловать\n"
}
EOF
chown -R student:student /home/student/tf
su - student -c 'cd ~/tf/bs-upgrade && terraform init -input=false >/dev/null && terraform apply -auto-approve -input=false >/dev/null'
sed -i 's/version = "= 2.4.1"/version = "~> 2.5.0"/; s/^terraform {/terraform {\n  required_version = ">= 2.0"\n/' $d/main.tf
chown -R student:student $d
```

```bash check
d=/home/student/tf/bs-upgrade
[ -f $d/.terraform.lock.hcl ] || fail "Нет .terraform.lock.hcl"
v=$(awk '/provider "registry.terraform.io\/hashicorp\/local"/ {f=1} f && /version/ {gsub(/"/, "", $3); print $3; exit}' $d/.terraform.lock.hcl)
echo "$v" | grep -qE '^2\.5\.' || fail "В lock-файле провайдер local версии ${v:-?}"
c=$(grep -A3 'hashicorp/local' $d/main.tf | grep -oE 'version\s*=\s*"[^"]+"' | head -1)
echo "$c" | grep -qE '"(~> ?2\.5\.0|>= ?2\.5(\.0)?, ?< ?2\.6(\.0)?)"' || fail "Ограничение версии провайдера в коде: ${c:-нет}"
r=$(lab_tfclean $d)
[ "$r" = 0 ] || fail "terraform plan $([ "$r" = 2 ] && echo 'находит изменения' || echo 'завершается ошибкой'): $(lab_tflog)"
su - student -c "cd $d && terraform state list" | grep -qx 'local_file.motd' || fail "Ресурса local_file.motd нет в state"
ok "провайдер local $v, plan пуст"
```

```text hint
1. Запустить план и прочитать первую ошибку: она про требования к версии самого Terraform. Сравнить их с установленной версией.
2. Следующая ошибка — про несогласованность версии провайдера в коде и в файле, где закреплены версии зависимостей. Прочитать, что предлагает сам Terraform.
3. Переинициализировать проект так, чтобы он заново выбрал версию провайдера в пределах ограничения и обновил файл блокировки; убедиться, что план пуст.
```

```bash solution
cd ~/tf/bs-upgrade
terraform version
terraform plan -no-color 2>&1 | grep -A3 Error | head -8 || true
sed -i 's/required_version = ">= 2.0"/required_version = ">= 1.5"/' main.tf
terraform plan -no-color 2>&1 | grep -A4 Error | head -8 || true
terraform init -upgrade -input=false
grep -A1 'hashicorp/local' .terraform.lock.hcl
terraform plan -detailed-exitcode && echo "изменений нет"
```

```text review
Две поломки:

1. `required_version = ">= 2.0"` — Terraform 2.0 не существует, установленная версия 1.x ограничению не соответствует: «Unsupported Terraform Core version». `required_version` — это **минимум** (или диапазон), при котором код работает, а не «поставить поновее».
2. В коде теперь `~> 2.5.0`, а в `.terraform.lock.hcl` закреплена 2.4.1: «locked provider … does not match configured version constraint». Lock-файл меняется только явно — `terraform init -upgrade`.

- `.terraform.lock.hcl` коммитят в репозиторий: все — и CI — используют ровно те же версии провайдеров с теми же контрольными суммами. Обновление провайдера — отдельный коммит с новым lock-файлом.
- `~> 2.5.0` — «только 2.5.x», исправления без новых функций. А `~> 2.5` — «2.5 и выше, но меньше 3.0»: `init -upgrade` поставил бы самую свежую 2.x. Разница в одной цифре — частая причина неожиданных обновлений.
- Удалять lock-файл «чтобы заработало» нельзя: так незаметно уезжают версии всех провайдеров.
- Если планируется смена мажорной версии провайдера — читать upgrade guide, сначала `plan` на копии окружения.
```

```text notes
rm\s+[^\n]*\.terraform\.lock\.hcl => Lock-файл удаляли — так незаметно меняются версии всех провайдеров. Версии обновляют через init -upgrade.
```

## Тест

### terraform apply падает: объект с таким именем уже существует. Что произошло?
- [ ] Ошибка провайдера, нужно обновить
- [x] Объект есть в реальности, но его нет в state — Terraform пытается создать его заново
- [ ] State повреждён
- [ ] Неверный backend
> Существующий объект нужно принять под управление импортом.

### Как записать в state уже существующий объект?
= terraform import
= terraform import адрес ID
> Или блок `import { to = … id = … }` в коде (Terraform 1.5+).

### Что обязательно сделать сразу после импорта?
- [ ] Удалить объект и создать заново
- [x] Посмотреть план: при расхождении кода и реальности Terraform захочет изменить или пересоздать объект
- [ ] Перезапустить Terraform
- [ ] Удалить lock-файл
> Код подгоняют под реальность до первого apply.

### Что значит в плане `-/+`?
- [ ] Обновление на месте
- [x] Пересоздание: удалить и создать заново (с простоем и потерей данных объекта)
- [ ] Ресурс только читается
- [ ] Импорт
> Смотрите, какой атрибут помечен «forces replacement».

### Ресурс переименовали в коде. Как избежать пересоздания?
- [ ] terraform import
- [x] Блок moved {} (или terraform state mv)
- [ ] terraform taint
- [ ] Ничего не делать
> moved сообщает, что объект просто сменил адрес в коде.

### Ошибка «locked provider … does not match configured version constraint». Решение?
- [ ] Удалить .terraform.lock.hcl
- [x] terraform init -upgrade — выбрать новую версию в пределах ограничения и обновить lock-файл
- [ ] terraform apply -lock=false
- [ ] Откатить Terraform
> Lock-файл обновляется только явно.

### Нужно ли коммитить .terraform.lock.hcl?
- [ ] Нет, это временный файл
- [x] Да: все участники и CI используют одни и те же версии и контрольные суммы провайдеров
- [ ] Только в публичных проектах
- [ ] Только вместе со state
> Каталог `.terraform/` не коммитят, lock-файл — коммитят.

### Что означает ограничение `~> 2.5`?
- [ ] Ровно 2.5.0
- [x] Не ниже 2.5 и ниже 3.0
- [ ] Любая версия выше 2.5
- [ ] Не ниже 2.5 и ниже 2.6
> Оператор «пессимистичного» ограничения разрешает рост только последней указанной части.

### Ошибка «Unsupported Terraform Core version». Где причина?
- [ ] В провайдере
- [x] В required_version блока terraform — установленная версия ему не соответствует
- [ ] В backend
- [ ] В state
> Ограничение на версию самого Terraform задаётся в коде.

### Как увидеть, какие провайдеры и с какими ограничениями требует конфигурация?
= terraform providers
> Показывает дерево требований модулей и провайдеров.

### Объект изменили руками в консоли облака. Как увидеть расхождение, ничего не меняя?
- [ ] terraform apply
- [x] terraform plan (или plan -refresh-only)
- [ ] terraform import
- [ ] terraform state rm
> Plan обновляет данные о реальности и показывает drift.

### Объект больше не должен управляться Terraform, но удалять его нельзя. Что делать?
- [ ] Удалить ресурс из кода и выполнить apply
- [x] Блок removed {} с lifecycle { destroy = false } или terraform state rm, затем убрать из кода
- [ ] terraform destroy -target
- [ ] terraform taint
> Удаление из кода без этого приведёт к уничтожению объекта при apply.
