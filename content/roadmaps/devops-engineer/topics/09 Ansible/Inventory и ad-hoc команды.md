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
