---
title: Ansible Vault
slug: ansible-vault
description: Шифрование секретов в Ansible — ansible-vault create, encrypt, edit, view, rekey и encrypt_string, пароли и vault-id, схема vars.yml и vault.yml, no_log, Vault в CI и ограничения подхода.
duration: 45
level: Средний
quizSize: 10
materials:
  - title: Ansible Docs — Encrypting content with Ansible Vault
    url: https://docs.ansible.com/ansible/9/vault_guide/vault_encrypting_content.html
    type: документация
  - title: Ansible Docs — Using encrypted variables and files
    url: https://docs.ansible.com/ansible/latest/vault_guide/vault_using_encrypted_content.html
    type: документация
---

# Ansible Vault

Пароли баз, токены и ключи нужны плейбукам, но **хранить их в Git открытым текстом нельзя**. **Ansible Vault** шифрует файлы или отдельные значения (AES-256), и их можно спокойно коммитить. При запуске Ansible расшифровывает их паролем vault.

## Шифрование файлов

```bash
ansible-vault create group_vars/prod/vault.yml     # создать зашифрованный файл в редакторе
ansible-vault encrypt secrets.yml                  # зашифровать существующий
ansible-vault view group_vars/prod/vault.yml       # посмотреть
ansible-vault edit group_vars/prod/vault.yml       # отредактировать
ansible-vault decrypt secrets.yml                  # расшифровать на диске (осторожно!)
ansible-vault rekey group_vars/prod/vault.yml      # сменить пароль
```

Зашифрованный файл выглядит так:

```
$ANSIBLE_VAULT;1.1;AES256
62313365396662343061393464336163383764373764613633653634306231386433626436623361
...
```

## Шифрование отдельной переменной

```bash
ansible-vault encrypt_string --name 'db_password' 'S3cr3t!'
```

```yaml
db_user: app
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  3961613633...
```

Остальной файл остаётся читаемым, зашифровано только значение. Не вводите секрет прямо в командной строке на рабочих машинах — он попадёт в историю shell; используйте `--stdin-name` или ввод по запросу.

## Рекомендуемая схема: vars.yml + vault.yml

```
group_vars/prod/
├── vars.yml      # открытый
└── vault.yml     # зашифрованный
```

`vault.yml`:

```yaml
vault_db_password: S3cr3t!
vault_api_token: abc123
```

`vars.yml`:

```yaml
db_password: "{{ vault_db_password }}"
api_token: "{{ vault_api_token }}"
```

Так через `grep` видно, **какие** переменные есть и где используются, а значения — зашифрованы. Префикс `vault_` подсказывает, где искать значение.

## Запуск с паролем

```bash
ansible-playbook site.yml --ask-vault-pass
ansible-playbook site.yml --vault-password-file ~/.vault_pass
ansible-playbook site.yml --vault-id prod@prompt --vault-id dev@~/.vault_dev
```

- Файл пароля — **вне репозитория**, права `600`, путь можно указать в `ansible.cfg` (`vault_password_file`).
- Вместо файла можно указать **скрипт**, который получает пароль из менеджера секретов.
- **vault-id** — метки для разных паролей (dev, prod): секреты прода можно зашифровать отдельным паролем, который есть не у всех.

## Не светить секреты в логах

```yaml
- name: Создать пользователя БД
  community.postgresql.postgresql_user:
    name: app
    password: "{{ db_password }}"
  no_log: true
```

`no_log: true` скрывает параметры и результат задачи в выводе — иначе при `-v` или ошибке пароль окажется в логе (например, в логе CI).

## Vault в CI

```yaml
deploy:
  script:
    - ansible-playbook -i inventories/prod site.yml --vault-password-file "$VAULT_PASS_FILE"
```

`VAULT_PASS_FILE` — переменная GitLab типа **File**, Masked и Protected.

## Ограничения

- Vault защищает **данные на диске** (в Git). После расшифровки во время выполнения секреты в памяти и в задачах — ответственность плейбука (`no_log`, права файлов на сервере).
- Один пароль на всю команду — его сложно ротировать и отзывать.
- Нет аудита и динамических секретов. Для крупных систем используют **HashiCorp Vault** и другие менеджеры секретов (lookup-плагины Ansible умеют их читать) — это отдельная тема роадмапа.

## Практика

- [ ] Создать `group_vars/prod/vault.yml` через `ansible-vault create` и положить туда пароль базы
- [ ] Сделать схему `vars.yml` + `vault.yml` и использовать переменную в задаче
- [ ] Запустить плейбук с `--ask-vault-pass`, затем с файлом пароля вне репозитория
- [ ] Зашифровать одно значение через `encrypt_string` и вставить в открытый файл
- [ ] Запустить задачу с паролем с `-v` без `no_log` и с ним, сравнить вывод
- [ ] Сменить пароль vault через `rekey`
- [ ] Передать пароль vault в пайплайн GitLab через переменную типа File

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
rm -rf /home/student/ansible-lab /home/student/.vault_pass
lab_inv /home/student/ansible-lab
lab_own /home/student/ansible-lab
```

### Пароль базы в зашифрованном файле

Плейбук `~/ansible-lab/db.yml` (уже написан) кладёт на `lab-db1` файл `/etc/app/db.env` со строкой `DB_PASSWORD={{ db_password }}`. Задайте `db_password` по схеме «открытый + зашифрованный файлы»:

- `group_vars/db/vault.yml` — **зашифрованный** Ansible Vault, в нём `vault_db_password: S3cr3t-db`;
- `group_vars/db/vars.yml` — открытый, в нём `db_password: "{{ vault_db_password }}"`;
- пароль от vault — в файле **`~/.vault_pass`** (вне каталога проекта, права **600**).

Запустите плейбук с этим файлом пароля.

```bash setup
mkdir -p /home/student/ansible-lab
cat > /home/student/ansible-lab/db.yml <<'EOF'
- name: Настройки базы
  hosts: db
  become: true
  tasks:
    - name: Каталог настроек
      ansible.builtin.file:
        path: /etc/app
        state: directory
        mode: "0755"
    - name: Файл с паролем
      ansible.builtin.copy:
        dest: /etc/app/db.env
        content: "DB_PASSWORD={{ db_password }}\n"
        mode: "0600"
      no_log: true
EOF
lab_own /home/student/ansible-lab
```

```bash check
d=/home/student/ansible-lab
v=$d/group_vars/db/vault.yml
[ -f $v ] || fail "Нет group_vars/db/vault.yml"
head -1 $v | grep -q '^\$ANSIBLE_VAULT' || fail "group_vars/db/vault.yml не зашифрован"
grep -q 'S3cr3t-db' $v && fail "Пароль виден в vault.yml открытым текстом"
[ -f $d/group_vars/db/vars.yml ] || fail "Нет group_vars/db/vars.yml"
grep -q 'vault_db_password' $d/group_vars/db/vars.yml || fail "vars.yml не ссылается на vault_db_password"
[ -f /home/student/.vault_pass ] || fail "Нет ~/.vault_pass"
[ "$(stat -c %a /home/student/.vault_pass)" = 600 ] || fail "Права на ~/.vault_pass — $(stat -c %a /home/student/.vault_pass)"
ls $d/.vault_pass $d/vault_pass* 2>/dev/null | grep -q . && fail "Файл пароля vault лежит в каталоге проекта — он попадёт в Git"
su - student -c "cd $d && ansible-vault view --vault-password-file ~/.vault_pass group_vars/db/vault.yml" 2>/dev/null | grep -qE 'vault_db_password:\s*"?S3cr3t-db"?' || fail "vault.yml не расшифровывается паролем из ~/.vault_pass или в нём нет vault_db_password: S3cr3t-db"
docker exec lab-db1 rm -f /etc/app/db.env
lab_play $d "db.yml --vault-password-file ~/.vault_pass" || fail "Плейбук с паролем vault падает: $(lab_anslog)"
[ "$(docker exec lab-db1 cat /etc/app/db.env 2>/dev/null)" = "DB_PASSWORD=S3cr3t-db" ] || fail "На lab-db1 в /etc/app/db.env не тот пароль"
grep -q 'S3cr3t-db' /tmp/lab-ans.log && fail "Пароль виден в выводе плейбука"
ok "секрет зашифрован, плейбук получил его через vault"
```

```text hint
1. Создать файл пароля в домашнем каталоге и закрыть его от всех, кроме себя.
2. Создать каталог переменных группы с двумя файлами: открытый — со ссылкой на «секретную» переменную, второй — с самим секретом. Второй зашифровать утилитой vault (у неё есть команды создать, зашифровать, посмотреть, отредактировать), указав файл пароля.
3. Запустить плейбук, указав тот же файл пароля.
```

```bash solution
echo 'lab-vault-password' > ~/.vault_pass && chmod 600 ~/.vault_pass
cd ~/ansible-lab && mkdir -p group_vars/db
echo 'db_password: "{{ vault_db_password }}"' > group_vars/db/vars.yml
echo 'vault_db_password: S3cr3t-db' > group_vars/db/vault.yml
ansible-vault encrypt --vault-password-file ~/.vault_pass group_vars/db/vault.yml
head -1 group_vars/db/vault.yml
ansible-playbook db.yml --vault-password-file ~/.vault_pass
```

```text review
Эталон: `vars.yml` (`db_password: "{{ vault_db_password }}"`) + зашифрованный `vault.yml` + `--vault-password-file ~/.vault_pass`.

- Схема «vars + vault»: по открытому файлу видно, **какие** переменные есть и откуда берутся (`grep db_password` работает), а значения — только в зашифрованном. Префикс `vault_` — договорённость.
- Зашифрованный файл можно спокойно коммитить; пароль vault — **никогда**: он в `~/.vault_pass`, менеджере паролей, а в CI — в переменной типа File (`--vault-password-file $VAULT_PASS_FILE`) или в `ANSIBLE_VAULT_PASSWORD_FILE`.
- `no_log: true` — чтобы значение не попало в вывод и логи (особенно с `-v` и при ошибке).
- Команды: `ansible-vault create|edit|view|encrypt|decrypt|rekey`. `rekey` — сменить пароль при уходе человека из команды.
```

### Одно зашифрованное значение

Иногда шифровать весь файл неудобно. В `~/ansible-lab/group_vars/web.yml` уже есть открытые переменные. Добавьте туда переменную **`api_token`** со значением **`tok-web-7781`**, **зашифрованную как одно значение** (`!vault |`), — остальные переменные файла должны остаться открытыми. Пароль vault — тот же `~/.vault_pass` (создайте, если его нет). Затем запустите плейбук `~/ansible-lab/token.yml` (уже написан) — он кладёт токен на серверы `web`.

```bash setup
mkdir -p /home/student/ansible-lab/group_vars
printf 'app_port: 8080\nlog_level: info\n' > /home/student/ansible-lab/group_vars/web.yml
cat > /home/student/ansible-lab/token.yml <<'EOF'
- name: Токен API
  hosts: web
  become: true
  tasks:
    - name: Записать токен
      ansible.builtin.copy:
        dest: /etc/api_token
        content: "{{ api_token }}\n"
        mode: "0600"
      no_log: true
EOF
lab_own /home/student/ansible-lab
```

```bash check
d=/home/student/ansible-lab
f=$d/group_vars/web.yml
grep -q 'tok-web-7781' $f && fail "Токен виден в group_vars/web.yml открытым текстом"
grep -qE '^api_token:\s*!vault\s*\|' $f || fail "В group_vars/web.yml нет api_token, зашифрованного как одно значение (!vault |)"
head -1 $f | grep -q '^\$ANSIBLE_VAULT' && fail "Зашифрован весь файл, а нужно одно значение"
grep -qE '^app_port:\s*8080' $f && grep -qE '^log_level:\s*info' $f || fail "Открытые переменные файла пропали или изменились"
for h in lab-web1 lab-web2; do docker exec $h rm -f /etc/api_token; done
lab_play $d "token.yml --vault-password-file ~/.vault_pass" || fail "Плейбук падает: $(lab_anslog)"
for h in lab-web1 lab-web2; do [ "$(docker exec $h cat /etc/api_token 2>/dev/null)" = tok-web-7781 ] || fail "На $h в /etc/api_token не тот токен"; done
ok "api_token зашифрован одной строкой, остальное — открыто"
```

```text hint
1. У утилиты vault есть команда шифрования одной строки: ей передают значение и имя переменной — она печатает готовый фрагмент YAML.
2. Дописать этот фрагмент в файл переменных группы.
3. Запустить плейбук с файлом пароля.
```

```bash solution
[ -f ~/.vault_pass ] || { echo 'lab-vault-password' > ~/.vault_pass; chmod 600 ~/.vault_pass; }
cd ~/ansible-lab
ansible-vault encrypt_string --vault-password-file ~/.vault_pass 'tok-web-7781' --name api_token >> group_vars/web.yml
cat group_vars/web.yml
ansible-playbook token.yml --vault-password-file ~/.vault_pass
```

```text review
Эталон: `ansible-vault encrypt_string 'tok-web-7781' --name api_token >> group_vars/web.yml`.

- Плюс: файл остаётся читаемым и diff в merge request показывает, что поменялось. Минус: такое значение нельзя «просто отредактировать» — только заменить новой строкой из `encrypt_string`.
- Посмотреть значение: `ansible localhost -m debug -a var=api_token -e @group_vars/web.yml --vault-password-file ~/.vault_pass`.
- Для больших проектов секреты часто уносят из Ansible совсем — в HashiCorp Vault (lookup `community.hashi_vault.hashi_vault`) или облачный Secret Manager.
```

## Тест

### Для чего нужен Ansible Vault?
- [ ] Для хранения плейбуков
- [x] Для шифрования секретов (файлов или отдельных значений), чтобы их можно было безопасно хранить в Git
- [ ] Для ускорения плейбуков
- [ ] Для управления пользователями
> Шифрование — AES-256.

### Какая команда открывает зашифрованный файл для редактирования?
= ansible-vault edit
= ansible-vault edit файл
> Файл расшифровывается во временный, после сохранения снова шифруется.

### Как зашифровать одно значение, а не весь файл?
- [ ] ansible-vault encrypt --var db_password
- [x] ansible-vault encrypt_string --name 'db_password' 'значение'
- [ ] ansible-vault create db_password
- [ ] Это невозможно
> Результат вставляется в YAML с тегом !vault.

### Зачем схема vars.yml с vault_db_password и vault.yml?
- [x] Видно, какие переменные существуют и где используются, хотя значения зашифрованы
- [x] Удобно искать переменные через grep и проводить ревью
- [ ] Так секреты не нужно расшифровывать
- [ ] Ansible не умеет читать vault-файлы напрямую
> Префикс vault_ указывает, что значение лежит в зашифрованном файле.

### Как передать пароль vault при запуске плейбука?
- [x] --ask-vault-pass — ввести вручную
- [x] --vault-password-file путь_к_файлу или скрипту
- [x] --vault-id метка@prompt или метка@файл
- [ ] Прописать пароль в плейбуке
> Файл пароля держат вне репозитория с правами 600.

### Что делает no_log: true у задачи?
- [ ] Отключает журнал systemd
- [x] Скрывает параметры и результат задачи в выводе Ansible, чтобы секреты не попали в логи
- [ ] Шифрует переменную
- [ ] Запрещает выполнение задачи
> Особенно важно в CI, где логи доступны многим.

### Как сменить пароль, которым зашифрован файл?
= ansible-vault rekey
= rekey
> Понадобятся старый и новый пароли.

### От чего защищает Ansible Vault?
- [x] От чтения секретов в репозитории и в файлах на диске
- [ ] От утечки секретов в выводе задач во время выполнения
- [ ] От злоумышленника с root-доступом к серверу, где уже лежит расшифрованный конфиг
- [ ] От ошибок в плейбуке
> Это защита данных в покое; во время выполнения нужны no_log и правильные права.

### Как передать пароль vault в GitLab CI безопасно?
- [ ] Закоммитить .vault_pass в репозиторий
- [x] Хранить пароль в CI/CD-переменной типа File с флагами Masked и Protected и передавать путь через --vault-password-file
- [ ] Вывести пароль в лог
- [ ] Передать через -e
> Пароль доступен только пайплайнам защищённых веток.

### Зачем vault-id с метками, например prod и dev?
- [ ] Для красоты
- [x] Чтобы шифровать секреты разных окружений разными паролями и не давать пароль от прода всем
- [ ] Чтобы ускорить расшифровку
- [ ] Метки обязательны
> Метка хранится открытым текстом в заголовке зашифрованного содержимого.

### Чем Ansible Vault уступает специализированным менеджерам секретов вроде HashiCorp Vault?
- [x] Нет аудита доступа и динамических секретов
- [x] Общий пароль сложно ротировать и отзывать
- [ ] Ansible Vault не шифрует данные
- [ ] Ansible Vault нельзя использовать в плейбуках
> Ansible умеет читать внешние менеджеры секретов через lookup-плагины.
