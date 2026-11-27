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
