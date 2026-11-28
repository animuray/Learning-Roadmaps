---
title: Ansible — как устроен
slug: ansible-kak-ustroen
description: Управление конфигурацией и место Ansible среди инструментов, агентless-архитектура (SSH + Python), control node и managed nodes, модули, декларативность и идемпотентность, ansible.cfg и коллекции.
duration: 45
level: Основы
quizSize: 10
materials:
  - title: Ansible Docs — Getting started with Ansible
    url: https://docs.ansible.com/projects/ansible-core/2.15/getting_started/index.html
    type: документация
  - title: Ansible Docs — Controlling how Ansible behaves (precedence, ansible.cfg)
    url: https://docs.ansible.com/ansible/latest/reference_appendices/general_precedence.html
    type: документация
  - title: Ansible Docs — Introduction to ad hoc commands (идемпотентность модулей)
    url: https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html
    type: документация
---

# Ansible — как устроен

## Зачем управление конфигурацией

Вы настраиваете сервер: пакеты, пользователи, SSH, nginx, Docker. Руками — час, и десятый сервер будет немного не таким, как первый (**configuration drift**). Bash-скрипт — лучше, но его опасно запускать повторно: `useradd` упадёт, строка допишется в конфиг второй раз.

**Управление конфигурацией** (Configuration Management) — описать желаемое состояние серверов кодом и приводить к нему любое число машин, сколько угодно раз. Инструменты: **Ansible**, Puppet, Chef, SaltStack. Ansible — самый популярный благодаря простоте.

| | Ansible | Terraform |
| --- | --- | --- |
| Задача | Настроить то, что внутри сервера: пакеты, файлы, сервисы | Создать инфраструктуру: ВМ, сети, балансировщики, DNS |
| Состояние | Не хранит, каждый раз проверяет факты | Хранит state-файл |
| Типичная связка | Terraform создал ВМ → Ansible её настроил | |

## Архитектура

```
   Control node                              Managed nodes
 ┌───────────────────┐   SSH (22)   ┌────────────────────────┐
 │ ansible, playbooks│ ───────────► │ web1: Python, sshd     │
 │ inventory, roles  │ ───────────► │ web2: Python, sshd     │
 │ (Linux / macOS)   │ ───────────► │ db1:  Python, sshd     │
 └───────────────────┘              └────────────────────────┘
```

- **Control node** — машина, где установлен Ansible и откуда запускаются команды (ваш ноутбук, CI-раннер, отдельный сервер). Linux или macOS; на Windows — через WSL.
- **Managed nodes** — управляемые серверы. На них нужны только **SSH** и **Python**.
- **Inventory** — список управляемых хостов и групп.
- **Module** — единица работы: `apt`, `copy`, `service`, `user`… Их сотни.
- **Task** — вызов модуля с параметрами. **Play** — набор задач для группы хостов. **Playbook** — YAML-файл с одним или несколькими плеями.

## Agentless и push-модель

Ansible **не требует агента** на серверах (в отличие от Puppet и Chef с их демонами). Для каждой задачи он:

1. подключается по SSH;
2. копирует на сервер небольшую программу модуля (Python);
3. выполняет её с параметрами;
4. получает результат в JSON (`ok`, `changed`, `failed`) и удаляет временные файлы.

Плюсы: нечего ставить и обновлять на серверах, нет отдельного порта, используется уже настроенный SSH-доступ. Минус: на больших масштабах медленнее агентов (помогают `forks`, pipelining, ControlPersist).

Это **push-модель**: изменения «проталкиваются» с control node, когда вы запускаете плейбук. Агентные системы работают по **pull**: агент сам периодически забирает конфигурацию.

Модуль `raw` умеет работать вообще без Python — например, чтобы поставить Python на новый сервер.

## Декларативность и идемпотентность

Вы описываете не «что сделать», а **«каким должно быть состояние»**:

```yaml
- name: nginx установлен
  ansible.builtin.apt:
    name: nginx
    state: present

- name: Пользователь deploy существует
  ansible.builtin.user:
    name: deploy
    groups: docker
    append: true
```

Модуль сам проверяет текущее состояние и меняет только то, что отличается. Поэтому плейбук **идемпотентен**: первый запуск — `changed`, второй и последующие — `ok`, ничего не меняется. Идемпотентность — главное свойство хорошего плейбука: его можно безопасно запускать повторно в любой момент.

Модули `command` и `shell` по умолчанию **не идемпотентны** — они просто выполняют команду и всегда отчитываются `changed`. Используйте их, только если нет подходящего модуля, и добавляйте `creates`, `removes` или `changed_when`.

## Установка и конфигурация

```bash
pipx install --include-deps ansible     # или: python3 -m pip install --user ansible
sudo apt install ansible                # из пакетов дистрибутива (может быть старее)
ansible --version
```

- **ansible-core** — движок, команды и встроенные модули `ansible.builtin.*`.
- **ansible** (пакет) — ansible-core + набор популярных **коллекций** (`community.general`, `community.docker`, `ansible.posix`…).
- **Коллекции** ставятся через `ansible-galaxy collection install community.docker`. Модули пишут полным именем (FQCN): `ansible.builtin.copy`, `community.docker.docker_container`.

`ansible.cfg` ищется в порядке: переменная `ANSIBLE_CONFIG` → `./ansible.cfg` (в текущем каталоге) → `~/.ansible.cfg` → `/etc/ansible/ansible.cfg`. Используется **первый найденный**.

```ini
[defaults]
inventory = ./inventory.ini
remote_user = deploy
forks = 20
host_key_checking = True
roles_path = ./roles

[ssh_connection]
pipelining = True
```

## Практика

- [ ] Поднять 2–3 ВМ (или контейнеры с sshd), настроить вход по SSH-ключу с control node
- [ ] Установить Ansible и проверить `ansible --version`: версия, путь к ansible.cfg, версия Python
- [ ] Создать проект с `ansible.cfg` и `inventory.ini` и выполнить `ansible all -m ping`
- [ ] Выполнить установку пакета через модуль `apt` два раза подряд и сравнить `changed` и `ok`
- [ ] Выполнить `ansible all -m shell -a "echo hi >> /tmp/x"` дважды и убедиться, что shell не идемпотентен
- [ ] Запустить с `-vvv` и найти в выводе, как Ansible копирует и выполняет модуль на сервере

## Лаборатория

«Серверы» — контейнеры `lab-web1`, `lab-web2`, `lab-db1` с Python. Ansible подключается к ним не по SSH, а через Docker: переменная `ansible_connection=community.docker.docker` вместо адреса и ключа. Всё остальное — как с настоящими серверами. Заглянуть на сервер: `docker exec -it lab-web1 bash`.

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

### Проект Ansible

Создайте проект в `~/ansible-lab`:

- `inventory.ini` — группа **`web`** из `lab-web1` и `lab-web2`; для всех хостов подключение `community.docker.docker`;
- `ansible.cfg` — указывает inventory по умолчанию и интерпретатор Python на серверах `/usr/local/bin/python3`.

Команда `ansible web -m ping`, запущенная **в каталоге проекта без ключа `-i`**, должна получить `pong` от обоих хостов.

```bash setup
lab_hosts
rm -rf /home/student/ansible-lab
```

```bash check
d=/home/student/ansible-lab
[ -f $d/ansible.cfg ] || fail "Нет ~/ansible-lab/ansible.cfg"
[ -f $d/inventory.ini ] || fail "Нет ~/ansible-lab/inventory.ini"
inv=$(su - student -c "cd $d && ansible-config dump --only-changed" 2>/dev/null | grep DEFAULT_HOST_LIST)
echo "$inv" | grep -q "$d/inventory.ini" || fail "ansible.cfg не задаёт inventory по умолчанию (ansible-config dump: ${inv:-ничего})"
out=$(su - student -c "cd $d && ansible web -m ping -o" 2>&1)
for h in lab-web1 lab-web2; do echo "$out" | grep -q "^$h | SUCCESS" || fail "$h не отвечает на ping: $(echo "$out" | grep "^$h" | cut -c1-150)"; done
echo "$out" | grep -q lab-db1 && fail "В группе web оказался lab-db1"
ok "$(echo "$out" | cut -d'|' -f1-2 | tr '\n' ';')"
```

```text hint
1. Inventory в формате INI: заголовок группы в квадратных скобках и имена хостов по строке; переменные для всех хостов — в специальной секции группы «all» с суффиксом «:vars».
2. В ansible.cfg — раздел настроек по умолчанию: путь к inventory и интерпретатор Python.
3. Ansible ищет ansible.cfg в текущем каталоге — запускать нужно оттуда. Какой конфиг подхватился, видно в выводе ansible --version.
```

```bash solution
mkdir -p ~/ansible-lab && cd ~/ansible-lab
cat > inventory.ini <<'EOF'
[web]
lab-web1
lab-web2

[all:vars]
ansible_connection=community.docker.docker
EOF
cat > ansible.cfg <<'EOF'
[defaults]
inventory = inventory.ini
interpreter_python = /usr/local/bin/python3
EOF
ansible --version | head -2
ansible web -m ping
```

```text review
Эталон: `inventory.ini` с группой `[web]` и `[all:vars]`, `ansible.cfg` с `inventory` и `interpreter_python`.

- Ansible — **агентless**: на сервер он заходит (обычно по SSH), копирует туда модуль на Python, выполняет и удаляет. Поэтому на сервере нужен только Python.
- Порядок поиска конфига: `ANSIBLE_CONFIG` → `./ansible.cfg` → `~/.ansible.cfg` → `/etc/ansible/ansible.cfg`. Конфиг в репозитории проекта — норма; `ansible --version` показывает, какой подхватился.
- С настоящими серверами в inventory пишут `ansible_host`, `ansible_user`, `ansible_ssh_private_key_file` (или берут из `~/.ssh/config`).
- `ping` здесь — не ICMP, а проверка «Ansible может зайти и выполнить Python».
```

### Идемпотентно, а не «ещё раз»

На серверах группы `web` в файле `/etc/motd` должна быть строка `Managed by Ansible` — **ровно одна**. Добейтесь этого **ad-hoc командой** Ansible (без плейбука) так, чтобы её **повторный запуск ничего не менял**. Выполните команду дважды.

```bash setup
lab_hosts lab-web1 lab-web2
for h in lab-web1 lab-web2; do docker exec $h sh -c 'printf "Debian GNU/Linux\n" > /etc/motd'; done
rm -rf /home/student/ansible-lab
lab_inv /home/student/ansible-lab
lab_own /home/student/ansible-lab
```

```bash check
for h in lab-web1 lab-web2; do
  n=$(docker exec $h grep -cx 'Managed by Ansible' /etc/motd)
  [ "$n" = 1 ] || fail "На $h строка «Managed by Ansible» встречается $n раз"
  docker exec $h grep -qx 'Debian GNU/Linux' /etc/motd || fail "На $h пропало прежнее содержимое /etc/motd"
done
ok "строка — ровно одна на обоих серверах"
```

```text hint
1. Модуль для команд оболочки просто выполняет команду каждый раз — дописывание строки при повторе её задвоит.
2. Есть модуль, который описывает **состояние** строки в файле: «такая строка должна присутствовать». Если она уже есть — он ничего не делает.
3. Ad-hoc команда: группа, ключ модуля, ключ аргументов модуля.
```

```bash solution
cd ~/ansible-lab
ansible web -m lineinfile -a "path=/etc/motd line='Managed by Ansible'"
ansible web -m lineinfile -a "path=/etc/motd line='Managed by Ansible'"
```

```text review
Эталон: `ansible web -m lineinfile -a "path=/etc/motd line='Managed by Ansible'"` — первый раз CHANGED, второй — SUCCESS (ok).

- **Идемпотентность**: модуль описывает желаемое состояние, а не действие. Прогон на уже настроенном сервере ничего не меняет — плейбук можно запускать сколько угодно раз.
- `shell`/`command` не идемпотентны: `echo ... >> /etc/motd` при каждом запуске добавит строку. Их используют в крайнем случае и тогда добавляют `creates:`/`removes:` или `changed_when:`.
- Цвета в выводе: зелёный — ok (ничего не меняли), жёлтый — changed, красный — failed. На собеседовании про идемпотентность спрашивают почти всегда.
```

```text notes
-m\s+(shell|command)\b[^\n]*(>>|echo) => Строка дописывалась через shell — такая команда не идемпотентна: повторный запуск задвоил бы строку.
```

## Тест

### Что нужно на управляемых серверах для работы Ansible?
- [x] SSH-доступ
- [x] Python (для большинства модулей)
- [ ] Агент Ansible
- [ ] Открытый порт 8080
> Модуль raw работает даже без Python.

### Что означает agentless?
- [ ] Ansible не использует сеть
- [x] На управляемых серверах не нужно устанавливать и запускать отдельный агент: Ansible подключается по SSH и выполняет модули
- [ ] Ansible работает только локально
- [ ] Ansible не требует учётных записей
> Puppet и Chef, напротив, используют агентов.

### Что такое идемпотентность плейбука?
- [ ] Плейбук выполняется быстро
- [x] Повторный запуск приводит к тому же состоянию и ничего не меняет, если система уже в нужном состоянии
- [ ] Плейбук можно запустить только один раз
- [ ] Плейбук всегда отчитывается changed
> Второй запуск хорошего плейбука — только ok.

### Почему модули command и shell считаются неидемпотентными?
- [ ] Они не работают с sudo
- [x] Они просто выполняют команду, не проверяя текущее состояние, и по умолчанию всегда отчитываются changed
- [ ] Они требуют Python 2
- [ ] Они не поддерживают переменные
> Добавляйте creates, removes или changed_when, а лучше — используйте специализированный модуль.

### Чем Ansible отличается от Terraform по назначению?
- [x] Ansible в основном настраивает то, что внутри серверов: пакеты, файлы, сервисы
- [x] Terraform создаёт и меняет инфраструктуру: ВМ, сети, DNS, балансировщики, и хранит state
- [ ] Это одно и то же
- [ ] Terraform работает только с Docker
> Частая связка: Terraform создаёт ВМ, Ansible её настраивает.

### По какой модели Ansible применяет изменения?
- [x] Push — изменения проталкиваются с control node при запуске
- [ ] Pull — агент сам забирает конфигурацию
- [ ] Через очередь сообщений
- [ ] Через базу данных
> Агентные системы работают по pull-модели.

### Где Ansible ищет ansible.cfg в первую очередь (если не задана переменная ANSIBLE_CONFIG)?
- [ ] /etc/ansible/ansible.cfg
- [x] В текущем каталоге (./ansible.cfg)
- [ ] ~/.ansible.cfg
- [ ] Во всех сразу, объединяя их
> Используется первый найденный файл, остальные игнорируются.

### Что такое FQCN модуля, например ansible.builtin.copy?
- [ ] Путь к файлу модуля
- [x] Полное имя модуля: пространство имён, коллекция и имя модуля
- [ ] Версия модуля
- [ ] Имя хоста
> Полные имена исключают конфликты модулей с одинаковыми названиями.

### Чем пакет ansible отличается от ansible-core?
- [ ] Ничем
- [x] ansible-core — движок и встроенные модули, пакет ansible дополнительно включает набор популярных коллекций
- [ ] ansible-core — платная версия
- [ ] ansible — только для Windows
> Недостающие коллекции ставят через ansible-galaxy collection install.

### Что такое configuration drift?
- [ ] Перемещение серверов между дата-центрами
- [x] Постепенное расхождение конфигурации серверов, которые должны быть одинаковыми, из-за ручных изменений
- [ ] Ошибка в YAML
- [ ] Обновление Ansible
> Регулярный прогон плейбуков возвращает серверы к описанному состоянию.

### Какой модуль позволяет выполнить команду на сервере без Python?
= raw
= ansible.builtin.raw
> Например, чтобы установить Python на только что созданный сервер.

### Что делает Ansible при выполнении задачи на удалённом хосте?
- [ ] Компилирует модуль на control node и передаёт бинарник
- [x] Копирует программу модуля на хост по SSH, выполняет её и получает результат в формате JSON
- [ ] Отправляет команду агенту через HTTP
- [ ] Перезагружает хост
> Временные файлы модуля после выполнения удаляются.
