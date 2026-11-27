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
