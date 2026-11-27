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
