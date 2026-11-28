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

## Лаборатория

«Серверы» — контейнеры `lab-web1`, `lab-web2`, `lab-db1`; проект `~/ansible-lab` с `ansible.cfg` и `inventory.ini` (группы `web` и `db`) уже готов.

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

### Подготовить сервер приложения

Напишите плейбук `~/ansible-lab/app.yml` для группы **`web`**, который:

- создаёт пользователя **`deploy`** с оболочкой `/bin/bash`;
- создаёт каталог **`/opt/app`**, владелец `deploy`, права **0750**;
- кладёт файл **`/opt/app/config.ini`** с содержимым `[app]` и `port=8080` (две строки), владелец `deploy`, права **0640**;
- создаёт ключ `/opt/app/id_ed25519` командой `ssh-keygen -t ed25519 -N "" -f /opt/app/id_ed25519` — но **только если его ещё нет**.

Повторный прогон плейбука не должен ничего менять (`changed=0`).

```bash check
d=/home/student/ansible-lab
[ -f $d/app.yml ] || fail "Нет ~/ansible-lab/app.yml"
lab_play $d app.yml || fail "Плейбук падает: $(lab_anslog)"
for h in lab-web1 lab-web2; do
  docker exec $h id deploy >/dev/null 2>&1 || fail "На $h нет пользователя deploy"
  [ "$(docker exec $h getent passwd deploy | cut -d: -f7)" = /bin/bash ] || fail "У deploy на $h не bash"
  [ "$(docker exec $h stat -c '%U %a' /opt/app 2>/dev/null)" = "deploy 750" ] || fail "/opt/app на $h: $(docker exec $h stat -c '%U %a' /opt/app 2>&1)"
  [ "$(docker exec $h stat -c '%U %a' /opt/app/config.ini 2>/dev/null)" = "deploy 640" ] || fail "/opt/app/config.ini на $h: $(docker exec $h stat -c '%U %a' /opt/app/config.ini 2>&1)"
  [ "$(docker exec $h cat /opt/app/config.ini)" = "$(printf '[app]\nport=8080')" ] || fail "Содержимое config.ini на $h не то"
  docker exec $h test -f /opt/app/id_ed25519 || fail "На $h нет /opt/app/id_ed25519"
done
docker exec lab-db1 id deploy >/dev/null 2>&1 && fail "Пользователь deploy появился и на lab-db1 — плейбук должен работать только на группе web"
k1=$(docker exec lab-web1 sha256sum /opt/app/id_ed25519)
lab_play $d app.yml || fail "Повторный прогон падает: $(lab_anslog)"
c=$(lab_changed); [ "$c" = 0 ] || fail "Повторный прогон что-то меняет: changed=$c ($(grep -E '^changed:' /tmp/lab-ans.log | head -3 | tr '\n' ' '))"
[ "$(docker exec lab-web1 sha256sum /opt/app/id_ed25519)" = "$k1" ] || fail "При повторном прогоне ключ сгенерирован заново"
ok "плейбук идемпотентен: повторный прогон — changed=0"
```

```text hint
1. Модули: пользователи; файлы и каталоги (состояние «каталог», владелец, права); копирование содержимого в файл; запуск команды.
2. Права пишите в кавычках с ведущим нулём — иначе YAML прочитает число в десятичной системе.
3. У модуля запуска команд есть параметр «создаёт файл»: если файл уже есть, команда не запускается — так команда становится идемпотентной.
4. Прогнать плейбук дважды и посмотреть итоги по хостам.
```

```bash solution
cat > ~/ansible-lab/app.yml <<'EOF'
- name: Подготовить сервер приложения
  hosts: web
  become: true
  tasks:
    - name: Пользователь deploy
      ansible.builtin.user:
        name: deploy
        shell: /bin/bash

    - name: Каталог приложения
      ansible.builtin.file:
        path: /opt/app
        state: directory
        owner: deploy
        group: deploy
        mode: "0750"

    - name: Конфиг приложения
      ansible.builtin.copy:
        dest: /opt/app/config.ini
        content: |
          [app]
          port=8080
        owner: deploy
        group: deploy
        mode: "0640"

    - name: SSH-ключ приложения
      ansible.builtin.command:
        cmd: ssh-keygen -t ed25519 -N "" -f /opt/app/id_ed25519
        creates: /opt/app/id_ed25519
EOF
cd ~/ansible-lab && ansible-playbook app.yml && ansible-playbook app.yml | tail -4
```

```text review
Эталон — в «Решении».

- `mode: "0750"` — строкой. `mode: 750` без кавычек YAML прочитает как десятичное 750 = восьмеричное 1356 — странные права, частая ошибка.
- `copy: content:` — маленькие файлы прямо в плейбуке; для файлов с переменными — `template`.
- `command` + `creates` — команда выполнится, только если файла нет; `changed_when: false` — для команд, которые ничего не меняют (проверки).
- Полные имена модулей (`ansible.builtin.user`) рекомендует ansible-lint: однозначно, из какой коллекции модуль.
- «Повторный прогон — changed=0» — главный критерий хорошего плейбука.
```

```text notes
mode:\s*[0-7]{3,4}\s*$ => Права записаны без кавычек — YAML прочитает их как десятичное число. Пишите mode: "0750".
```

### Права sudo с проверкой

На серверах группы `web` пользователю `deploy` нужно разрешить **без пароля** только одну команду — `/usr/bin/systemctl restart nginx`. Добавьте в плейбук `~/ansible-lab/sudo.yml` задачу, которая кладёт правило в `/etc/sudoers.d/deploy` с правами **0440** и **проверяет файл перед установкой** (`visudo -cf`), чтобы сломанное правило не попало на сервер. Пользователь `deploy` на серверах уже есть.

```bash setup
for h in lab-web1 lab-web2; do docker exec $h useradd -m -s /bin/bash deploy; done
rm -f /home/student/ansible-lab/sudo.yml
```

```bash check
d=/home/student/ansible-lab
[ -f $d/sudo.yml ] || fail "Нет ~/ansible-lab/sudo.yml"
grep -qE 'validate:.*visudo\s+-cf\s+%s' $d/sudo.yml || fail "Задача не проверяет файл через visudo -cf %s перед установкой"
lab_play $d sudo.yml || fail "Плейбук падает: $(lab_anslog)"
for h in lab-web1 lab-web2; do
  [ "$(docker exec $h stat -c '%a' /etc/sudoers.d/deploy 2>/dev/null)" = 440 ] || fail "На $h /etc/sudoers.d/deploy отсутствует или права не 440"
  docker exec $h visudo -cf /etc/sudoers.d/deploy >/dev/null 2>&1 || fail "На $h в /etc/sudoers.d/deploy ошибка"
  r=$(docker exec $h sudo -l -U deploy 2>/dev/null)
  echo "$r" | grep -q 'NOPASSWD: /usr/bin/systemctl restart nginx' || fail "На $h у deploy нет правила NOPASSWD для перезапуска nginx: $(echo "$r" | tail -2 | tr '\n' ' ')"
  echo "$r" | grep -qE '\(ALL( : ALL)?\) (NOPASSWD: )?ALL$' && fail "На $h deploy получил полный доступ"
done
ok "правило sudo установлено с проверкой visudo"
```

```text hint
1. Модуль копирования умеет записать содержимое в файл с владельцем и правами.
2. У модулей, которые пишут файлы, есть параметр проверки: команда, которой передаётся временный файл (на месте %s); если она завершилась с ошибкой, файл не устанавливается.
3. Синтаксис правила sudo: пользователь, хосты, от чьего имени, флаг «без пароля» и полный путь команды.
```

```bash solution
cat > ~/ansible-lab/sudo.yml <<'EOF'
- name: Права sudo для deploy
  hosts: web
  become: true
  tasks:
    - name: Разрешить deploy перезапуск nginx
      ansible.builtin.copy:
        dest: /etc/sudoers.d/deploy
        content: "deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx\n"
        owner: root
        group: root
        mode: "0440"
        validate: visudo -cf %s
EOF
cd ~/ansible-lab && ansible-playbook sudo.yml
```

```text review
Эталон: `copy` с `validate: visudo -cf %s` и `mode: "0440"`.

- Ошибка в sudoers может отрезать sudo **у всех** на сервере. `validate` проверяет временный файл и не трогает рабочий, если проверка не прошла, — Ansible честно падает, сервер остаётся живым.
- Так же для других критичных конфигов: `validate: sshd -t -f %s` для sshd_config, `nginx -t -c %s` (для полного nginx.conf), `/usr/sbin/named-checkconf %s`.
- Для одной строки в существующем файле — `lineinfile` с тем же `validate`. Для sudoers — отдельный файл в `/etc/sudoers.d/` удобнее.
- Модуль `community.general.sudoers` описывает правило параметрами, без ручного синтаксиса.
```

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
