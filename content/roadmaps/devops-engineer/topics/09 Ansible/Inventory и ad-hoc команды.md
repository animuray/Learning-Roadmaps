---
title: Inventory и ad-hoc команды
slug: inventory-i-ad-hoc
description: Inventory в форматах INI и YAML, группы и дочерние группы, переменные подключения, group_vars и host_vars, шаблоны хостов и ad-hoc команды ansible -m с become, forks, check и diff.
duration: 60
level: Основы
quizSize: 10
materials:
  - title: Ansible Docs — How to build your inventory
    url: https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html
    type: документация
  - title: Ansible Docs — Building an inventory (getting started)
    url: https://docs.ansible.com/ansible/latest/getting_started/get_started_inventory.html
    type: документация
  - title: Ansible Docs — Introduction to ad hoc commands
    url: https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html
    type: документация
---

# Inventory и ad-hoc команды

## Inventory

**Inventory** — список хостов, которыми управляет Ansible, разбитый на группы. По умолчанию — `/etc/ansible/hosts`, но в проекте его указывают в `ansible.cfg` или флагом `-i`.

### INI

```ini
[web]
web1.example.com
web2.example.com ansible_port=2222

[db]
db1 ansible_host=10.0.0.21

[prod:children]
web
db

[prod:vars]
ansible_user=deploy
```

### YAML — то же самое

```yaml
all:
  children:
    web:
      hosts:
        web1.example.com:
        web2.example.com:
          ansible_port: 2222
    db:
      hosts:
        db1:
          ansible_host: 10.0.0.21
    prod:
      children:
        web:
        db:
      vars:
        ansible_user: deploy
```

- Встроенные группы: **`all`** (все хосты) и **`ungrouped`** (хосты без группы).
- **Дочерние группы** (`children`): хост из `web` автоматически входит в `prod`. Переменные дочерней группы перекрывают родительские.
- Хост может быть в нескольких группах: по роли (`web`, `db`), по окружению (`prod`, `stage`), по расположению (`msk`, `spb`).
- `db1 ansible_host=10.0.0.21` — `db1` здесь **алиас**, подключение идёт к IP.
- Диапазоны: `web[01:20].example.com`.

### Переменные подключения

| Переменная | Смысл |
| --- | --- |
| `ansible_host` | Адрес для подключения |
| `ansible_port` | Порт SSH |
| `ansible_user` | Пользователь SSH |
| `ansible_ssh_private_key_file` | Ключ |
| `ansible_become` / `ansible_become_user` | Повышать ли привилегии и до кого |
| `ansible_python_interpreter` | Путь к Python на хосте |
| `ansible_connection` | `ssh` (по умолчанию), `local`, `docker` и др. |

### group_vars и host_vars

Переменные удобнее держать не в inventory, а в каталогах рядом с ним:

```
inventory/
├── hosts.yml
├── group_vars/
│   ├── all.yml          # для всех
│   ├── web.yml          # для группы web
│   └── prod/
│       ├── vars.yml
│       └── vault.yml    # зашифрованные секреты
└── host_vars/
    └── db1.yml          # только для db1
```

Типичный приём — отдельный inventory на окружение: `inventories/prod/`, `inventories/stage/`, каждый со своими `group_vars`.

### Проверка inventory

```bash
ansible-inventory -i inventory/ --graph
ansible-inventory -i inventory/ --list
ansible-inventory -i inventory/ --host db1      # итоговые переменные хоста
ansible all --list-hosts
```

**Динамический inventory** — список хостов получают из облака или CMDB плагином (`amazon.aws.aws_ec2`, `community.docker.docker_containers` и др.), а не пишут руками.

## Шаблоны (patterns)

| Шаблон | Что выбирает |
| --- | --- |
| `all` или `*` | Все хосты |
| `web` | Группа web |
| `web:db` | Объединение web и db |
| `web:&prod` | Пересечение: web, которые в prod |
| `web:!web2.example.com` | web, кроме web2 |
| `web*.example.com` | По маске |

`--limit` сужает выборку плейбука: `ansible-playbook site.yml --limit web1.example.com`.

## Ad-hoc команды

Быстрые одноразовые действия без плейбука:

```
ansible <шаблон> -m <модуль> -a "<аргументы>" [флаги]
```

```bash
ansible all -m ping                                   # проверка подключения и Python (не ICMP!)
ansible web -a "uptime"                               # модуль по умолчанию — command
ansible web -m shell -a "df -h | grep /dev/sda"       # пайпы — только в shell
ansible web -b -m apt -a "name=htop state=present update_cache=true"
ansible web -b -m service -a "name=nginx state=restarted"
ansible all -m copy -a "src=./motd dest=/etc/motd" -b
ansible all -m setup -a "filter=ansible_distribution*"   # факты
ansible db -b -m user -a "name=backup shell=/bin/bash"
ansible all -a "reboot" -b -f 5                       # по 5 хостов одновременно
```

| Флаг | Смысл |
| --- | --- |
| `-i` | Inventory |
| `-m` / `-a` | Модуль и его аргументы |
| `-b` | `become` — выполнить через sudo |
| `-K` | Спросить пароль sudo |
| `-u` | Пользователь SSH |
| `-f` | Число параллельных хостов (forks, по умолчанию 5) |
| `-C` / `--check` | Пробный прогон: показать, что изменится, ничего не меняя |
| `-D` / `--diff` | Показать разницу в файлах |
| `-v` … `-vvvv` | Подробность вывода |

**command и shell:** `command` (по умолчанию) запускает программу напрямую — без пайпов, перенаправлений, `&&` и переменных shell; `shell` запускает через `/bin/sh`. `command` безопаснее и предпочтительнее, когда возможностей shell не нужно.

Ad-hoc команды хороши для разовых задач и диагностики («какая версия ядра на всех серверах?»). Всё, что повторяется, — в плейбук.

## Практика

- [ ] Написать inventory в INI с группами web, db и родительской группой prod; переписать его в YAML
- [ ] Вынести переменные в `group_vars/` и `host_vars/` и проверить итог через `ansible-inventory --host`
- [ ] Посмотреть дерево групп через `ansible-inventory --graph`
- [ ] Выполнить `ansible all -m ping`, затем узнать версию ОС и свободное место на всех хостах ad-hoc командами
- [ ] Установить пакет через `-b -m apt` и сначала проверить с `--check`
- [ ] Попробовать пайп в модуле command и в модуле shell и объяснить разницу
- [ ] Перезагрузить группу хостов по одному с `-f 1`

## Лаборатория

«Серверы» — контейнеры `lab-web1`, `lab-web2`, `lab-db1`, подключение — `ansible_connection=community.docker.docker` (см. тему «Ansible — как устроен»).

```bash lib
# «Серверы» для Ansible — контейнеры lab-web1, lab-web2, lab-db1 (Python, sudo, sshd); подключение — community.docker.docker
lab_host_image() {
  docker image inspect lab-ansible-host:2 >/dev/null 2>&1 && return
  docker image inspect python:3.12-slim >/dev/null 2>&1 || docker pull -q python:3.12-slim >/dev/null
  docker build -q -t lab-ansible-host:2 - >/dev/null <<'EOF'
FROM python:3.12-slim
RUN apt-get update -q && apt-get install -y -q --no-install-recommends sudo openssh-server \
 && mkdir -p /run/sshd && rm -rf /var/lib/apt/lists/*
CMD ["sleep", "infinity"]
EOF
}
lab_hosts() { lab_host_image; for h in ${*:-lab-web1 lab-web2 lab-db1}; do docker rm -f $h >/dev/null 2>&1; docker run -d --name $h --hostname $h lab-ansible-host:2 >/dev/null; done; }
# lab_inv каталог — ansible.cfg и inventory.ini: web = lab-web1, lab-web2; db = lab-db1
lab_inv() {
  mkdir -p "$1"
  printf '[defaults]\ninventory = inventory.ini\ninterpreter_python = /usr/local/bin/python3\n' > "$1/ansible.cfg"
  printf '[web]\nlab-web1\nlab-web2\n\n[db]\nlab-db1\n\n[all:vars]\nansible_connection=community.docker.docker\n' > "$1/inventory.ini"
}
lab_own() { chown -R student:student "$1"; }
# lab_play каталог аргументы — ansible-playbook от имени ученика, вывод — в /tmp/lab-ans.log
lab_play() { su - student -c "cd $1 && ANSIBLE_NOCOLOR=1 ansible-playbook $2" > /tmp/lab-ans.log 2>&1; }
# сумма changed по всем хостам из итогов последнего прогона
lab_changed() { grep -E '^lab-[a-z0-9]+ +:' /tmp/lab-ans.log | grep -oE 'changed=[0-9]+' | cut -d= -f2 | awk '{s += $1} END {print s + 0}'; }
lab_anslog() { grep -E 'fatal|ERROR|FAILED|error' /tmp/lab-ans.log | head -2 | tr '\n' ' ' | cut -c1-300; }
```

```bash setup
lab_hosts
```

### Inventory в YAML с переменными

Создайте в `~/ansible-inv` inventory **в формате YAML** (`inventory.yml`):

- группы **`web`** (`lab-web1`, `lab-web2`) и **`db`** (`lab-db1`);
- родительская группа **`prod`**, в которую входят `web` и `db`;
- переменная `http_port`: **8080** для группы `web` (файл в `group_vars/`), но **9090** для `lab-web2` (файл в `host_vars/`);
- подключение `community.docker.docker` и интерпретатор `/usr/local/bin/python3` — для всех хостов.

`ansible -i inventory.yml prod -m ping` должен пинговать все три хоста.

```bash setup
rm -rf /home/student/ansible-inv
```

```bash check
d=/home/student/ansible-inv
[ -f $d/inventory.yml ] || [ -f $d/inventory.yaml ] || fail "Нет ~/ansible-inv/inventory.yml"
inv=$(ls $d/inventory.y*ml | head -1)
ai() { su - student -c "cd $d && ansible-inventory -i $inv $*" 2>/dev/null; }
g=$(ai --list) || fail "ansible-inventory не может разобрать inventory"
for grp in web:lab-web1,lab-web2 db:lab-db1; do
  name=${grp%%:*}; want=$(echo ${grp#*:} | tr ',' '\n' | sort | xargs)
  got=$(echo "$g" | jq -r --arg n $name '.[$n].hosts // [] | sort | join(" ")')
  [ "$got" = "$want" ] || fail "В группе $name хосты «$got», нужны «$want»"
done
[ "$(echo "$g" | jq -r '.prod.children // [] | sort | join(" ")')" = "db web" ] || fail "Группа prod должна включать группы web и db"
grep -qE '^\s*\[' $inv && fail "inventory.yml написан в формате INI"
[ "$(ai --host lab-web1 | jq -r .http_port)" = 8080 ] || fail "У lab-web1 http_port = $(ai --host lab-web1 | jq -r .http_port)"
[ "$(ai --host lab-web2 | jq -r .http_port)" = 9090 ] || fail "У lab-web2 http_port = $(ai --host lab-web2 | jq -r .http_port)"
[ "$(ai --host lab-db1 | jq -r '.http_port // "нет"')" = нет ] || fail "У lab-db1 не должно быть http_port"
ls $d/group_vars/web* >/dev/null 2>&1 || fail "Переменная группы web не вынесена в group_vars/"
ls $d/host_vars/lab-web2* >/dev/null 2>&1 || fail "Переменная lab-web2 не вынесена в host_vars/"
out=$(su - student -c "cd $d && ansible -i $inv prod -m ping -o" 2>&1)
[ "$(echo "$out" | grep -c '| SUCCESS')" = 3 ] || fail "Не все хосты prod отвечают: $(echo "$out" | cut -c1-120 | tr '\n' ';')"
ok "$(su - student -c "cd $d && ansible-inventory -i $inv --graph" 2>/dev/null | tr -s ' \n' ' ')"
```

```text hint
1. В YAML-inventory корень — группа all, у неё дочерние группы (children); у группы — хосты (hosts, словарь имён) и переменные (vars).
2. Родительская группа перечисляет в children другие группы.
3. Переменные группы и хоста — в каталогах group_vars и host_vars рядом с inventory: файл называется по имени группы или хоста.
4. Проверить итог: дерево групп и переменные конкретного хоста — утилита ansible-inventory.
```

```bash solution
mkdir -p ~/ansible-inv/group_vars ~/ansible-inv/host_vars && cd ~/ansible-inv
cat > inventory.yml <<'EOF'
all:
  vars:
    ansible_connection: community.docker.docker
    ansible_python_interpreter: /usr/local/bin/python3
  children:
    prod:
      children:
        web:
          hosts:
            lab-web1:
            lab-web2:
        db:
          hosts:
            lab-db1:
EOF
echo 'http_port: 8080' > group_vars/web.yml
echo 'http_port: 9090' > host_vars/lab-web2.yml
ansible-inventory -i inventory.yml --graph
ansible-inventory -i inventory.yml --host lab-web2
ansible -i inventory.yml prod -m ping -o
```

```text review
Эталон — в «Решении».

- `group_vars/<группа>.yml` и `host_vars/<хост>.yml` рядом с inventory (или рядом с плейбуком) подхватываются сами. Переменная хоста сильнее переменной группы, дочерняя группа — сильнее родительской.
- Родительские группы (`prod` из `web` + `db`) позволяют писать `hosts: prod` и задавать общие для окружения переменные в `group_vars/prod.yml`.
- Частая схема: отдельный inventory на окружение — `inventories/stage/`, `inventories/prod/` со своими `group_vars`.
- `ansible-inventory --graph` и `--host` — первое, что смотреть, когда «переменная не та».
```

### Ad-hoc: проверка и установка

В `~/ansible-lab` (inventory с группами `web` и `db` уже есть) ad-hoc командами:

1. узнайте из **фактов** Ansible версию дистрибутива (`ansible_distribution_version`) на `lab-db1` и запишите её в `~/distro-version.txt`;
2. установите пакет **`curl`** **только** на группу **`db`** — сначала посмотрите, что будет, **в режиме проверки**, потом установите по-настоящему.

```bash setup
rm -rf /home/student/ansible-lab /home/student/distro-version.txt
lab_inv /home/student/ansible-lab
lab_own /home/student/ansible-lab
```

```bash check
want=$(docker exec lab-db1 python3 -c 'import platform; print(platform.freedesktop_os_release()["VERSION_ID"])' 2>/dev/null); full=$(docker exec lab-db1 cat /etc/debian_version 2>/dev/null)
[ -f /home/student/distro-version.txt ] || fail "Нет ~/distro-version.txt"
got=$(tr -d '[:space:]"' < /home/student/distro-version.txt)
[ "$got" = "$want" ] || [ "$got" = "$full" ] || fail "В ~/distro-version.txt «$got» — версия дистрибутива на lab-db1 другая"
docker exec lab-db1 dpkg-query -W -f='${Status}' curl 2>/dev/null | grep -q 'install ok installed' || fail "На lab-db1 curl не установлен"
for h in lab-web1 lab-web2; do docker exec $h dpkg-query -W -f='${Status}' curl 2>/dev/null | grep -q 'install ok installed' && fail "curl установлен и на $h — а нужно только на группу db"; done
ok "lab-db1: Debian $want, curl установлен только на db"
```

```text hint
1. Модуль сбора фактов можно запустить ad-hoc с фильтром по имени факта — вывод станет коротким.
2. Модуль пакетов Debian; списки пакетов на свежем сервере пустые — их нужно обновить в том же вызове.
3. Ключ режима проверки показывает, что изменится, ничего не меняя. Права администратора — ключ «become» (здесь подключение и так от root, но на серверах он нужен).
```

```bash solution
cd ~/ansible-lab
ansible lab-db1 -m setup -a 'filter=ansible_distribution_version'
ansible lab-db1 -m setup -a 'filter=ansible_distribution_version' | grep -oE '"[0-9.]+"' | tr -d '"' > ~/distro-version.txt
ansible db -b -m apt -a 'name=curl state=present update_cache=yes' --check
ansible db -b -m apt -a 'name=curl state=present update_cache=yes'
```

```text review
Эталон: `ansible lab-db1 -m setup -a 'filter=ansible_distribution_version'`, `ansible db -b -m apt -a 'name=curl state=present update_cache=yes' --check`, затем без `--check`.

- Факты (`setup`) — всё, что Ansible знает о хосте: ОС, IP, память, диски. В плейбуках они собираются автоматически (`gather_facts`) и используются в `when` и шаблонах.
- `--check` — сухой прогон, `--diff` — показать изменения файлов. Перед прогоном на прод — всегда.
- `-b` (become) — sudo на сервере. `-f N` — сколько хостов параллельно (по умолчанию 5); `--limit` — сузить выборку.
- Ad-hoc — для разовых действий («перезапусти nginx на web», «сколько места на дисках»). Всё, что повторяется, — в плейбук.
```

## Тест

### Какие группы есть в inventory всегда, даже если их не описывать?
- [x] all
- [x] ungrouped
- [ ] default
- [ ] localhost
> all содержит все хосты, ungrouped — хосты без своей группы.

### Что делает секция [prod:children] в INI-inventory?
- [ ] Создаёт переменные для группы prod
- [x] Делает перечисленные группы дочерними для prod: их хосты автоматически входят в prod
- [ ] Удаляет группу prod
- [ ] Задаёт хосты по умолчанию
> Переменные группы задаются секцией [prod:vars].

### В inventory есть строка db1 ansible_host=10.0.0.21. К какому адресу подключится Ansible?
- [ ] db1
- [x] 10.0.0.21 — db1 здесь алиас хоста
- [ ] localhost
- [ ] К обоим
> Алиасы удобны, когда у хоста только IP.

### Где принято хранить переменные для группы web?
- [ ] В /etc/ansible/web
- [x] В group_vars/web.yml (или каталоге group_vars/web/) рядом с inventory или плейбуком
- [ ] В host_vars/web.yml
- [ ] В ansible.cfg
> Переменные конкретного хоста — в host_vars/имя_хоста.yml.

### Что проверяет ansible all -m ping?
- [ ] ICMP-доступность хостов
- [x] Что Ansible может подключиться к хостам по SSH и запустить Python-модуль
- [ ] Скорость сети
- [ ] Открытые порты
> Это не сетевой ping, а проверка работоспособности Ansible на хосте.

### Чем модуль command отличается от shell?
- [ ] Ничем
- [x] command запускает программу напрямую без оболочки — пайпы, перенаправления и переменные shell не работают; shell выполняет команду через /bin/sh
- [ ] shell безопаснее command
- [ ] command работает только локально
> command предпочтительнее, если возможности оболочки не нужны.

### Какой флаг выполняет ad-hoc команду через sudo?
= -b
= --become
> -K запросит пароль для sudo.

### Что делает флаг --check?
- [ ] Проверяет синтаксис inventory
- [x] Выполняет пробный прогон: показывает, что было бы изменено, не внося изменений
- [ ] Проверяет обновления Ansible
- [ ] Проверяет пароли
> В паре с --diff показывает изменения в файлах.

### Какой шаблон выберет хосты группы web, которые одновременно входят в группу prod?
- [ ] web:prod
- [x] web:&prod
- [ ] web:!prod
- [ ] web+prod
> Двоеточие — объединение, восклицательный знак — исключение.

### Как посмотреть итоговые переменные конкретного хоста с учётом group_vars и host_vars?
- [ ] ansible-playbook --vars
- [x] ansible-inventory --host имя_хоста
- [ ] cat /etc/ansible/hosts
- [ ] ansible-doc имя_хоста
> --graph покажет дерево групп, --list — весь inventory в JSON.

### Что задаёт флаг -f у команд ansible и ansible-playbook?
- [ ] Файл inventory
- [x] Количество хостов, обрабатываемых параллельно (forks)
- [ ] Принудительное выполнение
- [ ] Формат вывода
> По умолчанию 5; значение можно задать в ansible.cfg.

### Что такое динамический inventory?
- [ ] Inventory, который меняется вручную каждый день
- [x] Список хостов, который плагин получает из внешнего источника — облака, CMDB, Docker — вместо статического файла
- [ ] Inventory в формате JSON
- [ ] Inventory без групп
> Полезно в облаках, где серверы постоянно создаются и удаляются.
