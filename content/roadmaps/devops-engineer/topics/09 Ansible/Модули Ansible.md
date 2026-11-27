---
title: Модули Ansible
slug: moduli-ansible
description: Главные модули — apt, yum/dnf, package, copy, template, file, lineinfile, service и systemd, user и authorized_key, git, get_url, docker_container — их параметры, state и как читать документацию через ansible-doc.
duration: 75
level: Основы
quizSize: 10
materials:
  - title: Ansible Docs — Introduction to ad hoc commands (примеры модулей)
    url: https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html
    type: документация
  - title: Ansible Docs — ansible.builtin.template module
    url: https://docs.ansible.com/projects/ansible-core/2.15/collections/ansible/builtin/template_module.html
    type: документация
  - title: Ansible Docs — community.docker.docker_container module
    url: https://docs.ansible.com/ansible/latest/collections/community/docker/docker_container_module.html
    type: документация
---

# Модули Ansible

**Модуль** — программа, которая приводит один аспект системы к нужному состоянию. Почти у всех модулей есть параметр **`state`**: `present`/`absent`, `started`/`stopped`, `directory`/`file`/`link`…

```bash
ansible-doc -l | grep docker          # список модулей
ansible-doc ansible.builtin.apt       # документация и примеры
ansible-doc -s ansible.builtin.copy   # краткая сводка параметров
```

## Пакеты

```yaml
- name: Обновить кэш и поставить пакеты
  ansible.builtin.apt:
    name: [nginx, curl, git, htop]
    state: present
    update_cache: true
    cache_valid_time: 3600

- name: Обновить все пакеты
  ansible.builtin.apt:
    upgrade: dist
    update_cache: true

- name: Пакеты на RHEL-системах
  ansible.builtin.dnf:
    name: nginx
    state: latest

- name: Независимо от дистрибутива
  ansible.builtin.package:
    name: chrony
    state: present
```

- `present` — установлен (любая версия), `latest` — последняя версия (не идемпотентно во времени: обновится, когда выйдет новая), `absent` — удалён.
- `cache_valid_time` — не обновлять кэш, если он свежее часа.
- Ставьте **список в одном вызове**, а не цикл — так быстрее.

## Файлы

```yaml
- name: Скопировать файл
  ansible.builtin.copy:
    src: files/motd
    dest: /etc/motd
    owner: root
    group: root
    mode: "0644"
    backup: true

- name: Записать содержимое прямо из плейбука
  ansible.builtin.copy:
    content: "net.ipv4.ip_forward = 1\n"
    dest: /etc/sysctl.d/99-forward.conf

- name: Конфиг из шаблона Jinja2
  ansible.builtin.template:
    src: templates/nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    validate: nginx -t -c %s
  notify: Reload nginx

- name: Каталог
  ansible.builtin.file:
    path: /opt/app
    state: directory
    owner: deploy
    mode: "0755"

- name: Удалить файл
  ansible.builtin.file:
    path: /tmp/old.log
    state: absent

- name: Символическая ссылка
  ansible.builtin.file:
    src: /etc/nginx/sites-available/app
    dest: /etc/nginx/sites-enabled/app
    state: link

- name: Одна строка в конфиге
  ansible.builtin.lineinfile:
    path: /etc/ssh/sshd_config
    regexp: "^#?PasswordAuthentication"
    line: "PasswordAuthentication no"
  notify: Restart sshd
```

- **copy** — файл как есть; **template** — файл через Jinja2 с переменными.
- **mode** — **в кавычках** (`"0644"`), иначе YAML превратит число в десятичное и права будут неожиданными.
- `validate` — проверить файл перед заменой: сломанный конфиг не попадёт на сервер.
- `lineinfile` / `blockinfile` — точечные правки; если файл целиком ваш — лучше `template`.

## Сервисы

```yaml
- name: nginx запущен и в автозагрузке
  ansible.builtin.service:
    name: nginx
    state: started
    enabled: true

- name: Перечитать юниты и перезапустить сервис
  ansible.builtin.systemd:
    name: myapp
    state: restarted
    daemon_reload: true
```

`state`: `started`, `stopped`, `restarted` (всегда перезапускает — обычно в handler), `reloaded`.

## Пользователи и доступ

```yaml
- name: Пользователь deploy
  ansible.builtin.user:
    name: deploy
    shell: /bin/bash
    groups: [sudo, docker]
    append: true
    create_home: true

- name: SSH-ключ
  ansible.posix.authorized_key:
    user: deploy
    key: "{{ lookup('file', 'files/deploy.pub') }}"
```

`append: true` — **добавить** в группы, а не заменить весь список групп пользователя.

## Git, загрузки, архивы

```yaml
- name: Код приложения
  ansible.builtin.git:
    repo: https://gitlab.com/team/app.git
    dest: /opt/app
    version: v1.4.2

- name: Скачать бинарник
  ansible.builtin.get_url:
    url: https://example.com/node_exporter.tar.gz
    dest: /tmp/node_exporter.tar.gz
    checksum: "sha256:..."

- name: Распаковать
  ansible.builtin.unarchive:
    src: /tmp/node_exporter.tar.gz
    dest: /opt
    remote_src: true
```

## Docker

```yaml
- name: Контейнер приложения
  community.docker.docker_container:
    name: app
    image: registry.gitlab.com/team/app:1.4.2
    state: started
    restart_policy: unless-stopped
    ports:
      - "127.0.0.1:8000:8000"
    env:
      DATABASE_URL: "{{ database_url }}"
    volumes:
      - /opt/app/data:/data
```

Модули Docker — из коллекции `community.docker`, на целевом хосте нужен Python-пакет `docker` (Docker SDK). Для Compose — `community.docker.docker_compose_v2`.

## Команды — когда модуля нет

```yaml
- name: Инициализация, только если ещё не делали
  ansible.builtin.command: /opt/app/bin/init --data /var/lib/app
  args:
    creates: /var/lib/app/.initialized

- name: Проверка, не меняющая систему
  ansible.builtin.command: nginx -t
  changed_when: false
```

Другие полезные модули: `uri` (HTTP-запросы, проверка health), `wait_for` (ждать порт), `reboot`, `cron`, `sysctl`, `ufw`, `timezone`, `debug`, `assert`, `stat`.

## Практика

- [ ] Найти через `ansible-doc` описание модулей apt, copy и service и разобрать примеры
- [ ] Написать задачи: установить nginx, git и htop одним вызовом apt; создать каталог `/opt/app`; положить файл `motd`
- [ ] Через lineinfile запретить вход по паролю в sshd_config с проверкой `validate: sshd -t -f %s`
- [ ] Создать пользователя deploy с ключом и добавить в группу docker с `append: true`
- [ ] Проверить, что будет с правами, если указать `mode: 644` без кавычек
- [ ] Запустить контейнер nginx модулем `community.docker.docker_container`
- [ ] Написать задачу с `command` и `creates` и убедиться, что второй запуск не выполняет команду

## Тест

### Чем state: present отличается от state: latest в модуле apt?
- [ ] Ничем
- [x] present гарантирует, что пакет установлен (любая версия), latest — что установлена последняя доступная версия, и обновит пакет при выходе новой
- [ ] latest удаляет пакет
- [ ] present всегда переустанавливает пакет
> latest меняет систему со временем, поэтому в проде чаще фиксируют present или версию.

### Чем модуль template отличается от copy?
- [ ] template работает только с каталогами
- [x] template обрабатывает файл шаблонизатором Jinja2 с подстановкой переменных, copy копирует файл как есть
- [ ] copy поддерживает переменные, template — нет
- [ ] Ничем
> Шаблоны хранят в templates/ с расширением .j2.

### Почему mode в модулях file, copy и template пишут в кавычках, например "0644"?
- [ ] Так требует sudo
- [x] Иначе YAML может превратить значение в десятичное число и права получатся неожиданными
- [ ] Без кавычек Ansible игнорирует mode
- [ ] Это требование Python 2
> Ведущий ноль иногда работает, но надёжнее строка в кавычках.

### Какой модуль создаёт каталог?
- [ ] copy с state: directory
- [x] file с state: directory
- [ ] mkdir
- [ ] template
> Тот же модуль удаляет файлы (state: absent) и создаёт ссылки (state: link).

### Что делает append: true в модуле user вместе с groups?
- [ ] Добавляет пользователя в конец /etc/passwd
- [x] Добавляет пользователя в указанные группы, не удаляя его из остальных
- [ ] Создаёт группы
- [ ] Удаляет пользователя из всех групп
> Без append список групп пользователя будет заменён.

### Какой state в модуле service всегда перезапускает сервис?
= restarted
> Поэтому перезапуск обычно делают в handler — только при изменении конфига.

### Зачем параметр validate в модулях template и copy?
- [ ] Проверить права доступа
- [x] Проверить новый файл командой (например, nginx -t -c %s) до замены; если проверка не прошла, файл не будет заменён
- [ ] Проверить контрольную сумму
- [ ] Проверить синтаксис YAML плейбука
> Так сломанный конфиг не попадёт на сервер.

### Как сделать модуль command идемпотентным для одноразовой инициализации?
- [ ] Использовать shell
- [x] Указать creates: путь_к_файлу — команда не выполнится, если файл уже существует
- [ ] Добавить ignore_errors: true
- [ ] Запускать только с --check
> Есть и обратный параметр removes.

### Из какой коллекции модуль docker_container и что нужно на целевом хосте?
- [ ] ansible.builtin, ничего
- [x] community.docker; на хосте нужен Docker и Python-пакет docker (Docker SDK for Python)
- [ ] ansible.posix, только Docker
- [ ] community.general, Docker Compose
> Для Compose v2 в коллекции есть модуль docker_compose_v2.

### Какая команда показывает документацию модуля прямо в терминале?
= ansible-doc
= ansible-doc имя_модуля
> ansible-doc -s выводит краткую сводку параметров.

### Для чего changed_when: false у задачи с command nginx -t?
- [ ] Чтобы задача не выполнялась
- [x] Чтобы проверочная команда, которая ничего не меняет, не отображалась как changed и не нарушала идемпотентность отчёта
- [ ] Чтобы игнорировать ошибки
- [ ] Чтобы запустить handler
> Аналогично failed_when переопределяет условие ошибки.

### Какой модуль лучше подходит, чтобы изменить одну строку в /etc/ssh/sshd_config?
- [ ] copy
- [x] lineinfile с regexp и line
- [ ] shell с sed
- [ ] file
> Если весь файл под вашим управлением, используйте template.
