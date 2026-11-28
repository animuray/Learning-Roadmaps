---
title: Python для автоматизации
slug: python-dlya-avtomatizacii
description: Python там, где Bash становится неудобным — разбор логов, работа с JSON и YAML, HTTP-проверки, вызов команд. venv и pip, argparse, pathlib, subprocess, requests, коды выхода и логирование.
duration: 180
level: Средний
quizSize: 10
materials:
  - title: Документация Python — учебник (на русском)
    url: https://docs.python.org/3/tutorial/index.html
    type: документация
  - title: Python Docs — argparse Tutorial
    url: https://docs.python.org/3/howto/argparse.html
    type: документация
  - title: Python Docs — subprocess
    url: https://docs.python.org/3/library/subprocess.html
    type: документация
  - title: Requests — Quickstart
    url: https://requests.readthedocs.io/en/latest/user/quickstart/
    type: документация
---

# Python для автоматизации

Bash хорош для коротких связок команд. Когда в скрипте появляются разбор JSON, словари, HTTP-запросы, повторные попытки и обработка ошибок — пора на Python. Он есть почти на любом Linux-сервере, на нём написаны Ansible, многие экспортеры и утилиты облаков.

## Когда Bash, а когда Python

| Bash | Python |
| --- | --- |
| запустить несколько команд подряд | разобрать JSON/YAML, сложить, отфильтровать |
| пайпы `grep | awk | sort` | словари, множества, сортировка по нескольким полям |
| обёртка для systemd, cron, CI | HTTP API, повторные попытки, тайм-ауты |
| до ~50 строк | больше 50 строк, функции, тесты |

## Окружение: venv и pip

```bash
python3 -m venv .venv          # изолированное окружение в каталоге проекта
. .venv/bin/activate           # активировать (deactivate — выйти)
pip install requests pyyaml    # зависимости ставятся в .venv, не в систему
pip freeze > requirements.txt  # зафиксировать версии
pip install -r requirements.txt
```

- В Ubuntu 24.04 `pip install` в системный Python запрещён (PEP 668, «externally-managed-environment») — и правильно: используйте venv или пакеты `python3-*` из apt.
- `.venv/` — в `.gitignore`, `requirements.txt` — в Git.
- Скрипт из venv без активации: `.venv/bin/python script.py`; в unit-файле systemd — полный путь к этому интерпретатору.

## Скелет скрипта

```python
#!/usr/bin/env python3
"""Что делает скрипт — одной строкой."""
import argparse
import logging
import sys

log = logging.getLogger(__name__)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("path", help="файл журнала")
    p.add_argument("--top", type=int, default=5, help="сколько строк вывести")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(levelname)s %(message)s", stream=sys.stderr)
    ...
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- **Код выхода**: `0` — успех, не ноль — ошибка. На него смотрят cron, systemd, CI, `set -e` в Bash. `sys.exit(1)` или исключение без обработки (код 1).
- **stdout — для данных, stderr — для сообщений**: вывод скрипта можно отправить в пайп, а ошибки останутся на экране.
- `argparse` сам делает `--help` и ругается на неверные аргументы (код 2).
- `if __name__ == "__main__"` — файл можно и запускать, и импортировать в тестах.

## Файлы и пути — pathlib

```python
from pathlib import Path

log_dir = Path("/var/log/app")
for f in sorted(log_dir.glob("*.log")):
    size = f.stat().st_size
    text = f.read_text(encoding="utf-8", errors="replace")
Path("out").mkdir(parents=True, exist_ok=True)
Path("out/report.txt").write_text("ok\n")
```

Большие файлы читают построчно, не целиком: `with open(path) as f: for line in f: ...`.

## Разбор текста

```python
import re
from collections import Counter

LINE = re.compile(r'^(\S+) \S+ \S+ \[[^\]]+\] "(\S+) (\S+) [^"]*" (\d{3})')
ips = Counter()
with open("access.log") as f:
    for line in f:
        m = LINE.match(line)
        if m:
            ip, method, path, status = m.groups()
            ips[ip] += 1
for ip, n in ips.most_common(5):
    print(n, ip)
```

`Counter`, `defaultdict`, `sorted(..., key=lambda x: (-x[1], x[0]))` — замена половины конвейеров из `sort | uniq -c | sort -rn`.

## JSON и YAML

```python
import json, yaml                       # yaml — пакет PyYAML

data = json.loads(text)                 # строка → объект; json.load(f) — из файла
print(json.dumps(data, ensure_ascii=False, indent=2))
cfg = yaml.safe_load(open("config.yml"))   # только safe_load: load умеет создавать объекты
```

Осторожно с YAML: ключ `on:` PyYAML читает как `True` (YAML 1.1), а `no` — как `False`.

## Внешние команды — subprocess

```python
import subprocess

r = subprocess.run(["systemctl", "is-active", "nginx"], capture_output=True, text=True)
print(r.returncode, r.stdout.strip())

subprocess.run(["rsync", "-a", src, dst], check=True)   # исключение, если код ≠ 0
```

- Передавайте **список** аргументов, а не строку с `shell=True`: иначе имя файла с пробелом или `; rm -rf` превращается в команду (shell injection).
- `check=True` — упасть при ошибке; `timeout=30` — не висеть вечно.

## HTTP — requests

```python
import requests

try:
    r = requests.get("http://127.0.0.1:8000/health", timeout=3)
    r.raise_for_status()                # исключение на 4xx/5xx
    print(r.json())
except requests.RequestException as e:
    print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(1)
```

- **Всегда `timeout`**: без него запрос к зависшему серверу ждёт бесконечно.
- Токены — из переменных окружения (`os.environ["API_TOKEN"]`), не в коде.
- Без внешних пакетов — `urllib.request` из стандартной библиотеки.

## Повторные попытки

```python
import time

for attempt in range(1, 6):
    try:
        return call()
    except requests.RequestException:
        if attempt == 5:
            raise
        time.sleep(2 ** attempt)        # экспоненциальная пауза: 2, 4, 8, 16 с
```

## Практика

- [ ] Создать venv для своих скриптов, поставить `requests` и `pyyaml`, зафиксировать `requirements.txt`
- [ ] Переписать на Python один свой Bash-скрипт, где есть разбор вывода или JSON
- [ ] Написать скрипт проверки сервисов своего проекта по HTTP с кодом выхода и запустить его по таймеру systemd
- [ ] Пройти задачи лаборатории

## Лаборатория

```bash lib
# lab_py пользователь-скрипт аргументы — запуск от имени ученика; вывод — в /tmp/lab-py.out и /tmp/lab-py.err
lab_py() { su - student -c "cd ~/py && python3 $*" > /tmp/lab-py.out 2> /tmp/lab-py.err; }
```

### Топ IP-адресов из журнала

Напишите скрипт **`~/py/top_ips.py`**, который читает журнал nginx (формат combined) и печатает самые частые IP-адреса клиентов:

- путь к журналу — обязательный аргумент;
- `--top N` — сколько адресов вывести (по умолчанию **5**);
- строки вывода — `число адрес` (например, `42 10.0.0.7`), по убыванию числа, при равенстве — по адресу как по строке;
- если файла нет — сообщение в **stderr** и **код выхода 1**, в stdout ничего.

Пример журнала — `~/py/access.log`.

```bash setup
mkdir -p /home/student/py
rm -f /home/student/py/top_ips.py
python3 - <<'EOF'
import random
random.seed(7)
ips = [f"10.0.{a}.{b}" for a in range(3) for b in range(1, 6)]
w = [random.randint(1, 30) for _ in ips]
with open("/home/student/py/access.log", "w") as f:
    for i in range(800):
        ip = random.choices(ips, w)[0]
        f.write(f'{ip} - - [28/Nov/2026:10:{i // 60 % 60:02d}:{i % 60:02d} +0300] "GET /api/items HTTP/1.1" 200 512 "-" "curl/8.5"\n')
EOF
chown -R student:student /home/student/py
```

```bash check
[ -f /home/student/py/top_ips.py ] || fail "Нет ~/py/top_ips.py"
python3 - > /tmp/lab-py.gen <<'EOF'
import random
random.seed(int(__import__("time").time()))
ips = [f"192.168.{a}.{b}" for a in range(2) for b in range(1, 9)] + ["10.9.9.9", "10.10.0.1"]
lines = []
for i in range(600):
    ip = random.choice(ips[:6]) if random.random() < 0.6 else random.choice(ips)
    lines.append(f'{ip} - - [28/Nov/2026:11:00:{i % 60:02d} +0300] "POST /login HTTP/1.1" 401 33 "-" "python-requests/2.31"')
lines += ['10.10.0.1 - - [28/Nov/2026:11:01:00 +0300] "GET / HTTP/1.1" 200 1 "-" "x"'] * 3
print("\n".join(lines))
EOF
cp /tmp/lab-py.gen /tmp/lab-py-access.log && chmod 644 /tmp/lab-py-access.log
ref() { python3 -c '
import sys, collections
c = collections.Counter(l.split(" ", 1)[0] for l in open(sys.argv[1]) if l.strip())
for ip, n in sorted(c.items(), key=lambda x: (-x[1], x[0]))[:int(sys.argv[2])]:
    print(n, ip)' /tmp/lab-py-access.log "$1"; }
lab_py top_ips.py /tmp/lab-py-access.log || fail "Скрипт завершился с ошибкой: $(tail -1 /tmp/lab-py.err | cut -c1-200)"
[ "$(cat /tmp/lab-py.out)" = "$(ref 5)" ] || fail "Вывод без --top не совпадает с ожидаемым. Получено: $(head -3 /tmp/lab-py.out | tr '\n' ';')"
lab_py top_ips.py /tmp/lab-py-access.log --top 12 || fail "С --top 12 скрипт завершился с ошибкой: $(tail -1 /tmp/lab-py.err | cut -c1-200)"
[ "$(cat /tmp/lab-py.out)" = "$(ref 12)" ] || fail "Вывод с --top 12 не совпадает с ожидаемым (строк: $(wc -l < /tmp/lab-py.out))"
lab_py top_ips.py /tmp/lab-py-nope.log; rc=$?
[ $rc = 1 ] || fail "Для несуществующего файла код выхода $rc"
[ -s /tmp/lab-py.err ] || fail "Для несуществующего файла в stderr пусто"
[ -s /tmp/lab-py.out ] && fail "Для несуществующего файла скрипт что-то печатает в stdout"
rm -f /tmp/lab-py-access.log /tmp/lab-py.gen
ok "top_ips.py считает верно, --top работает, ошибки — в stderr с кодом 1"
```

```text hint
1. Разобрать аргументы стандартным модулем: обязательный позиционный путь и необязательное целое число с значением по умолчанию.
2. Открыть файл и идти по строкам: адрес клиента — первое поле строки до пробела. Считать вхождения счётчиком из модуля коллекций.
3. Отсортировать пары по двум ключам: по убыванию числа и по адресу; взять первые N и напечатать.
4. Отсутствие файла — перехватить исключение открытия, написать сообщение в поток ошибок и вернуть код 1.
```

```bash solution
cat > ~/py/top_ips.py <<'EOF'
#!/usr/bin/env python3
"""Самые частые IP-адреса клиентов в журнале nginx."""
import argparse
import sys
from collections import Counter


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("path", help="журнал nginx (combined)")
    p.add_argument("--top", type=int, default=5, help="сколько адресов вывести")
    args = p.parse_args()

    counts = Counter()
    try:
        with open(args.path, encoding="utf-8", errors="replace") as f:
            for line in f:
                ip = line.split(" ", 1)[0].strip()
                if ip:
                    counts[ip] += 1
    except OSError as e:
        print(f"не удалось прочитать {args.path}: {e.strerror}", file=sys.stderr)
        return 1

    for ip, n in sorted(counts.items(), key=lambda x: (-x[1], x[0]))[: args.top]:
        print(n, ip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
EOF
chmod +x ~/py/top_ips.py
cd ~/py && ./top_ips.py access.log && ./top_ips.py nope.log; echo "код: $?"
```

```text review
Эталон — в «Решении»: `argparse` + `Counter` + `sorted` по двум ключам + `OSError` → stderr и код 1.

- `Counter.most_common(n)` не задаёт порядок при равных числах — для воспроизводимого вывода сортируйте явно по `(-число, адрес)`.
- Обработка `OSError` (а не только `FileNotFoundError`) ловит и «нет прав», и «это каталог».
- Вывод данных — в stdout, сообщений — в stderr: `./top_ips.py access.log | head -3` работает, а ошибка не смешается с данными.
- Тот же результат на Bash: `cut -d' ' -f1 access.log | sort | uniq -c | sort -k1,1rn -k2 | head -5`. Для одной операции это проще; когда нужны фильтры по времени, статусам и JSON-вывод, Python выигрывает.
```

### Проверка сервисов по списку

Напишите скрипт **`~/py/healthcheck.py`**, который проверяет HTTP-сервисы из YAML-файла:

```yaml
services:
  - name: api
    url: http://127.0.0.1:8176/health
  - name: admin
    url: http://127.0.0.1:8177/
```

- путь к YAML — аргумент `--config` (по умолчанию `services.yml` в текущем каталоге);
- для каждого сервиса — одна строка: `имя OK код` (ответ 2xx) или `имя FAIL причина` (другой код ответа — `FAIL 500`; нет соединения или тайм-аут — `FAIL` и текст ошибки);
- тайм-аут запроса — **2 секунды**;
- код выхода — **0**, если все сервисы OK, иначе **1**.

```bash setup
mkdir -p /home/student/py
rm -f /home/student/py/healthcheck.py
printf 'services:\n  - name: api\n    url: http://127.0.0.1:8176/health\n' > /home/student/py/services.yml
chown -R student:student /home/student/py
for u in lab-hc-ok lab-hc-err lab-hc-slow; do systemctl stop $u 2>/dev/null; systemctl reset-failed $u 2>/dev/null; done
cat > /opt/lab-hc.py <<'EOF'
import sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
port, code, delay = int(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3])
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        time.sleep(delay)
        self.send_response(code); self.end_headers(); self.wfile.write(b"ok\n" if code < 400 else b"error\n")
    def log_message(self, *a): pass
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
EOF
systemd-run -q --unit=lab-hc-ok python3 /opt/lab-hc.py 8176 200 0
systemd-run -q --unit=lab-hc-err python3 /opt/lab-hc.py 8177 500 0
systemd-run -q --unit=lab-hc-slow python3 /opt/lab-hc.py 8178 200 10
```

```bash check
[ -f /home/student/py/healthcheck.py ] || fail "Нет ~/py/healthcheck.py"
for u in lab-hc-ok lab-hc-err lab-hc-slow; do [ "$(systemctl is-active $u)" = active ] || fail "Тестовый сервис $u не работает — нажмите «Начать задачу» заново"; done
c=/tmp/lab-hc-all.yml
printf 'services:\n  - name: api\n    url: http://127.0.0.1:8176/health\n  - name: admin\n    url: http://127.0.0.1:8177/\n  - name: reports\n    url: http://127.0.0.1:8178/\n  - name: legacy\n    url: http://127.0.0.1:8179/\n' > $c
chmod 644 $c
s=$(date +%s)
lab_py healthcheck.py --config $c; rc=$?
dt=$(( $(date +%s) - s ))
out=$(cat /tmp/lab-py.out)
[ $rc = 1 ] || fail "При упавших сервисах код выхода $rc"
echo "$out" | grep -qE '^api OK 200$' || fail "Нет строки «api OK 200». Вывод: $(echo "$out" | tr '\n' ';' | cut -c1-200)"
echo "$out" | grep -qE '^admin FAIL 500$' || fail "Нет строки «admin FAIL 500». Вывод: $(echo "$out" | tr '\n' ';' | cut -c1-200)"
echo "$out" | grep -qE '^reports FAIL' || fail "Сервис reports отвечает 10 секунд — должен быть FAIL по тайм-ауту"
echo "$out" | grep -qE '^legacy FAIL' || fail "Сервис legacy недоступен — должна быть строка legacy FAIL"
[ "$(echo "$out" | grep -c .)" = 4 ] || fail "Ожидалось 4 строки вывода, получено $(echo "$out" | grep -c .)"
[ $dt -le 8 ] || fail "Проверка заняла $dt с — тайм-аут запроса больше 2 секунд"
printf 'services:\n  - name: api\n    url: http://127.0.0.1:8176/health\n' > $c
lab_py healthcheck.py --config $c || fail "Когда все сервисы OK, код выхода не 0"
[ "$(cat /tmp/lab-py.out)" = "api OK 200" ] || fail "Для одного рабочего сервиса вывод: $(cat /tmp/lab-py.out | tr '\n' ';')"
lab_py healthcheck.py || fail "Без --config (файл services.yml в ~/py) скрипт завершился с ошибкой"
rm -f $c
ok "healthcheck.py: OK/FAIL по каждому сервису, тайм-аут 2 с, код выхода 0/1"
```

```text hint
1. Прочитать YAML безопасной функцией загрузки и пройти по списку сервисов.
2. Для каждого — HTTP-запрос с ограничением времени. Отдельно обработать: ответ получен (смотреть код), ответа нет (исключение библиотеки запросов).
3. Запоминать, был ли хоть один провал, и в конце вернуть соответствующий код выхода.
```

```bash solution
cat > ~/py/healthcheck.py <<'EOF'
#!/usr/bin/env python3
"""Проверка HTTP-сервисов из YAML-файла."""
import argparse
import sys

import requests
import yaml


def check(url: str) -> tuple[bool, str]:
    try:
        r = requests.get(url, timeout=2)
    except requests.RequestException as e:
        return False, type(e).__name__
    return r.ok, str(r.status_code)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--config", default="services.yml")
    args = p.parse_args()
    with open(args.config, encoding="utf-8") as f:
        services = yaml.safe_load(f)["services"]

    failed = False
    for s in services:
        ok, detail = check(s["url"])
        print(s["name"], "OK" if ok else "FAIL", detail, flush=True)
        failed |= not ok
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
EOF
chmod +x ~/py/healthcheck.py
cd ~/py && ./healthcheck.py; echo "код: $?"
```

```text review
Эталон — в «Решении»: `yaml.safe_load` → `requests.get(url, timeout=2)` → код выхода по итогам.

- `timeout` обязателен: без него сервис из задачи «отвечает» 10 секунд, а зависший — вечно, и проверка по таймеру копится сотнями процессов.
- `r.ok` — истина для кодов < 400; если нужны строго 2xx — `200 <= r.status_code < 300`.
- Разные исключения `requests` (`ConnectionError`, `Timeout`) дают понятную причину; ловить голое `except:` — значит спрятать и ошибки в самом скрипте.
- Сервисы проверяют последовательно — 20 сервисов по 2 с тайм-аута = 40 с. Для больших списков — `concurrent.futures.ThreadPoolExecutor`.
- Такой скрипт запускают по таймеру systemd или в CI после деплоя (smoke test); для постоянного мониторинга — blackbox_exporter в Prometheus.
```

```text notes
shell\s*=\s*True => В скрипте использовался shell=True — команду лучше передавать списком аргументов.
```

## Тест

### Когда для задачи лучше взять Python, а не Bash?
- [ ] Чтобы перезапустить службу
- [x] Когда нужно разбирать JSON/YAML, работать с HTTP API, повторными попытками и структурами данных
- [ ] Когда скрипт короче 10 строк
- [ ] Python всегда лучше Bash
> Bash — для связки команд; сложная логика и данные — Python.

### Зачем создавать venv для скриптов?
- [ ] Чтобы скрипты работали быстрее
- [x] Чтобы зависимости ставились изолированно в проект, не ломая системный Python и пакеты ОС
- [ ] Без venv Python не запускается
- [ ] Чтобы скрыть код
> В Ubuntu 24.04 pip в системный Python и вовсе запрещён (PEP 668).

### Как создать виртуальное окружение в каталоге .venv?
= python3 -m venv .venv
> Затем `. .venv/bin/activate` или запуск через `.venv/bin/python`.

### Как зафиксировать установленные версии зависимостей в файл?
= pip freeze > requirements.txt
> Потом окружение воспроизводится командой `pip install -r requirements.txt`.

### Скрипт завершился ошибкой. Какой код выхода он должен вернуть?
- [ ] 0
- [x] Любой ненулевой (обычно 1)
- [ ] 255 всегда
- [ ] Код выхода не важен
> На код выхода смотрят cron, systemd, CI и `set -e`.

### Куда скрипт должен писать сообщения об ошибках?
- [ ] В stdout вместе с данными
- [x] В stderr
- [ ] В /dev/null
- [ ] Только в файл
> Тогда вывод можно передать в пайп, а ошибки не смешаются с данными.

### Чем опасно subprocess.run(f"rm -rf {path}", shell=True)?
- [ ] Ничем
- [x] Значение path с пробелами или «; …» станет частью команды оболочки — shell injection
- [ ] Это медленно
- [ ] subprocess не умеет rm
> Передавайте список аргументов: `subprocess.run(["rm", "-rf", path])`.

### Что делает check=True в subprocess.run?
- [ ] Проверяет синтаксис команды
- [x] Бросает исключение, если команда завершилась с ненулевым кодом
- [ ] Запускает команду дважды
- [ ] Включает вывод в stdout
> Без него ошибка команды молча игнорируется.

### Почему в requests.get всегда указывают timeout?
- [ ] Иначе запрос не отправится
- [x] Без тайм-аута запрос к зависшему серверу может ждать бесконечно
- [ ] Это ускоряет ответ
- [ ] Чтобы обойти кэш
> По умолчанию requests ждёт без ограничения.

### Какой функцией безопасно читать YAML в PyYAML?
= yaml.safe_load
= safe_load
> `yaml.load` без безопасного загрузчика может создавать произвольные объекты Python.

### PyYAML прочитал workflow-файл, и ключа "on" в словаре нет. Почему?
- [ ] Файл пустой
- [x] По правилам YAML 1.1 on читается как булево True — ключом стал True
- [ ] PyYAML удаляет неизвестные ключи
- [ ] on — зарезервированное слово Python
> То же с `yes`, `no`, `off`. В YAML 1.2 и в ruamel.yaml этого нет.

### Как сосчитать самые частые элементы списка в Python проще всего?
- [ ] Вложенными циклами
- [x] collections.Counter и most_common
- [ ] json.dumps
- [ ] re.findall
> `Counter(ips).most_common(5)` — аналог `sort | uniq -c | sort -rn | head -5`.

### Зачем в скрипте конструкция if __name__ == "__main__":?
- [ ] Чтобы ускорить запуск
- [x] Код запускается только при прямом вызове файла, а при импорте (например, в тестах) — нет
- [ ] Без неё Python не найдёт main
- [ ] Это обязательный заголовок
> Так функции скрипта можно импортировать и тестировать.

### Как без активации запустить скрипт интерпретатором из venv (например, в unit-файле)?
- [ ] python3 script.py
- [x] /путь/к/проекту/.venv/bin/python script.py
- [ ] source .venv && python
- [ ] pip run script.py
> Интерпретатор из venv сам видит пакеты окружения.
