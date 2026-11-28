---
title: Сломанный сервер — Ansible
slug: slomannyj-server-ansible
description: Сломанные плейбуки без подсказок в условии — переменная не определена на части серверов, плейбук при каждом прогоне что-то меняет. Где Ansible ищет переменные и как писать идемпотентно.
duration: 60
level: Практика
quizSize: 10
---

# Сломанный сервер — Ansible

Плейбук, который «работал у коллеги», ломается обычно не в модулях, а в данных: переменная лежит не там, где Ansible её ищет, или задача написана так, что каждый прогон что-то меняет и рано или поздно ломает сервер.

## Алгоритм «плейбук не работает»

1. **Прочитать ошибку целиком**: имя задачи, хост, текст. `'app_port' is undefined` — переменной нет **для этого хоста**.
2. **Что Ansible знает о хосте:** `ansible-inventory --host lab-web2` (переменные из inventory, group_vars, host_vars) и `ansible-inventory --graph` (кто в каких группах).
3. **Конкретная переменная:** `ansible lab-web2 -m debug -a var=app_port`.
4. **Режим проверки:** `ansible-playbook site.yml --check --diff` — что поменяется, не меняя.
5. **Подробности:** `-v`…`-vvv`, запуск одной задачи — `--start-at-task`, один хост — `--limit lab-web2`.

## Где Ansible ищет group_vars и host_vars

- Рядом с **inventory** или рядом с **плейбуком**: `group_vars/<группа>.yml` (или каталог `group_vars/<группа>/`), `host_vars/<хост>.yml`.
- Имя файла должно **точно** совпадать с именем группы/хоста из inventory. `group_vars/webservers.yml` для группы `web` молча игнорируется.
- `group_vars/all.yml` — для всех хостов.

## Идемпотентность

Второй прогон плейбука по настроенному серверу должен дать `changed=0`. Нарушают это:

| Плохо | Хорошо |
| --- | --- |
| `shell: echo ... >> файл` | `lineinfile`, `blockinfile`, `template`, `copy` |
| `shell: useradd deploy` | `user: name=deploy` |
| `command: mkdir /opt/app` | `file: state=directory` |
| `command` без `creates`/`removes` | `creates:` или модуль |
| `ignore_errors: true` «чтобы не падало» | разобраться, почему падает |

## Практика

- [ ] Пройти задачи лаборатории, первые 10 минут без подсказки
- [ ] Для каждой записать: симптом → команды → причина → решение
- [ ] Прогнать свой плейбук дважды подряд и добиться `changed=0` на втором прогоне

## Лаборатория

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
lab_failed() { grep -E '^lab-[a-z0-9]+ +:' /tmp/lab-ans.log | grep -oE 'failed=[0-9]+' | cut -d= -f2 | awk '{s += $1} END {print s + 0}'; }
```

### Переменная не определена

В `~/ans-broken` плейбук `site.yml` раскладывает конфиг приложения на веб-серверы. Коллега говорит, что у него всё работало, но сейчас плейбук падает. Почините так, чтобы плейбук проходил на **всех** веб-серверах и на каждом в `/etc/app/app.conf` было:

```
name=shop
port=8080
```

Значения уже есть в проекте — не дублируйте их в плейбуке или шаблоне.

```bash setup
lab_hosts lab-web1 lab-web2 lab-db1
d=/home/student/ans-broken
rm -rf $d; lab_inv $d
mkdir -p $d/templates $d/group_vars $d/host_vars
printf 'name={{ app_name }}\nport={{ app_port }}\n' > $d/templates/app.conf.j2
printf 'app_port: 8080\n' > $d/group_vars/webservers.yml
printf 'app_name: shop\n' > $d/host_vars/lab-web1.yml
cat > $d/site.yml <<'EOF'
- name: Конфиг приложения
  hosts: web
  become: true
  tasks:
    - name: Каталог конфига
      ansible.builtin.file:
        path: /etc/app
        state: directory
        mode: "0755"

    - name: Конфиг
      ansible.builtin.template:
        src: app.conf.j2
        dest: /etc/app/app.conf
        mode: "0644"
EOF
lab_own $d
```

```bash check
d=/home/student/ans-broken
for h in lab-web1 lab-web2; do docker exec $h rm -rf /etc/app 2>/dev/null; done
lab_play $d site.yml || fail "Плейбук падает: $(lab_anslog)"
for h in lab-web1 lab-web2; do
  c=$(docker exec $h cat /etc/app/app.conf 2>/dev/null | tr '\n' ' ')
  [ "$c" = "name=shop port=8080 " ] || fail "На $h /etc/app/app.conf: «$c»"
done
grep -rqE '8080|shop' $d/site.yml $d/templates && fail "Значения записаны прямо в плейбук или шаблон"
lab_play $d site.yml || fail "Повторный прогон падает: $(lab_anslog)"
[ "$(lab_changed)" = 0 ] || fail "Повторный прогон что-то меняет (changed=$(lab_changed))"
ok "конфиг одинаковый на lab-web1 и lab-web2"
```

```text hint
1. Прочитать, на каком хосте и какую переменную Ansible не нашёл.
2. Попросить Ansible показать все переменные проблемного хоста и сравнить с тем, что лежит в каталогах переменных проекта.
3. Сравнить имена файлов переменных с именами групп и хостов в инвентаре; общие для группы значения должны лежать в файле этой группы.
```

```bash solution
cd ~/ans-broken
ansible-playbook site.yml | grep -E 'fatal|undefined' | head -3
ansible-inventory --graph
ansible-inventory --host lab-web2
ls group_vars host_vars
mv group_vars/webservers.yml group_vars/web.yml
cat host_vars/lab-web1.yml >> group_vars/web.yml
rm host_vars/lab-web1.yml
ansible-playbook site.yml | tail -4
```

```text review
Две ошибки в данных, а не в плейбуке:

1. `group_vars/webservers.yml` — группы `webservers` в инвентаре нет (она называется `web`), файл молча игнорировался. Отсюда `'app_port' is undefined` на всех хостах.
2. `app_name` лежал в `host_vars/lab-web1.yml` — значение было только у одного сервера, на `lab-web2` шаблон падал. Общее для группы — в `group_vars`.

- `ansible-inventory --host имя` — первое, что смотреть при «undefined»: какие переменные хост реально получил.
- `| default(...)` в шаблоне скрыл бы ошибку: конфиг собрался бы с запасным значением, а не с нужным. `default` хорош для настоящих необязательных настроек.
- Ansible не предупреждает о «лишних» файлах в group_vars — опечатка в имени группы видна только по неопределённой переменной.
```

```text notes
\|\s*default\b => Использовался фильтр default — он прячет отсутствующую переменную вместо того, чтобы найти, почему её нет.
```

### Плейбук каждый раз что-то меняет

В `~/ans-idem` плейбук `setup.yml` готовит серверы группы `db`: пользователь `deploy`, каталог `/opt/app`, строка `export APP_ENV=prod` в `/etc/profile.d/app.sh`. Плейбук «работает», но каждый прогон показывает изменения, а строка в файле размножается.

Перепишите плейбук так, чтобы результат на сервере остался тем же, а **второй прогон давал `changed=0`** без ошибок. Скрывать ошибки и изменения нельзя.

```bash setup
lab_hosts lab-web1 lab-web2 lab-db1
d=/home/student/ans-idem
rm -rf $d; lab_inv $d
cat > $d/setup.yml <<'EOF'
- name: Подготовка серверов БД
  hosts: db
  become: true
  tasks:
    - name: Пользователь deploy
      ansible.builtin.shell: useradd -m -s /bin/bash deploy
      ignore_errors: true

    - name: Каталог приложения
      ansible.builtin.command: mkdir -p /opt/app

    - name: Окружение
      ansible.builtin.shell: echo 'export APP_ENV=prod' >> /etc/profile.d/app.sh
EOF
lab_own $d
```

```bash check
d=/home/student/ans-idem
grep -qE 'ignore_errors|failed_when|changed_when' $d/setup.yml && fail "В плейбуке скрываются ошибки или изменения"
lab_hosts lab-db1
lab_play $d setup.yml || fail "Плейбук падает на чистом сервере: $(lab_anslog)"
docker exec lab-db1 id deploy >/dev/null 2>&1 || fail "После прогона нет пользователя deploy"
docker exec lab-db1 test -d /home/deploy || fail "У пользователя deploy нет домашнего каталога"
[ "$(docker exec lab-db1 getent passwd deploy | cut -d: -f7)" = /bin/bash ] || fail "У пользователя deploy оболочка не /bin/bash"
docker exec lab-db1 test -d /opt/app || fail "Нет каталога /opt/app"
lab_play $d setup.yml || fail "Повторный прогон падает: $(lab_anslog)"
grep -q '\.\.\.ignoring' /tmp/lab-ans.log && fail "Повторный прогон игнорирует ошибки"
[ "$(lab_changed)" = 0 ] || fail "Повторный прогон что-то меняет (changed=$(lab_changed))"
lab_play $d setup.yml >/dev/null
n=$(docker exec lab-db1 grep -c '^export APP_ENV=prod$' /etc/profile.d/app.sh 2>/dev/null)
[ "$n" = 1 ] || fail "В /etc/profile.d/app.sh строка export APP_ENV=prod встречается $n раз(а)"
ok "три прогона, строка одна, второй и третий — changed=0"
```

```text hint
1. Пройтись по задачам: какая из них при повторе меняет состояние, а какая падает и прячет ошибку.
2. Для каждой задачи найти модуль, который описывает желаемое состояние, а не действие: пользователь существует, каталог существует, строка есть в файле.
3. Прогнать дважды и посмотреть итоговую строку по хосту.
```

```bash solution
cd ~/ans-idem
cat > setup.yml <<'EOF'
- name: Подготовка серверов БД
  hosts: db
  become: true
  tasks:
    - name: Пользователь deploy
      ansible.builtin.user:
        name: deploy
        shell: /bin/bash
        create_home: true

    - name: Каталог приложения
      ansible.builtin.file:
        path: /opt/app
        state: directory
        mode: "0755"

    - name: Окружение
      ansible.builtin.lineinfile:
        path: /etc/profile.d/app.sh
        line: export APP_ENV=prod
        create: true
        mode: "0644"
EOF
ansible-playbook setup.yml | tail -3
ansible-playbook setup.yml | tail -3
```

```text review
Все три задачи описывали **действие**, а не **состояние**:

- `shell: useradd` падает при втором запуске («already exists»), а `ignore_errors` прятал это — заодно прятал бы и настоящую ошибку. Модуль `user` сам проверяет, есть ли пользователь.
- `command: mkdir -p` всегда `changed`: Ansible не знает, что делает команда. `file: state=directory` — `ok`, если каталог уже есть.
- `shell: echo >> файл` дописывает строку при каждом прогоне. `lineinfile` добавляет её только если её нет.

- Если без `command`/`shell` не обойтись, задайте `creates:`/`removes:` или честный `changed_when` по выводу команды — но не `changed_when: false` «для красоты».
- Проверка идемпотентности — второй прогон с `changed=0`, в CI её делает Molecule (`molecule idempotence`).
```

## Тест

### Плейбук падает: «'app_port' is undefined». Что это значит?
- [ ] Переменная задана с ошибкой типа
- [x] Для этого хоста переменная нигде не определена — Ansible её не нашёл
- [ ] Нет модуля app_port
- [ ] Неверный пароль sudo
> Ошибка относится к конкретному хосту: на другом переменная может быть.

### Какой командой посмотреть все переменные, которые получает хост lab-web2 из инвентаря и group_vars/host_vars?
= ansible-inventory --host lab-web2
> Показывает итоговые переменные инвентаря для хоста.

### Группа в инвентаре называется web, а переменные лежат в group_vars/webservers.yml. Что будет?
- [ ] Ansible подставит их по похожему имени
- [x] Файл будет молча проигнорирован
- [ ] Ошибка при запуске плейбука
- [ ] Переменные применятся ко всем хостам
> Имя файла должно точно совпадать с именем группы.

### Где правильно хранить значение, общее для всех веб-серверов?
- [ ] В host_vars каждого сервера
- [x] В group_vars/<группа веб-серверов>.yml
- [ ] В шаблоне
- [ ] В ansible.cfg
> host_vars — для отличий конкретного хоста, group_vars — для общего.

### Почему | default('shop') в шаблоне — плохое решение для «undefined»?
- [ ] default не работает в шаблонах
- [x] Он скрывает, что переменная не нашлась, и конфиг соберётся с неправильным значением
- [ ] Он замедляет плейбук
- [ ] Он запрещён в новых версиях
> Ошибка «undefined» полезна: она показывает, что данные лежат не там.

### Что означает «идемпотентный плейбук»?
- [ ] Плейбук выполняется быстро
- [x] Повторный прогон по настроенному серверу ничего не меняет (changed=0)
- [ ] Плейбук работает без sudo
- [ ] Плейбук не использует переменные
> Описано желаемое состояние, а не действия.

### Какой модуль добавит строку в файл, только если её там ещё нет?
= lineinfile
= ansible.builtin.lineinfile
> `lineinfile` проверяет наличие строки (или заменяет по `regexp`).

### Задача `shell: useradd deploy` с ignore_errors: true. Что не так?
- [ ] Всё нормально, так принято
- [x] Второй прогон падает, а ошибка скрыта — вместе с любыми настоящими ошибками
- [ ] useradd не работает в Ansible
- [ ] Нужно писать command вместо shell
> Модуль `user` сам проверит, есть ли пользователь.

### Без command не обойтись: скрипт создаёт /opt/app/.installed. Как сделать задачу идемпотентной?
- [ ] changed_when: false
- [x] creates: /opt/app/.installed
- [ ] ignore_errors: true
- [ ] when: true
> С `creates` задача пропускается, если файл уже есть.

### Какой ключ ansible-playbook покажет, что изменится, ничего не меняя?
- [ ] --syntax-check
- [x] --check --diff
- [ ] --list-tasks
- [ ] -vvv
> `--check` — пробный прогон, `--diff` — разница в файлах.

### Как запустить плейбук только на одном хосте lab-web2?
= --limit lab-web2
= ansible-playbook site.yml --limit lab-web2
> `--limit` ограничивает хосты плея.

### Почему command: mkdir -p /opt/app всегда показывает changed?
- [ ] mkdir -p меняет права
- [x] Ansible не знает, что делает команда, и считает любой запуск изменением
- [ ] Это ошибка Ansible
- [ ] Каталог пересоздаётся
> Модули сообщают об изменениях сами; для command это всегда changed без `creates`/`changed_when`.
