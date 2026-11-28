---
title: HTTP и HTTPS
slug: http-i-https
description: Устройство HTTP-запроса и ответа, методы, коды ответов, важные заголовки, версии HTTP и работа с curl.
duration: 75
level: Основы
quizSize: 10
materials:
  - title: MDN — HTTP (на русском)
    url: https://developer.mozilla.org/ru/docs/Web/HTTP
    type: документация
  - title: MDN — Заголовки HTTP (на русском)
    url: https://developer.mozilla.org/ru/docs/Web/HTTP/Headers
    type: документация
  - title: MDN — A typical HTTP session
    url: https://developer.mozilla.org/docs/Web/HTTP/Session
    type: документация
---

# HTTP и HTTPS

**HTTP** — протокол прикладного уровня, по которому работают сайты, API, вебхуки, Docker Registry, Kubernetes API, Prometheus. **HTTPS** — тот же HTTP, но внутри зашифрованного TLS-соединения.

## Запрос и ответ

HTTP — текстовый протокол «запрос → ответ» без сохранения состояния между запросами (состояние передают cookies и токены).

```
GET /api/items?limit=10 HTTP/1.1          ← строка запроса: метод, путь, версия
Host: api.example.com                     ← заголовки
User-Agent: curl/8.5.0
Accept: application/json
Authorization: Bearer eyJhbGci...
                                          ← пустая строка
                                          ← тело (у GET обычно нет)
```

```
HTTP/1.1 200 OK                           ← строка статуса
Content-Type: application/json
Content-Length: 27
Cache-Control: no-cache

[{"id":1,"title":"Купить"}]               ← тело
```

## Методы

| Метод | Назначение | Безопасный | Идемпотентный |
| --- | --- | --- | --- |
| **GET** | Получить ресурс | Да | Да |
| **POST** | Создать ресурс, выполнить действие | Нет | Нет |
| **PUT** | Заменить ресурс целиком | Нет | Да |
| **PATCH** | Изменить часть ресурса | Нет | Нет (обычно) |
| **DELETE** | Удалить | Нет | Да |
| HEAD | Как GET, но только заголовки | Да | Да |
| OPTIONS | Какие методы разрешены (используется в CORS) | Да | Да |

**Идемпотентный** — повторный запрос даёт тот же результат, что и одиночный. Поэтому GET, PUT и DELETE можно безопасно повторять при ошибках сети, а POST — нет.

## Коды ответов

| Класс | Значение | Главные коды |
| --- | --- | --- |
| **1xx** | Информационные | 101 Switching Protocols (WebSocket) |
| **2xx** | Успех | 200 OK, 201 Created, 204 No Content |
| **3xx** | Перенаправление | 301 Moved Permanently, 302 Found, 304 Not Modified, 307/308 — редирект с сохранением метода |
| **4xx** | Ошибка клиента | 400 Bad Request, 401 Unauthorized (не аутентифицирован), 403 Forbidden (нет прав), 404 Not Found, 405 Method Not Allowed, 409 Conflict, 413 Payload Too Large, 429 Too Many Requests |
| **5xx** | Ошибка сервера | 500 Internal Server Error, **502 Bad Gateway**, **503 Service Unavailable**, **504 Gateway Timeout** |

Коды 502, 503 и 504 DevOps видит чаще всего: их возвращает **прокси** (nginx, балансировщик, Ingress):

- **502** — прокси не смог получить корректный ответ от бэкенда: бэкенд упал, порт не слушается, соединение оборвалось;
- **503** — сервис временно недоступен: нет живых бэкендов, перегрузка, режим обслуживания;
- **504** — бэкенд не ответил за отведённое прокси время (таймаут).

## Важные заголовки

| Заголовок | Зачем |
| --- | --- |
| `Host` | Какой сайт нужен: на одном IP может быть много сайтов (виртуальные хосты) |
| `Content-Type` / `Accept` | Формат тела и что клиент готов принять |
| `Authorization` | Токен или учётные данные |
| `Cookie` / `Set-Cookie` | Сессии |
| `Cache-Control`, `ETag` | Кэширование |
| `Location` | Куда перенаправить (при 3xx) |
| `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP` | Настоящий IP клиента и протокол, которые проставляет прокси перед бэкендом |
| `Strict-Transport-Security` | Требование всегда ходить на сайт по HTTPS (HSTS) |

## Версии HTTP

- **HTTP/1.1** — текст, keep-alive соединения, один запрос за раз в соединении.
- **HTTP/2** — бинарный, мультиплексирование многих запросов в одном TCP-соединении, сжатие заголовков. Используется gRPC.
- **HTTP/3** — поверх QUIC (UDP), быстрее устанавливает соединение и лучше переносит потери.

## HTTPS

HTTPS = HTTP поверх **TLS**. TLS шифрует трафик, проверяет подлинность сервера по сертификату и защищает данные от подмены. Порт по умолчанию **443**. Подробно — в следующей теме.

## curl — швейцарский нож

```bash
curl https://example.com                     # тело ответа
curl -I https://example.com                  # только заголовки (HEAD)
curl -v https://example.com                  # всё: DNS, TCP, TLS, заголовки запроса и ответа
curl -L http://example.com                   # следовать редиректам
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" https://example.com   # код и время
curl -X POST -H "Content-Type: application/json" -d '{"title":"test"}' http://localhost:8000/api/items
curl -H "Host: site.local" http://10.0.0.5/  # запрос к IP с нужным Host — проверка виртуального хоста
curl --resolve example.com:443:10.0.0.5 https://example.com   # подставить IP для домена (с проверкой TLS)
curl -k https://self-signed.local            # не проверять сертификат — только для тестов!
curl -u user:pass https://api.example.com    # базовая аутентификация
```

## Практика

- [ ] Выполнить `curl -v https://example.com` и разметить вывод: DNS, TCP, TLS, запрос, ответ
- [ ] Получить код ответа и время запроса к своему приложению через `-w`
- [ ] Отправить POST с JSON в API своего приложения из практики Linux
- [ ] Остановить бэкенд за прокси (когда настроите nginx) и посмотреть, какой код вернёт прокси
- [ ] В браузере открыть инструменты разработчика → Network и посмотреть заголовки запросов к любому сайту

## Лаборатория

На стенде работает API приложения на `http://127.0.0.1:8095`.

```bash setup
systemctl stop lab-http-api 2>/dev/null; systemctl reset-failed lab-http-api 2>/dev/null
ver="2.$((RANDOM % 9)).$((RANDOM % 20))"
tok=$(tr -dc a-zA-Z0-9 </dev/urandom | head -c 24)
echo "$ver" > /var/lib/lab/api-version
echo "$tok" > /var/lib/lab/api-token
echo "$tok" > /home/student/api-token.txt && chown student:student /home/student/api-token.txt
: > /var/lib/lab/api-notes.log
cat > /opt/lab-http-api.py <<'EOF'
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
VER = open("/var/lib/lab/api-version").read().strip()
TOK = open("/var/lib/lab/api-token").read().strip()
class H(BaseHTTPRequestHandler):
    def send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype); self.send_header("X-App-Version", VER); self.end_headers()
        self.wfile.write(body.encode())
    def do_GET(self):
        if self.path == "/api/health": return self.send(503, '{"status": "degraded", "reason": "cache unavailable"}')
        self.send(404, '{"error": "not found"}')
    def do_POST(self):
        if self.path != "/api/notes": return self.send(404, '{"error": "not found"}')
        if self.headers.get("Authorization") != f"Bearer {TOK}": return self.send(401, '{"error": "need Authorization: Bearer <token>"}')
        if "json" not in (self.headers.get("Content-Type") or ""): return self.send(415, '{"error": "Content-Type must be application/json"}')
        try: data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        except Exception: return self.send(400, '{"error": "invalid JSON"}')
        if not isinstance(data, dict) or not data.get("title"): return self.send(400, '{"error": "field title is required"}')
        open("/var/lib/lab/api-notes.log", "a").write(data["title"] + "\n")
        self.send(201, json.dumps({"id": 1, "title": data["title"]}))
HTTPServer(("127.0.0.1", 8095), H).serve_forever()
EOF
systemd-run -q --unit=lab-http-api python3 /opt/lab-http-api.py
for i in $(seq 40); do ss -ltnH 'sport = :8095' | grep -q . && break; sleep 0.25; done
```

### Код ответа и заголовок

Мониторинг сообщает, что API нездоров. Узнайте, какой **код ответа** возвращает `http://127.0.0.1:8095/api/health` и какая версия приложения указана в заголовке ответа **`X-App-Version`**. Запишите в `~/health.txt` одну строку: `код версия` (например, `200 1.0.0`).

```bash setup
rm -f /home/student/health.txt
```

```bash check
want="503 $(cat /var/lib/lab/api-version)"
[ -f /home/student/health.txt ] || fail "Нет ~/health.txt"
got=$(tr -s ' \t' ' ' < /home/student/health.txt | head -1 | sed 's/^ //; s/ $//')
[ "$got" = "$want" ] || fail "В ~/health.txt «$got» — код или версия не совпадают с ответом API"
ok "/api/health → $want"
```

```text hint
1. curl по умолчанию показывает только тело ответа. Есть ключи «показать заголовки ответа» и «подробный вывод» — в нём видна и строка статуса.
2. Ещё у curl есть ключ формата вывода: в нём можно попросить только код ответа.
```

```bash solution
curl -si http://127.0.0.1:8095/api/health
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8095/api/health)
ver=$(curl -s -D - -o /dev/null http://127.0.0.1:8095/api/health | awk -F': ' 'tolower($1) == "x-app-version" {print $2}' | tr -d '\r')
echo "$code $ver" > ~/health.txt
```

```text review
Эталон: `curl -i` (заголовки + тело) или `curl -v`; код — `curl -s -o /dev/null -w '%{http_code}'`.

- 2xx — успех, 3xx — перенаправление, 4xx — ошибка клиента (401 — нет авторизации, 403 — нельзя, 404 — нет такого), 5xx — ошибка сервера (500 — упало, 502/504 — прокси не достучался до бэкенда, 503 — сервис временно недоступен).
- `-w` в curl — готовый мини-мониторинг: `-w '%{http_code} %{time_total}s\n'`, а ещё `time_connect`, `time_starttransfer` — где именно тормозит запрос.
- Health-check с 503 при деградации — правильная практика: балансировщик и Kubernetes уберут такой экземпляр из ротации.
```

### Создать запись через API

Создайте через API заметку с заголовком **`devops`**: запрос `POST http://127.0.0.1:8095/api/notes` с JSON-телом `{"title": "devops"}`. API требует токен в заголовке авторизации — он лежит в `~/api-token.txt`. Если API отказывает, читайте его ответ: он объясняет, чего не хватает.

```bash setup
: > /var/lib/lab/api-notes.log
```

```bash check
grep -qx devops /var/lib/lab/api-notes.log || fail "Заметки devops в API нет"
ok "заметка создана"
```

```text hint
1. Метод запроса, заголовки и тело задаются ключами curl. Тело должно быть JSON, и сервер должен знать, что это JSON, — по заголовку типа содержимого.
2. Авторизация — заголовок со схемой Bearer и токеном. Токен можно подставить из файла через $(...).
3. Смотрите код и тело ответа: 401, 415 и 400 означают разные проблемы.
```

```bash solution
curl -s -X POST http://127.0.0.1:8095/api/notes \
  -H "Authorization: Bearer $(cat ~/api-token.txt)" \
  -H 'Content-Type: application/json' \
  -d '{"title": "devops"}'
```

```text review
Эталон: `curl -X POST -H "Authorization: Bearer ..." -H 'Content-Type: application/json' -d '{"title": "devops"}' URL`.

- `-d` сам делает запрос POST, но с `Content-Type: application/x-www-form-urlencoded` — API, ждущее JSON, ответит 415 или 400. В новых curl есть `--json '{"title":"devops"}'` — ставит оба заголовка.
- 401 — не представились (нет токена или он неверный), 403 — представились, но нельзя.
- Токен в командной строке попадает в историю оболочки. В скриптах его читают из файла или переменной окружения, как здесь.
- Для API удобны `jq` (разбор ответа: `curl ... | jq .id`) и `-f` (вернуть ненулевой код при 4xx/5xx — для скриптов и CI).
```

## Тест

### Какой метод HTTP используют для получения ресурса без изменений?
= GET
> GET безопасный и идемпотентный.

### Чем PUT отличается от POST?
- [ ] Ничем
- [x] PUT идемпотентен — повторный запрос даёт тот же результат; POST обычно создаёт новый ресурс при каждом вызове
- [ ] PUT используется только для удаления
- [ ] POST нельзя использовать в API
> Поэтому POST нельзя бездумно повторять при сетевых ошибках.

### Что означает класс кодов 4xx?
- [ ] Успешный ответ
- [x] Ошибку на стороне клиента: неверный запрос, нет прав, ресурс не найден
- [ ] Ошибку на стороне сервера
- [ ] Перенаправление
> 5xx — ошибки сервера, 3xx — перенаправления.

### Чем 401 отличается от 403?
- [x] 401 — клиент не аутентифицирован (нет или неверные учётные данные)
- [x] 403 — клиент известен, но у него нет прав на ресурс
- [ ] 401 — ресурс не найден
- [ ] 403 — сервер перегружен
> Not Found — это 404.

### Nginx возвращает 502 Bad Gateway. Что это обычно значит?
- [ ] Неверный пароль пользователя
- [x] Прокси не получил корректного ответа от бэкенда: приложение упало, не слушает порт или оборвало соединение
- [ ] Неправильный DNS у клиента
- [ ] Сертификат истёк
> Проверяйте бэкенд: статус службы, `ss -tulpn`, логи приложения и error.log nginx.

### Что означает 504 Gateway Timeout?
- [ ] Бэкенда не существует
- [x] Бэкенд не ответил прокси за отведённое время
- [ ] Клиент слишком долго отправлял запрос
- [ ] Неверный метод
> Смотрите, почему бэкенд отвечает медленно, и таймауты прокси.

### Зачем нужен заголовок Host?
- [ ] Чтобы указать IP клиента
- [x] Чтобы сервер знал, какой из сайтов на одном IP-адресе нужен клиенту
- [ ] Чтобы указать версию HTTP
- [ ] Для авторизации
> На этом основаны виртуальные хосты (server_name в nginx).

### Как с помощью curl посмотреть только заголовки ответа?
= curl -I https://example.com
= curl -I
> `-v` покажет всё взаимодействие, включая TLS.

### Как в curl следовать редиректам 301 и 302?
- [ ] curl -r
- [x] curl -L
- [ ] curl -f
- [ ] curl -k
> `-k` отключает проверку сертификата — только для тестов.

### Зачем прокси добавляет заголовок X-Forwarded-For?
- [ ] Для ускорения запроса
- [x] Чтобы бэкенд узнал настоящий IP клиента: сам бэкенд видит IP прокси
- [ ] Для шифрования
- [ ] Чтобы указать сайт назначения
> Аналогично X-Forwarded-Proto передаёт исходный протокол (http или https).

### Какое главное нововведение HTTP/2 по сравнению с HTTP/1.1?
- [ ] Переход на UDP
- [x] Мультиплексирование: много запросов параллельно в одном соединении, бинарный формат, сжатие заголовков
- [ ] Отказ от заголовков
- [ ] Обязательный пароль
> HTTP/3 переходит на QUIC поверх UDP.

### Как с помощью curl отправить запрос на IP-адрес сервера, но для нужного домена, чтобы проверить виртуальный хост?
- [x] curl -H "Host: site.local" http://10.0.0.5/
- [x] curl --resolve site.local:80:10.0.0.5 http://site.local/
- [ ] curl -k 10.0.0.5
- [ ] curl -L site.local@10.0.0.5
> Для HTTPS удобнее `--resolve`: тогда TLS проверит сертификат для правильного имени.
