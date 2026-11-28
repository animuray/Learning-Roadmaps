---
title: Переменные и шаблоны Jinja2
slug: peremennye-i-shablony-jinja2
description: Где объявлять переменные — vars, group_vars, host_vars, extra vars, — их приоритеты, магические переменные hostvars и groups, синтаксис Jinja2, фильтры, циклы и условия в шаблонах .j2.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Ansible Docs — Templating (Jinja2)
    url: https://docs.ansible.com/projects/ansible-core/devel/playbook_guide/playbooks_templating.html
    type: документация
  - title: Ansible Docs — ansible.builtin.template module
    url: https://docs.ansible.com/projects/ansible-core/2.15/collections/ansible/builtin/template_module.html
    type: документация
  - title: Ansible Docs — Controlling how Ansible behaves (precedence rules)
    url: https://docs.ansible.com/ansible/latest/reference_appendices/general_precedence.html
    type: документация
  - title: Ansible Docs — How to build your inventory (переменные в inventory)
    url: https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html
    type: документация
---

# Переменные и шаблоны Jinja2

## Где объявляют переменные

```yaml
- hosts: web
  vars:
    app_port: 8000
  vars_files:
    - vars/common.yml
  tasks:
    - ansible.builtin.debug:
        msg: "Порт {{ app_port }}"
```

Основные места:

- **defaults/** и **vars/** ролей;
- **group_vars/** и **host_vars/** рядом с inventory или плейбуком;
- `vars`, `vars_files`, `vars_prompt` в плее;
- `vars` у блока или задачи;
- `register` и `set_fact` — во время выполнения;
- **extra vars** — `-e "key=value"` или `-e @file.yml` из командной строки;
- факты хоста.

## Приоритет — кто победит

Упрощённо, от **низшего** к **высшему**:

1. **defaults роли** (`roles/x/defaults/main.yml`) — самое слабое, специально чтобы их переопределяли;
2. group_vars группы `all` → group_vars конкретных групп (дочерние перекрывают родительские);
3. host_vars хоста;
4. факты хоста;
5. переменные плея: `vars`, `vars_prompt`, `vars_files`;
6. **vars роли** (`roles/x/vars/main.yml`);
7. vars блока, затем vars задачи;
8. `include_vars`, `set_fact` и `register`;
9. параметры роли и include;
10. **extra vars** (`-e`) — **побеждают всегда**.

Практические правила:

- значения, которые пользователь роли должен менять, — в **defaults**;
- различия окружений и групп — в **group_vars** / **host_vars**;
- **vars роли** — для внутренних констант (их сложно переопределить);
- `-e` — для разовых запусков и CI (например, версия для деплоя);
- не объявляйте одну переменную в пяти местах.

## Магические переменные

| Переменная | Что содержит |
| --- | --- |
| `inventory_hostname` | Имя хоста из inventory |
| `group_names` | Группы текущего хоста |
| `groups` | Все группы и их хосты: `groups['web']` |
| `hostvars` | Переменные и факты любого хоста: `hostvars['db1']['ansible_host']` |
| `ansible_play_hosts` | Хосты текущего плея |
| `ansible_check_mode` | Запущено ли с `--check` |

## Jinja2: синтаксис

- `{{ выражение }}` — подставить значение;
- `{% инструкция %}` — `if`, `for`, `set`;
- `{# комментарий #}`.

Ansible обрабатывает шаблоны **на control node**, на сервер уходит готовый результат.

### Правило кавычек в YAML

Если значение **начинается** с `{{`, его нужно взять в кавычки, иначе YAML примет фигурные скобки за словарь:

```yaml
path: "{{ base_dir }}/app"       # правильно
path: {{ base_dir }}/app         # ошибка синтаксиса
```

### Фильтры

```yaml
"{{ app_env | default('dev') }}"
"{{ app_name | upper }}"
"{{ packages | join(', ') }}"
"{{ port | int + 1 }}"
"{{ users | map(attribute='name') | list }}"
"{{ password | password_hash('sha512') }}"
"{{ config | to_nice_yaml }}"
"{{ db_password | mandatory }}"
"{{ path | basename }}"
"{{ ansible_facts['memtotal_mb'] // 4 }}"
```

Тесты: `when: result is succeeded`, `when: my_var is defined`, `when: item is match('^web')`.

Lookup — данные с control node: `"{{ lookup('file', 'files/id.pub') }}"`, `"{{ lookup('env', 'HOME') }}"`.

## Шаблоны .j2

`templates/nginx-site.conf.j2`:

```jinja
# {{ ansible_managed }}
upstream app {
{% for host in groups['app'] %}
    server {{ hostvars[host]['ansible_host'] }}:{{ app_port }};
{% endfor %}
}

server {
    listen 80;
    server_name {{ server_name }};

{% if enable_gzip | default(true) %}
    gzip on;
{% endif %}

    location / {
        proxy_pass http://app;
    }
}
```

```yaml
- name: Конфиг nginx
  ansible.builtin.template:
    src: nginx-site.conf.j2
    dest: /etc/nginx/conf.d/app.conf
    validate: nginx -t -c /etc/nginx/nginx.conf
  notify: Reload nginx
```

- `ansible_managed` — строка-предупреждение «файл управляется Ansible, не правьте руками».
- Шаблон с текущей датой внутри будет `changed` при каждом запуске — так нельзя.
- `{%-` и `-%}` убирают лишние пробелы и переводы строк.

## Отладка

```yaml
- ansible.builtin.debug:
    var: hostvars[inventory_hostname]

- ansible.builtin.debug:
    msg: "{{ groups['web'] | length }} веб-серверов"
```

## Практика

- [ ] Объявить переменную `app_port` в group_vars/all, group_vars/web, host_vars/web1 и через `-e`; проверить, какое значение получает каждый хост
- [ ] Вывести `inventory_hostname`, `group_names` и `groups['web']` через debug
- [ ] Написать шаблон конфига nginx с upstream по всем хостам группы app через цикл `for`
- [ ] Добавить в шаблон условный блок `if` и значение по умолчанию через фильтр `default`
- [ ] Получить IP хоста db1 в задаче для web через `hostvars`
- [ ] Специально оставить `{{` без кавычек в начале значения и разобрать ошибку

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

### Где задана переменная

Переменная `app_port` должна принимать значения:

- **8000** — для всех хостов (по умолчанию);
- **8080** — для группы `web`;
- **9090** — для хоста `lab-web2`.

Задайте её в **`group_vars`** и **`host_vars`** проекта (не в плейбуке) и напишите плейбук `~/ansible-lab/port.yml` для всех хостов, который записывает значение в `/etc/app_port`.

```bash check
d=/home/student/ansible-lab
[ -f $d/port.yml ] || fail "Нет ~/ansible-lab/port.yml"
grep -q 'app_port:' $d/port.yml && fail "app_port задан в самом плейбуке — переменные нужно вынести в group_vars/host_vars"
lab_play $d port.yml || fail "Плейбук падает: $(lab_anslog)"
for p in lab-web1:8080 lab-web2:9090 lab-db1:8000; do
  h=${p%%:*}; want=${p#*:}
  got=$(docker exec $h cat /etc/app_port 2>/dev/null | tr -d '[:space:]')
  [ "$got" = "$want" ] || fail "На $h в /etc/app_port «$got», а должно быть $want"
done
ok "lab-web1=8080, lab-web2=9090, lab-db1=8000"
```

```text hint
1. Значение «для всех» — в файле группы all, «для web» — в файле группы web, «для хоста» — в файле с именем хоста. Каталоги — рядом с inventory.
2. Плейбук для всех хостов записывает значение переменной в файл модулем копирования содержимого.
3. Проверить, какое значение получит хост, можно ad-hoc модулем debug или ansible-inventory.
```

```bash solution
cd ~/ansible-lab
mkdir -p group_vars host_vars
echo 'app_port: 8000' > group_vars/all.yml
echo 'app_port: 8080' > group_vars/web.yml
echo 'app_port: 9090' > host_vars/lab-web2.yml
cat > port.yml <<'EOF'
- name: Порт приложения
  hosts: all
  become: true
  tasks:
    - name: Записать порт
      ansible.builtin.copy:
        dest: /etc/app_port
        content: "{{ app_port }}\n"
        mode: "0644"
EOF
ansible all -m debug -a var=app_port
ansible-playbook port.yml
```

```text review
Эталон: `group_vars/all.yml` (8000) → `group_vars/web.yml` (8080) → `host_vars/lab-web2.yml` (9090).

- Чем конкретнее, тем сильнее: хост > группа > all. Полный порядок приоритета — 22 уровня в документации; на практике хватает: `-e` > vars плея/задачи > host_vars > group_vars конкретной группы > group_vars/all > defaults роли.
- Отладка «откуда значение»: `ansible -m debug -a var=app_port lab-web2`, `ansible-inventory --host lab-web2`.
- Переменные окружений держат в inventory, а не в плейбуках: плейбук один, а `inventories/stage/group_vars` и `inventories/prod/group_vars` — свои.
```

### Шаблон upstream по группе

Хост `lab-db1` в этой задаче играет роль балансировщика. Создайте шаблон `templates/upstream.conf.j2` и плейбук `~/ansible-lab/lb.yml` (для `lab-db1`), который рендерит его в **`/etc/upstream.conf`**:

    upstream app {
        server lab-web1:8080 max_conns=100;
        server lab-web2:9090 max_conns=100;
    }

Строки `server` должны строиться **циклом по всем хостам группы `web`**, порт — из **их** переменной `app_port` (8080 для группы web и 9090 для lab-web2 — уже заданы в group_vars/host_vars), а `max_conns` — из переменной `max_conns`, которая **не задана**: используйте значение **по умолчанию 100**.

```bash setup
mkdir -p /home/student/ansible-lab/group_vars /home/student/ansible-lab/host_vars
echo 'app_port: 8080' > /home/student/ansible-lab/group_vars/web.yml
echo 'app_port: 9090' > /home/student/ansible-lab/host_vars/lab-web2.yml
rm -f /home/student/ansible-lab/lb.yml /home/student/ansible-lab/templates/upstream.conf.j2
lab_own /home/student/ansible-lab
```

```bash check
d=/home/student/ansible-lab
[ -f $d/templates/upstream.conf.j2 ] || fail "Нет шаблона templates/upstream.conf.j2"
grep -qE '\{%-?\s*for ' $d/templates/upstream.conf.j2 || fail "В шаблоне нет цикла for"
grep -qE 'lab-web[12]' $d/templates/upstream.conf.j2 && fail "Имена хостов вписаны в шаблон вручную — они должны браться из группы web"
grep -qE 'default\(' $d/templates/upstream.conf.j2 || fail "max_conns в шаблоне без значения по умолчанию"
lab_play $d lb.yml || fail "Плейбук падает: $(lab_anslog)"
want=$(printf 'upstream app {\n    server lab-web1:8080 max_conns=100;\n    server lab-web2:9090 max_conns=100;\n}')
got=$(docker exec lab-db1 cat /etc/upstream.conf 2>/dev/null | sed '/^[[:space:]]*$/d')
[ "$got" = "$want" ] || fail "/etc/upstream.conf на lab-db1 не совпадает с ожидаемым. Сейчас: $(echo "$got" | tr '\n' '|')"
lab_play $d "lb.yml -e max_conns=50" >/dev/null
docker exec lab-db1 grep -q 'max_conns=50' /etc/upstream.conf || fail "Переменная max_conns не используется в шаблоне"
lab_play $d lb.yml >/dev/null
ok "upstream собран по группе web"
```

```text hint
1. В шаблоне: цикл по списку хостов группы — список групп доступен через специальную переменную groups.
2. Переменные другого хоста берутся из hostvars по его имени.
3. Значение по умолчанию для незаданной переменной — фильтр default.
4. Внимательно с пробелами: управляющие конструкции Jinja оставляют пустые строки — их можно убрать минусом внутри скобок.
```

```bash solution
cd ~/ansible-lab
mkdir -p templates
cat > templates/upstream.conf.j2 <<'EOF'
upstream app {
{% for host in groups['web'] %}
    server {{ host }}:{{ hostvars[host].app_port }} max_conns={{ max_conns | default(100) }};
{% endfor %}
}
EOF
cat > lb.yml <<'EOF'
- name: Балансировщик
  hosts: lab-db1
  become: true
  tasks:
    - name: Конфиг upstream
      ansible.builtin.template:
        src: upstream.conf.j2
        dest: /etc/upstream.conf
        mode: "0644"
EOF
ansible-playbook lb.yml && docker exec lab-db1 cat /etc/upstream.conf
```

```text review
Эталон — в «Решении»: `{% for host in groups['web'] %}`, `hostvars[host].app_port`, `max_conns | default(100)`.

- `groups['web']` — список хостов группы, `hostvars[имя]` — переменные и факты любого хоста, `inventory_hostname` — имя текущего, `group_names` — его группы. Так собирают конфиги кластеров: upstream в nginx, список узлов Patroni, `/etc/hosts`.
- Добавили сервер в inventory — он сам появится в балансировщике при следующем прогоне.
- Факты других хостов (`hostvars[h].ansible_default_ipv4.address`) есть, только если с ними уже был сеанс в этом прогоне — иначе включают кэш фактов или первый плей `hosts: all` со сбором фактов.
- В Ansible по умолчанию `trim_blocks` включён: перевод строки после `{% %}` убирается. Для точного контроля — `{%-` и `-%}`.
```

## Тест

### Какой источник переменных имеет самый высокий приоритет?
- [ ] defaults роли
- [ ] group_vars/all
- [x] extra vars, переданные через -e
- [ ] host_vars
> Extra vars перекрывают всё остальное.

### Какой источник переменных имеет самый низкий приоритет?
- [x] defaults роли (defaults/main.yml)
- [ ] vars роли
- [ ] extra vars
- [ ] vars задачи
> Поэтому туда кладут значения, которые пользователь роли должен уметь переопределить.

### Где лучше хранить значения, которые отличаются между группами серверов?
- [ ] В vars роли
- [x] В group_vars для соответствующих групп
- [ ] В самом шаблоне
- [ ] В ansible.cfg
> Значения конкретного хоста — в host_vars.

### Переменная задана в group_vars/all и в host_vars/web1. Какое значение получит web1?
- [ ] Из group_vars/all
- [x] Из host_vars/web1 — переменные хоста приоритетнее переменных групп
- [ ] Ошибку
- [ ] Случайное
> Более конкретное перекрывает более общее.

### Почему строку path: {{ base_dir }}/app надо взять в кавычки?
- [ ] Так требует Jinja2
- [x] Значение начинается с фигурной скобки, и YAML примет её за начало словаря — будет ошибка синтаксиса
- [ ] Без кавычек переменная не подставится в /app
- [ ] Это стиль, а не требование
> Правильно: path: "{{ base_dir }}/app".

### Что делает фильтр default('dev') в выражении app_env | default('dev')?
- [ ] Всегда подставляет dev
- [x] Подставляет dev, если переменная app_env не определена
- [ ] Записывает dev в app_env навсегда
- [ ] Проверяет, что значение равно dev
> Фильтр mandatory, наоборот, требует, чтобы переменная была задана.

### Чем конструкция с двойными фигурными скобками отличается от конструкции с процентами в Jinja2?
- [x] В двойных фигурных скобках — выражение, значение которого подставляется в текст
- [x] В скобках с процентами — управляющие конструкции: if, for, set
- [ ] Это одно и то же
- [ ] Проценты используются для комментариев
> Комментарий в Jinja2 заключают в скобки с решёткой.

### Где обрабатываются шаблоны Jinja2 при работе модуля template?
- [ ] На управляемом хосте
- [x] На control node — на хост отправляется уже готовый файл
- [ ] В Docker-контейнере
- [ ] На сервере Ansible Galaxy
> Поэтому Jinja2 нужен только на control node.

### Как получить адрес хоста db1, выполняя задачу на web1?
- [ ] ansible_host
- [x] hostvars['db1']['ansible_host']
- [ ] groups['db1']
- [ ] inventory_hostname
> hostvars даёт доступ к переменным и фактам любого хоста.

### Что содержит переменная groups['web']?
- [ ] Переменные группы web
- [x] Список хостов группы web
- [ ] Число хостов
- [ ] Группы текущего хоста
> Группы текущего хоста — в group_names.

### Почему шаблон, в который вставляется текущее время, плох?
- [ ] Время нельзя использовать в Jinja2
- [x] Файл будет отличаться при каждом запуске, задача всегда будет changed и будет лишний раз дёргать handlers
- [ ] Шаблон не отрендерится
- [ ] Время всегда в UTC
> Это ломает идемпотентность.

### Для чего в начало шаблона добавляют ansible_managed?
- [ ] Чтобы файл зашифровался
- [x] Чтобы в файле было предупреждение, что он управляется Ansible и ручные правки будут перезаписаны
- [ ] Чтобы включить проверку синтаксиса
- [ ] Чтобы задать права файла
> Строку можно настроить в ansible.cfg.

### Как передать переменную version в плейбук из CI при запуске?
- [ ] Записать в defaults роли
- [x] ansible-playbook deploy.yml -e "version=1.4.2"
- [ ] Через переменную окружения ANSIBLE_VERSION
- [ ] Через --tags version
> Extra vars удобно передавать из пайплайна.
