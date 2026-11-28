---
title: Playbook
slug: playbook
description: Структура плейбука — plays, hosts, become, tasks, handlers и notify, facts, register, when, loop, block и rescue, tags, check и diff, serial для поочерёдной выкатки и отладка запусков.
duration: 90
level: Основы
quizSize: 10
materials:
  - title: Ansible Docs — Working with playbooks
    url: https://docs.ansible.com/projects/ansible/13/playbook_guide/playbooks.html
    type: документация
  - title: Ansible Docs — Handlers running operations on change
    url: https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_handlers.html
    type: документация
  - title: Ansible Docs — Conditionals
    url: https://docs.ansible.com/projects/ansible-core/devel/playbook_guide/playbooks_conditionals.html
    type: документация
---

# Playbook

**Playbook** — YAML-файл с описанием желаемого состояния: какие хосты, какие задачи и в каком порядке. В отличие от ad-hoc команд он хранится в Git, повторяется и проходит ревью.

## Структура

```yaml
---
- name: Настроить веб-серверы
  hosts: web
  become: true
  gather_facts: true
  vars:
    app_port: 8000

  tasks:
    - name: Установить nginx
      ansible.builtin.apt:
        name: nginx
        state: present
        update_cache: true

    - name: Положить конфиг сайта
      ansible.builtin.template:
        src: templates/site.conf.j2
        dest: /etc/nginx/conf.d/site.conf
        mode: "0644"
      notify: Reload nginx

    - name: nginx запущен
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true

  handlers:
    - name: Reload nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded

- name: Настроить базы данных
  hosts: db
  become: true
  tasks:
    - name: Установить PostgreSQL
      ansible.builtin.apt:
        name: postgresql
        state: present
```

- Плейбук — **список плеев**. Каждый плей: `hosts` + задачи.
- Задачи выполняются **по порядку, сверху вниз**; каждая задача — на всех хостах плея параллельно (до `forks`), и только потом следующая.
- Если задача упала на хосте, этот хост **выбывает** из дальнейшего выполнения, остальные продолжают.
- `become: true` — выполнять через sudo. Можно задать на уровне плея или отдельной задачи.
- Всегда давайте задачам понятный `name` — это и документация, и вывод.

```bash
ansible-playbook -i inventory site.yml
ansible-playbook site.yml --syntax-check
ansible-playbook site.yml --check --diff       # пробный прогон
ansible-playbook site.yml --limit web1         # только один хост
ansible-playbook site.yml --tags nginx         # только задачи с тегом
ansible-playbook site.yml --list-tasks
ansible-playbook site.yml --start-at-task "Положить конфиг сайта"
ansible-playbook site.yml -e "app_port=9000"   # extra vars
```

Итог прогона — **PLAY RECAP**: `ok`, `changed`, `unreachable`, `failed`, `skipped` для каждого хоста.

## Handlers

**Handler** — задача, которая выполняется **только если её уведомили** (`notify`) и уведомившая задача дала `changed`.

- Выполняются **в конце плея** (точнее, после секции задач), а не сразу.
- Выполняются **один раз**, сколько бы задач их ни уведомили: три изменённых конфига → один перезапуск.
- Выполняются в порядке объявления в `handlers`, а не в порядке `notify`.
- `ansible.builtin.meta: flush_handlers` — выполнить накопленные handlers прямо сейчас.
- Если плей упал до конца — handlers не выполнятся (помогает `--force-handlers`).
- `listen:` — подписать несколько handlers на одно общее событие.

Классика: изменили конфиг → `notify: Restart nginx`. Конфиг не менялся → nginx не перезапускается.

## Facts

Перед задачами модуль `setup` собирает **факты** о хосте: ОС, IP, память, диски, процессоры.

```yaml
- name: Показать факты
  ansible.builtin.debug:
    msg: "{{ ansible_facts['distribution'] }} {{ ansible_facts['distribution_version'] }}, IP {{ ansible_facts['default_ipv4']['address'] }}"
```

`gather_facts: false` ускоряет плей, если факты не нужны. Посмотреть все: `ansible host -m setup`.

## register и when

```yaml
- name: Проверить, есть ли swap
  ansible.builtin.command: swapon --show
  register: swap_result
  changed_when: false

- name: Создать swap, если его нет
  ansible.builtin.command: fallocate -l 2G /swapfile
  args:
    creates: /swapfile
  when: swap_result.stdout | length == 0

- name: Только на Debian-подобных
  ansible.builtin.apt:
    name: unattended-upgrades
  when: ansible_facts['os_family'] == "Debian"
```

- `register` сохраняет результат задачи: `stdout`, `stderr`, `rc`, `changed`, `failed`.
- В `when` переменные пишут **без** фигурных скобок.
- Несколько условий списком — это «И»: `when: [cond1, cond2]`.

## Циклы

```yaml
- name: Пользователи
  ansible.builtin.user:
    name: "{{ item.name }}"
    groups: "{{ item.groups }}"
    append: true
  loop:
    - { name: alice, groups: sudo }
    - { name: bob, groups: docker }
  loop_control:
    label: "{{ item.name }}"
```

Старый синтаксис `with_items` ещё встречается; новый стандарт — `loop`.

## Ошибки: block, rescue, always

```yaml
- name: Обновление с откатом
  block:
    - name: Новая версия
      ansible.builtin.include_tasks: deploy.yml
  rescue:
    - name: Откатить
      ansible.builtin.include_tasks: rollback.yml
  always:
    - name: Уведомить
      ansible.builtin.debug:
        msg: "Деплой завершён"
```

Также: `ignore_errors: true`, `failed_when: "'ERROR' in result.stdout"`, `any_errors_fatal: true`.

## Выкатка без простоя: serial

```yaml
- name: Обновить приложение
  hosts: web
  serial: 1
  max_fail_percentage: 0
  tasks:
    - name: Вывести хост из балансировщика
      ansible.builtin.command: /usr/local/bin/lb-disable {{ inventory_hostname }}
      delegate_to: lb1
    - name: Обновить
      ansible.builtin.include_tasks: deploy.yml
    - name: Вернуть в балансировщик
      ansible.builtin.command: /usr/local/bin/lb-enable {{ inventory_hostname }}
      delegate_to: lb1
```

`serial: 1` — хосты по одному (или `serial: "25%"`), `delegate_to` — выполнить задачу на другом хосте, `run_once: true` — один раз на весь плей.

## Практика

- [ ] Написать плейбук из двух плеев: nginx на группу web и PostgreSQL на группу db
- [ ] Запустить дважды и убедиться, что второй прогон — только ok
- [ ] Добавить шаблон конфига с handler перезагрузки nginx; изменить переменную и увидеть, что handler сработал один раз
- [ ] Использовать факты: установить разные пакеты для Debian и RHEL через `when` по `os_family`
- [ ] Создать пользователей циклом из списка словарей
- [ ] Сделать `block` с `rescue` и намеренно уронить задачу внутри
- [ ] Прогнать плейбук с `--check --diff`, `--tags` и `--limit`
- [ ] Выкатить изменение на группу по одному хосту через `serial: 1`

## Лаборатория

«Серверы» — контейнеры `lab-web1`, `lab-web2`, `lab-db1`; проект `~/ansible-lab` с `ansible.cfg` и `inventory.ini` (группы `web` и `db`) готов.

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
rm -rf /home/student/ansible-lab
lab_inv /home/student/ansible-lab
lab_own /home/student/ansible-lab
```

### Конфиг и handler

Напишите плейбук `~/ansible-lab/site.yml` из **двух плеев**:

1. для группы **`web`**: файл **`/opt/app/app.conf`** из **шаблона** `templates/app.conf.j2` со строкой `port={{ app_port }}`, где `app_port` по умолчанию **8080** (переменная плея). При **изменении** конфига должен срабатывать handler **`restart app`**, который дописывает строку в `/opt/app/restarts.log` (имитация перезапуска приложения: `echo restarted >> /opt/app/restarts.log`);
2. для группы **`db`**: каталог **`/var/lib/appdb`**.

Handler должен срабатывать **только когда конфиг действительно изменился**: повторный прогон — без перезапуска, прогон с `-e app_port=9000` — с перезапуском.

```bash check
d=/home/student/ansible-lab
[ -f $d/site.yml ] || fail "Нет ~/ansible-lab/site.yml"
[ -f $d/templates/app.conf.j2 ] || fail "Нет шаблона ~/ansible-lab/templates/app.conf.j2"
for h in lab-web1 lab-web2; do docker exec $h rm -rf /opt/app; done
lab_play $d site.yml || fail "Плейбук падает: $(lab_anslog)"
for h in lab-web1 lab-web2; do
  [ "$(docker exec $h cat /opt/app/app.conf 2>/dev/null)" = "port=8080" ] || fail "На $h /opt/app/app.conf: «$(docker exec $h cat /opt/app/app.conf 2>&1)»"
  [ "$(docker exec $h grep -c restarted /opt/app/restarts.log 2>/dev/null)" = 1 ] || fail "На $h после первого прогона handler не сработал ровно один раз"
done
docker exec lab-db1 test -d /var/lib/appdb || fail "На lab-db1 нет /var/lib/appdb"
docker exec lab-db1 test -e /opt/app/app.conf && fail "Конфиг приложения попал и на lab-db1"
lab_play $d site.yml || fail "Повторный прогон падает: $(lab_anslog)"
[ "$(docker exec lab-web1 grep -c restarted /opt/app/restarts.log)" = 1 ] || fail "Handler сработал при повторном прогоне, хотя конфиг не менялся"
lab_play $d "site.yml -e app_port=9000" || fail "Прогон с -e app_port=9000 падает: $(lab_anslog)"
[ "$(docker exec lab-web1 cat /opt/app/app.conf)" = "port=9000" ] || fail "С -e app_port=9000 конфиг не поменялся"
[ "$(docker exec lab-web1 grep -c restarted /opt/app/restarts.log)" = 2 ] || fail "После изменения конфига handler не сработал"
lab_play $d site.yml >/dev/null
ok "handler срабатывает только при изменении конфига"
```

```text hint
1. Плейбук — список плеев; у каждого свои хосты, переменные, задачи и (у первого) handlers.
2. Каталог создать до шаблона. Задача с шаблоном «уведомляет» handler по его имени.
3. Handler — задача в отдельном разделе; выполняется в конце плея и только если уведомившая задача что-то изменила.
4. Переменные из ключа -e сильнее переменных плея.
```

```bash solution
cd ~/ansible-lab
mkdir -p templates
echo 'port={{ app_port }}' > templates/app.conf.j2
cat > site.yml <<'EOF'
- name: Веб-серверы
  hosts: web
  become: true
  vars:
    app_port: 8080
  tasks:
    - name: Каталог приложения
      ansible.builtin.file:
        path: /opt/app
        state: directory
        mode: "0755"

    - name: Конфиг приложения
      ansible.builtin.template:
        src: app.conf.j2
        dest: /opt/app/app.conf
        mode: "0644"
      notify: restart app

  handlers:
    - name: restart app
      ansible.builtin.shell: echo restarted >> /opt/app/restarts.log

- name: Базы данных
  hosts: db
  become: true
  tasks:
    - name: Каталог данных
      ansible.builtin.file:
        path: /var/lib/appdb
        state: directory
        mode: "0750"
EOF
ansible-playbook site.yml && ansible-playbook site.yml | tail -4
```

```text review
Эталон — в «Решении»: `template` + `notify: restart app` + раздел `handlers`.

- Handler выполняется **один раз в конце плея**, сколько бы задач его ни уведомили, и только если хоть одна из них дала `changed`. Изменили три конфига nginx — один reload.
- Упал плей до конца — уведомлённые handler-ы не выполнятся, и сервис останется со старым конфигом. Выход — `--force-handlers` или `meta: flush_handlers` в нужном месте.
- На настоящем сервере handler — `ansible.builtin.service: name=nginx state=reloaded`, а перед ним проверка конфига (`validate` у шаблона).
- Приоритет переменных: `-e` сильнее всего; затем переменные задачи/плея; затем host_vars/group_vars; defaults ролей — слабее всего.
```

```text notes
state:\s*restarted => В задачах был безусловный перезапуск — так сервис перезапускается при каждом прогоне. Перезапуск при изменениях — через handler.
```

### Пользователи из списка

Добавьте в `~/ansible-lab/users.yml` плейбук для **всех** хостов, который создаёт пользователей **циклом** по списку из переменной `team`:

- `alice` — оболочка `/bin/bash`, группы `sudo` и `adm`;
- `bob` — оболочка `/bin/bash`, группа `adm`;
- `ci` — оболочка `/usr/sbin/nologin`, без дополнительных групп.

Список — **одна переменная** со списком словарей, задача создания пользователей — **одна**. Существующие группы пользователей при этом не должны теряться.

```bash setup
rm -f /home/student/ansible-lab/users.yml
```

```bash check
d=/home/student/ansible-lab
[ -f $d/users.yml ] || fail "Нет ~/ansible-lab/users.yml"
n=$(python3 -c 'import yaml,sys; p=yaml.safe_load(open(sys.argv[1])); print(sum(1 for pl in p for t in pl.get("tasks", []) if any(k.endswith("user") for k in t)))' $d/users.yml 2>/dev/null)
[ "$n" = 1 ] || fail "Задач с модулем user: ${n:-?} — нужна одна задача с циклом"
grep -qE '^\s*(loop|with_items):' $d/users.yml || fail "Пользователи создаются не циклом"
lab_play $d users.yml || fail "Плейбук падает: $(lab_anslog)"
for h in lab-web1 lab-web2 lab-db1; do
  for u in alice:/bin/bash:sudo,adm bob:/bin/bash:adm ci:/usr/sbin/nologin:; do
    name=${u%%:*}; rest=${u#*:}; sh=${rest%%:*}; grps=${rest#*:}
    docker exec $h id $name >/dev/null 2>&1 || fail "На $h нет пользователя $name"
    [ "$(docker exec $h getent passwd $name | cut -d: -f7)" = "$sh" ] || fail "У $name на $h оболочка не $sh"
    for g in $(echo $grps | tr ',' ' '); do docker exec $h id -nG $name | tr ' ' '\n' | grep -qx $g || fail "$name на $h не в группе $g"; done
  done
done
ok "alice, bob, ci созданы на трёх хостах одной задачей"
```

```text hint
1. Переменная плея — список словарей с полями имени, оболочки и списка групп.
2. Одна задача с модулем пользователей и циклом по этому списку; поля текущего элемента — через переменную цикла.
3. Чтобы не потерять уже существующие группы пользователя, у модуля есть параметр «добавлять к группам, а не заменять».
```

```bash solution
cat > ~/ansible-lab/users.yml <<'EOF'
- name: Пользователи команды
  hosts: all
  become: true
  vars:
    team:
      - { name: alice, shell: /bin/bash, groups: [sudo, adm] }
      - { name: bob, shell: /bin/bash, groups: [adm] }
      - { name: ci, shell: /usr/sbin/nologin, groups: [] }
  tasks:
    - name: Создать пользователей
      ansible.builtin.user:
        name: "{{ item.name }}"
        shell: "{{ item.shell }}"
        groups: "{{ item.groups }}"
        append: true
      loop: "{{ team }}"
EOF
cd ~/ansible-lab && ansible-playbook users.yml
```

```text review
Эталон: `loop: "{{ team }}"` и `item.name`, `item.shell`, `item.groups`, `append: true`.

- `append: true` — как `usermod -aG`: без него Ansible **заменит** группы пользователя списком из задачи, и он вылетит из остальных.
- `loop` — современная форма; `with_items` встречается в старых плейбуках. Для словаря — `loop: "{{ users | dict2items }}"`.
- `loop_control: label: "{{ item.name }}"` — чтобы в выводе было имя, а не весь словарь (и пароли из него).
- Удаление пользователей — тот же цикл со `state: absent` по списку уволенных; хранить список людей в одном месте (group_vars) — основа «онбординга кодом».
```

## Тест

### В каком порядке выполняются задачи плея на нескольких хостах (стратегия по умолчанию)?
- [ ] Все задачи на первом хосте, затем на втором
- [x] Каждая задача выполняется на всех хостах (параллельно до значения forks), и только затем начинается следующая
- [ ] В случайном порядке
- [ ] Только на одном хосте
> Это стратегия linear. Стратегия free позволяет хостам идти независимо.

### Когда выполняется handler?
- [x] Только если его уведомила задача через notify и эта задача дала changed
- [x] По умолчанию — после выполнения всех задач плея, а не сразу
- [ ] При каждом запуске плейбука
- [ ] Сразу после задачи, даже без изменений
> Немедленно выполнить handlers можно задачей meta: flush_handlers.

### Три задачи изменили конфиги и уведомили один и тот же handler Restart nginx. Сколько раз перезапустится nginx?
= 1
= один
> Handler выполняется один раз, сколько бы раз его ни уведомили.

### Что делает register: result у задачи?
- [ ] Регистрирует хост в inventory
- [x] Сохраняет результат задачи (stdout, rc, changed и т. д.) в переменную для следующих задач
- [ ] Записывает лог в файл
- [ ] Создаёт handler
> Затем result можно использовать в when или debug.

### Как правильно написать условие в when?
- [ ] when: "{{ ansible_facts['os_family'] }} == Debian"
- [x] when: ansible_facts['os_family'] == "Debian"
- [ ] when: os_family = Debian
- [ ] if: ansible_facts['os_family'] == "Debian"
> В when переменные пишут без фигурных скобок.

### Что такое facts в Ansible?
- [ ] Переменные из group_vars
- [x] Сведения о хосте (ОС, IP-адреса, память, диски), которые собирает модуль setup перед выполнением задач
- [ ] Результаты тестов
- [ ] Список задач плейбука
> Отключить сбор можно через gather_facts: false.

### Что делают блоки block и rescue?
- [ ] Повторяют задачи в цикле
- [x] Если задача внутри block упала, выполняются задачи из rescue — например, откат
- [ ] Выполняют задачи параллельно
- [ ] Шифруют задачи
> Задачи в always выполняются в любом случае.

### Что произойдёт с хостом, на котором упала задача (без ignore_errors)?
- [ ] Плейбук остановится на всех хостах
- [x] Этот хост исключается из дальнейшего выполнения плея, на остальных хостах выполнение продолжается
- [ ] Задача будет повторяться бесконечно
- [ ] Хост перезагрузится
> any_errors_fatal: true остановит плей на всех хостах.

### Зачем у плея указывают serial: 1?
- [ ] Чтобы плей выполнился один раз
- [x] Чтобы обрабатывать хосты по одному — например, для обновления без простоя за балансировщиком
- [ ] Чтобы выполнить только первую задачу
- [ ] Чтобы отключить handlers
> Можно задавать процентами, например serial: "25%".

### Какой ключ заменил устаревший with_items для циклов?
= loop
> Для вывода коротких меток в цикле — loop_control с label.

### Как запустить плейбук только для одного хоста из группы?
- [ ] --hosts web1
- [x] --limit web1
- [ ] --only web1
- [ ] -h web1
> --limit принимает шаблоны, например --limit 'web:!web2'.

### Что делает delegate_to: lb1 у задачи?
- [ ] Запускает задачу на всех хостах группы lb1
- [x] Выполняет задачу на хосте lb1, но в контексте текущего хоста плея
- [ ] Передаёт результат на lb1
- [ ] Создаёт хост lb1 в inventory
> Пример — вывести текущий хост из балансировщика перед обновлением.

### Какой флаг покажет изменения в файлах при пробном прогоне?
= --diff
= -D
> Обычно используют вместе: --check --diff.
