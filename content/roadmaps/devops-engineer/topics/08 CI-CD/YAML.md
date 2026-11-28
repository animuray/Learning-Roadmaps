---
title: YAML
slug: yaml
description: Синтаксис YAML для DevOps — словари, списки, типы и кавычки, многострочные строки, якоря и алиасы, несколько документов в файле и типичные ошибки отступов.
duration: 45
level: Основы
quizSize: 10
materials:
  - title: YAML Specification 1.2.2
    url: https://yaml.org/spec/1.2.2/
    type: документация
  - title: YAML Vocabulary Glossary (якоря и алиасы)
    url: https://yaml.org/spec/1.2.2/ext/glossary
    type: документация
  - title: GitLab Docs — Optimize GitLab CI/CD configuration files (якоря в CI)
    url: https://docs.gitlab.com/ci/yaml/yaml_optimization/
    type: документация
---

# YAML

YAML — язык конфигураций DevOps: `.gitlab-ci.yml`, `compose.yaml`, плейбуки Ansible, манифесты Kubernetes, Helm values, GitHub Actions. Ошибка в одном пробеле ломает пайплайн или деплой, поэтому синтаксис нужно знать уверенно.

## Основы

```yaml
# комментарий
name: my-app              # строка
replicas: 3               # число
debug: false              # логическое значение
timeout: 2.5              # дробное
nothing: null             # пусто (также ~ или просто пустое значение)
```

- Структура задаётся **отступами пробелами**. **Табуляция запрещена.**
- Количество пробелов не регламентировано, но в одном блоке должно быть одинаковым (обычно 2).
- После двоеточия обязателен пробел: `key: value`.
- YAML чувствителен к регистру.

## Словари и списки

```yaml
# словарь (mapping)
database:
  host: db
  port: 5432

# список (sequence)
packages:
  - nginx
  - curl
  - git

# список словарей — самое частое в DevOps
containers:
  - name: app
    image: myapp:1.0
    ports:
      - 8080
  - name: sidecar
    image: busybox

# короткая (flow) запись — как в JSON
ports: [80, 443]
labels: {app: web, tier: frontend}
```

YAML 1.2 — надмножество JSON: любой корректный JSON — корректный YAML.

## Типы и кавычки

YAML сам угадывает тип, и иногда — неудачно:

```yaml
version: 1.10        # число 1.1, а не строка "1.10"!
zip: 012345          # может стать числом
answer: yes          # в YAML 1.1 (PyYAML, старые парсеры) — true
country: NO          # «проблема Норвегии»: в YAML 1.1 это false
port: "8080"         # строка
time: 12:30          # в YAML 1.1 — число в шестидесятеричной системе
```

Правило: версии, номера, коды, `yes/no/on/off` — **берите в кавычки**.

- `'одинарные'` — всё буквально, спецсимволы не обрабатываются, `''` внутри — это одна кавычка.
- `"двойные"` — работают escape-последовательности: `"строка\nновая строка"`.
- Значение, начинающееся с `*`, `&`, `!`, `{`, `[`, `%`, `@`, `` ` `` или содержащее `: ` и ` #`, нужно брать в кавычки.

## Многострочные строки

```yaml
script: |
  echo "строка 1"
  echo "строка 2"
# литеральный блок: переводы строк СОХРАНЯЮТСЯ

description: >
  Это длинный текст,
  который будет склеен
  в одну строку.
# свёрнутый блок: переводы строк заменяются ПРОБЕЛАМИ
```

Модификаторы: `|-` и `>-` — убрать перевод строки в конце; `|+` — сохранить все конечные переводы строк.

`|` используют для скриптов, конфигов и сертификатов внутри YAML (например, в ConfigMap Kubernetes).

## Якоря, алиасы и слияние

```yaml
.defaults: &defaults
  image: python:3.12
  tags: [docker]

test:
  <<: *defaults
  script: pytest

lint:
  <<: *defaults
  image: python:3.12-slim
  script: ruff check .
```

- `&имя` — **якорь**: пометить узел.
- `*имя` — **алиас**: подставить помеченный узел.
- `<<:` — **ключ слияния**: влить словарь и при необходимости переопределить ключи (`image` у `lint`).
- Якоря работают **только внутри одного файла**.

## Несколько документов в файле

```yaml
apiVersion: v1
kind: Service
---
apiVersion: apps/v1
kind: Deployment
```

`---` разделяет документы — так в одном файле хранят несколько манифестов Kubernetes.

## Проверка и инструменты

```bash
yamllint config.yml                     # линтер: отступы, дубли ключей, длина строк
python3 -c 'import yaml,sys; yaml.safe_load(open(sys.argv[1]))' file.yml
yq '.services.app.image' compose.yaml   # читать и менять YAML из командной строки
```

Типичные ошибки:

- табы вместо пробелов;
- разный отступ у элементов одного списка;
- забытый пробел после `:` или `-`;
- дублирующиеся ключи (последний молча перезаписывает первый);
- неожиданное приведение типов (`1.10`, `no`, `on`).

## Практика

- [ ] Записать в YAML описание своего сервера: имя, IP, список пакетов, список пользователей с полями name и groups
- [ ] Сконвертировать этот YAML в JSON (`yq -o=json`) и обратно, сравнить
- [ ] Специально сломать файл табуляцией, неправильным отступом и дублирующимся ключом — посмотреть, что скажут `yamllint` и парсер Python
- [ ] Записать многострочный bash-скрипт через `|` и тот же текст через `>`; загрузить в Python и сравнить результат
- [ ] Вынести общие настройки двух блоков в якорь и подключить их через `<<: *имя`
- [ ] Проверить, как парсер прочитает `version: 1.10`, `country: NO` и `port: "8080"`

## Лаборатория

Проверить файл: `python3 -c 'import yaml,sys,json; print(json.dumps(yaml.safe_load(open(sys.argv[1])), ensure_ascii=False, indent=2))' файл.yaml` — так его видит парсер (PyYAML, как Ansible).

```bash setup
# загрузчик, который, в отличие от обычного, считает повтор ключа ошибкой
cat > /var/lib/lab/yamlload.py <<'EOF'
import sys, yaml
class Loader(yaml.SafeLoader):
    pass
def mapping(loader, node, deep=False):
    seen = set()
    for k, _ in node.value:
        if k.tag == "tag:yaml.org,2002:merge":
            continue
        key = loader.construct_object(k, deep=deep)
        if key in seen:
            raise yaml.constructor.ConstructorError(None, None, f"ключ «{key}» повторяется", k.start_mark)
        seen.add(key)
    return yaml.SafeLoader.construct_mapping(loader, node, deep)
Loader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)
def load(path):
    try:
        return yaml.load(open(path, encoding="utf-8"), Loader=Loader)
    except yaml.YAMLError as e:
        print("✗ Файл не разбирается как YAML: " + str(e).replace("\n", " "))
        sys.exit(1)
EOF
```

### Починить описание сервера

В `~/server.yaml` описан сервер, но файл не читается: кто-то правил его в редакторе с табуляцией и задвоил ключ. Исправьте файл, чтобы он разбирался и описывал:

- `name` — `web-01`, `ip` — актуальный адрес `10.0.0.15` (старый `10.0.0.14` удалить);
- `packages` — список: `nginx`, `git`, `htop`;
- `users` — список из двух пользователей: `deploy` (shell `/bin/bash`, groups `sudo` и `docker`) и `monitor` (shell `/usr/sbin/nologin`, groups — пустой список).

```bash setup
printf 'name: web-01\nip: 10.0.0.14\npackages:\n\t- nginx\n\t- git\n\t- htop\nip: 10.0.0.15\nusers:\n  - name: deploy\n    shell: /bin/bash\n    groups: [sudo, docker]\n  - name: monitor\n     shell: /usr/sbin/nologin\n    groups: []\n' > /home/student/server.yaml
chown student:student /home/student/server.yaml
```

```bash check
python3 - <<'EOF'
import sys; sys.path.insert(0, "/var/lib/lab")
from yamlload import load
d = load("/home/student/server.yaml")
want = {"name": "web-01", "ip": "10.0.0.15", "packages": ["nginx", "git", "htop"],
        "users": [{"name": "deploy", "shell": "/bin/bash", "groups": ["sudo", "docker"]},
                  {"name": "monitor", "shell": "/usr/sbin/nologin", "groups": []}]}
def fail(m): print("✗ " + m); sys.exit(1)
if not isinstance(d, dict): fail("Верхний уровень файла — не словарь")
for k in want:
    if d.get(k) != want[k]: fail(f"Значение «{k}» не то: {d.get(k)!r}")
extra = set(d) - set(want)
if extra: fail("Лишние ключи: " + ", ".join(map(str, extra)))
print("✓ server.yaml разбирается и описывает сервер верно")
EOF
```

```text hint
1. Запустить парсер и прочитать ошибку: номер строки и колонки.
2. В YAML отступы делают только пробелами; элементы списка и поля одного словаря должны быть на одном уровне отступа.
3. Обычный парсер молча берёт последнее значение повторённого ключа — здесь нужно оставить один ключ с актуальным адресом.
```

```bash solution
cat > ~/server.yaml <<'EOF'
name: web-01
ip: 10.0.0.15
packages:
  - nginx
  - git
  - htop
users:
  - name: deploy
    shell: /bin/bash
    groups: [sudo, docker]
  - name: monitor
    shell: /usr/sbin/nologin
    groups: []
EOF
python3 -c 'import yaml; print(yaml.safe_load(open("/home/student/server.yaml")))'
```

```text review
Эталон — в «Решении».

- **Табуляция в отступах запрещена** спецификацией YAML. В редакторе — `expandtab` (vim) или «Insert spaces» (VS Code), плюс `.editorconfig` в репозитории.
- Отступ определяет вложенность: поле `shell` с лишним пробелом — уже не поле того же словаря.
- Повтор ключа — не ошибка для большинства парсеров: молча побеждает **последний**. В Ansible и Kubernetes это даёт «настройка не применяется» без всяких сообщений. Ловят линтером: `yamllint` (правило `key-duplicates`).
- Проверять YAML до коммита: `yamllint`, `python3 -c 'import yaml...'`, `yq . file.yaml`, `kubectl apply --dry-run=client`, `ansible-playbook --syntax-check`.
```

### Ловушки типов

В `~/app-config.yaml` значения записаны «как попало», и парсер понимает их не так, как задумано. Исправьте файл, чтобы после разбора получилось:

- `version` — **строка** `1.10` (а не число 1.1);
- `country` — **строка** `NO` (Норвегия, а не `false`);
- `port` — **число** 8080;
- `debug` — **логическое** false;
- `motd` — многострочный текст **с сохранёнными переводами строк**: две строки `Добро пожаловать` и `Сервер web-01`, в конце перевод строки.

```bash setup
cat > /home/student/app-config.yaml <<'EOF'
version: 1.10
country: NO
port: "8080"
debug: "false"
motd: >
  Добро пожаловать
  Сервер web-01
EOF
chown student:student /home/student/app-config.yaml
```

```bash check
python3 - <<'EOF'
import sys; sys.path.insert(0, "/var/lib/lab")
from yamlload import load
d = load("/home/student/app-config.yaml")
def fail(m): print("✗ " + m); sys.exit(1)
if not isinstance(d, dict): fail("Верхний уровень — не словарь")
v = d.get("version")
if v != "1.10": fail(f"version разобран как {type(v).__name__} {v!r}")
c = d.get("country")
if c != "NO": fail(f"country разобран как {type(c).__name__} {c!r}")
p = d.get("port")
if type(p) is not int or p != 8080: fail(f"port разобран как {type(p).__name__} {p!r}")
g = d.get("debug")
if g is not False: fail(f"debug разобран как {type(g).__name__} {g!r}")
m = d.get("motd")
if m != "Добро пожаловать\nСервер web-01\n": fail(f"motd разобран как {m!r}")
print("✓ все типы верные")
EOF
```

```text hint
1. Число с точкой парсер читает как дробь (нули в конце теряются), а некоторые короткие слова — как логические значения. Чтобы получить строку, значение заключают в кавычки.
2. Числа и логические значения, наоборот, пишут без кавычек.
3. У многострочного текста два стиля блока: один склеивает строки в одну через пробел, другой сохраняет переводы строк как есть. Символ стиля — после двоеточия.
```

```bash solution
cat > ~/app-config.yaml <<'EOF'
version: "1.10"
country: "NO"
port: 8080
debug: false
motd: |
  Добро пожаловать
  Сервер web-01
EOF
python3 -c 'import yaml; print(yaml.safe_load(open("/home/student/app-config.yaml")))'
```

```text review
Эталон: кавычки у `"1.10"` и `"NO"`, без кавычек у `8080` и `false`, литеральный блок `|` у `motd`.

- **Norway problem**: в YAML 1.1 (PyYAML, Ansible, старые библиотеки) `yes/no/on/off/y/n` — логические значения. `country: NO` → `false`. В YAML 1.2 исправлено, но парсеры 1.1 повсюду.
- Версии, номера телефонов, почтовые индексы, `0755` (восьмеричное!), `1e3` — всегда в кавычки.
- `|` — переводы строк сохраняются (скрипты в CI, конфиги внутри ConfigMap); `>` — строки склеиваются через пробел (длинный текст). `|-` / `>-` — без завершающего перевода строки.
- В Kubernetes `port: "8080"` вместо числа — ошибка валидации; в docker-compose переменные окружения, наоборот, лучше в кавычках.
```

### Общие настройки через якоря

В `~/services.yaml` у сервисов `api` и `worker` повторяются одинаковые блоки `restart`, `logging` и `environment`. Вынесите их **один раз** в ключ `x-defaults` с якорем и подключите в оба сервиса слиянием. У `worker` политика `restart` должна быть своя — `on-failure`. После разбора значения у сервисов должны остаться прежними.

```bash setup
cat > /home/student/services.yaml <<'EOF'
services:
  api:
    image: shop/api:1.4.0
    restart: always
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: "3"
    environment:
      TZ: Europe/Moscow
      LOG_LEVEL: info
  worker:
    image: shop/worker:1.4.0
    restart: on-failure
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: "3"
    environment:
      TZ: Europe/Moscow
      LOG_LEVEL: info
EOF
chown student:student /home/student/services.yaml
```

```bash check
f=/home/student/services.yaml
[ "$(grep -c 'max-size' $f)" = 1 ] || fail "Блок logging всё ещё повторяется (max-size встречается $(grep -c 'max-size' $f) раз)"
grep -qE '&[A-Za-z_-]+' $f || fail "В файле нет якоря (&имя)"
grep -qE '<<:\s*\*[A-Za-z_-]+' $f || fail "Сервисы не подключают общие настройки слиянием (<<: *имя)"
python3 - <<'EOF'
import sys; sys.path.insert(0, "/var/lib/lab")
from yamlload import load
d = load("/home/student/services.yaml")
def fail(m): print("✗ " + m); sys.exit(1)
log = {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}
env = {"TZ": "Europe/Moscow", "LOG_LEVEL": "info"}
want = {"api": {"image": "shop/api:1.4.0", "restart": "always", "logging": log, "environment": env},
        "worker": {"image": "shop/worker:1.4.0", "restart": "on-failure", "logging": log, "environment": env}}
s = (d or {}).get("services", {})
for name, w in want.items():
    got = s.get(name)
    if not isinstance(got, dict): fail(f"Нет сервиса {name}")
    for k, v in w.items():
        if got.get(k) != v: fail(f"У {name} после разбора {k} = {got.get(k)!r}")
print("✓ общие настройки — один раз, значения у сервисов прежние")
EOF
```

```text hint
1. Завести ключ верхнего уровня с префиксом «x-» (так его игнорирует Docker Compose) и пометить его значение якорем — амперсанд и имя.
2. В каждом сервисе подключить содержимое якоря специальным ключом слияния — две «меньше» и двоеточие, затем звёздочка и имя.
3. Ключи, написанные в сервисе явно, важнее слитых — так задаётся своя политика перезапуска.
```

```bash solution
cat > ~/services.yaml <<'EOF'
x-defaults: &defaults
  restart: always
  logging:
    driver: json-file
    options:
      max-size: 10m
      max-file: "3"
  environment:
    TZ: Europe/Moscow
    LOG_LEVEL: info

services:
  api:
    <<: *defaults
    image: shop/api:1.4.0
  worker:
    <<: *defaults
    image: shop/worker:1.4.0
    restart: on-failure
EOF
python3 -c 'import yaml,json; print(json.dumps(yaml.safe_load(open("/home/student/services.yaml"))["services"], indent=1))'
```

```text review
Эталон: `x-defaults: &defaults` + `<<: *defaults` в сервисах.

- `&имя` — якорь, `*имя` — ссылка на то же значение, `<<:` — слить ключи словаря-якоря в текущий. Явные ключи сервиса важнее слитых.
- Слияние **неглубокое**: если у worker написать свой `environment:`, он заменит весь словарь, а не добавит переменную.
- `x-` — расширения Docker Compose: ключи верхнего уровня с этим префиксом Compose игнорирует. В GitLab CI те же якоря работают в `.gitlab-ci.yml`, но там удобнее `extends` и `!reference`.
- Якоря работают только внутри одного файла.
```

## Тест

### Чем задаётся вложенность в YAML?
- [ ] Фигурными скобками
- [x] Отступами из пробелов
- [ ] Табуляцией
- [ ] Точкой с запятой
> Табуляция в отступах запрещена.

### Какая запись — корректный список из двух строк?
- [x] `packages:` и на следующих строках с отступом `- nginx` и `- curl`
- [x] `packages: [nginx, curl]`
- [ ] `packages: nginx, curl` — это список
- [ ] `packages = [nginx, curl]`
> Без скобок `nginx, curl` — это одна строка.

### Что получится из version: 1.10 без кавычек?
- [ ] Строка "1.10"
- [x] Число 1.1 — ноль в конце потеряется
- [ ] Ошибка
- [ ] Версия 1.10
> Номера версий всегда берите в кавычки.

### Чем блок со знаком `|` отличается от блока со знаком `>`?
- [x] С `|` переводы строк сохраняются, с `>` строки склеиваются через пробел
- [ ] Ничем
- [ ] С > переводы строк сохраняются
- [ ] `|` используется только для чисел
> Для скриптов в CI нужен литеральный блок.

### Что делают &defaults и *defaults?
- [ ] Комментируют строки
- [x] `&` помечает узел якорем, `*` подставляет помеченный узел (алиас)
- [ ] Указывают тип данных
- [ ] Подключают другой файл
> Вместе с `<<:` позволяют сливать словари.

### Работают ли YAML-якоря между разными файлами?
- [ ] Да, всегда
- [x] Нет, только внутри файла, в котором определены
- [ ] Только в Kubernetes
- [ ] Только с ключом !include
> В GitLab CI для переиспользования между файлами есть extends и !reference.

### Что разделяет несколько документов в одном YAML-файле?
= ---
> Так хранят несколько манифестов Kubernetes в одном файле.

### Почему значение country: NO может стать false?
- [ ] Это опечатка
- [x] В YAML 1.1 слова yes, no, on, off считаются логическими значениями, и некоторые парсеры до сих пор так работают
- [ ] NO — зарезервированное слово Kubernetes
- [ ] Так задумано в YAML 1.2
> В YAML 1.2 логические — только true и false, но старые парсеры распространены.

### Что произойдёт, если в словаре дважды встретится один и тот же ключ?
- [ ] Значения объединятся в список
- [x] Многие парсеры молча возьмут последнее значение — это источник трудноуловимых ошибок
- [ ] Ключ будет удалён
- [ ] Всегда будет ошибка
> yamllint находит дубли ключей.

### Какой инструмент проверяет стиль и ошибки YAML-файлов?
= yamllint
> Для чтения и изменения YAML из командной строки — yq.

### Является ли корректный JSON корректным YAML 1.2?
- [x] Да, YAML 1.2 — надмножество JSON
- [ ] Нет
- [ ] Только без массивов
- [ ] Только в одну строку
> Поэтому flow-запись `{a: 1}` и `[1, 2]` выглядит как JSON.

### Что не так с записью image:nginx?
- [ ] Ничего
- [x] После двоеточия нет пробела, поэтому это строка "image:nginx", а не пара ключ-значение
- [ ] Нельзя использовать слово image
- [ ] Значение надо писать с заглавной буквы
> Пробел после двоеточия обязателен.
