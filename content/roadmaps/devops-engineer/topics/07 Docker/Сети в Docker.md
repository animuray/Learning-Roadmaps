---
title: Сети в Docker
slug: seti-v-docker
description: Сетевые драйверы bridge, host, none, overlay, macvlan; пользовательские сети и DNS по имени контейнера; публикация портов; iptables и обход ufw; диагностика.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: Docker Docs — Networking overview
    url: https://docs.docker.com/engine/network/
    type: документация
  - title: Docker Docs — Network drivers
    url: https://docs.docker.com/engine/network/drivers/
    type: документация
  - title: Ubuntu Server — Docker storage, networking and logging
    url: https://ubuntu.com/server/docs/explanation/virtualisation/docker-storage-networking-and-logging/
    type: документация
---

# Сети в Docker

## Драйверы сетей

| Драйвер | Как работает | Когда |
| --- | --- | --- |
| **bridge** | Виртуальный мост на хосте (`docker0` или свой), у контейнера своя сеть и IP, наружу через NAT | По умолчанию, один хост |
| **host** | Контейнер использует сетевой стек хоста напрямую, без изоляции и NAT | Максимальная производительность сети, много портов. `-p` игнорируется |
| **none** | Только loopback | Изолированные задачи без сети |
| **overlay** | Виртуальная сеть поверх нескольких хостов (VXLAN) | Docker Swarm, связь контейнеров на разных машинах |
| **macvlan** | У контейнера свой MAC-адрес, он выглядит как отдельное устройство в физической сети | Легаси-приложения, которым нужен «настоящий» IP в LAN |
| ipvlan | Как macvlan, но с общим MAC | Когда коммутатор ограничивает число MAC |

```bash
docker network ls
docker network inspect bridge
docker network create appnet
docker run -d --name db --network appnet postgres:16
docker network connect appnet web          # подключить работающий контейнер ко второй сети
```

## Как устроен bridge

```
           хост
  ┌───────────────────────────────────────┐
  │  eth0 (192.168.1.10) ◄── NAT (iptables)│
  │        │                               │
  │   docker0 / br-xxxx (172.18.0.1)       │
  │     ├── veth ─► web (172.18.0.2)       │
  │     └── veth ─► db  (172.18.0.3)       │
  └───────────────────────────────────────┘
```

Каждый контейнер получает пару **veth**: один конец — `eth0` внутри контейнера (в его сетевом namespace), другой подключён к мосту на хосте. Выход наружу — через MASQUERADE в iptables.

## Стандартный bridge и пользовательская сеть

| | Стандартный `bridge` | Своя сеть `docker network create` |
| --- | --- | --- |
| DNS по имени контейнера | **Нет** (только по IP) | **Да** — встроенный DNS 127.0.0.11 |
| Изоляция | Все контейнеры в одной сети | Только те, кого подключили |
| Подключение на лету | Нет | `docker network connect/disconnect` |

Поэтому всегда создавайте свою сеть (Compose делает это автоматически): приложение подключается к базе по адресу `db:5432`, а не по IP, который меняется при пересоздании.

## Публикация портов

```bash
docker run -p 8080:80 nginx              # все интерфейсы хоста, порт 8080 → 80
docker run -p 127.0.0.1:8080:80 nginx    # только localhost
docker run -p 8080:80/udp ...            # UDP
docker run -P nginx                      # все EXPOSE-порты на случайные порты хоста
docker port web
```

- Контейнеры **в одной сети** общаются напрямую по внутренним портам — публиковать порт базы наружу для приложения **не нужно**.
- Публикуйте только то, что должно быть доступно снаружи (обычно — только nginx/ingress на 80/443).

> [!warning] Docker и ufw
> Docker добавляет свои правила в iptables (цепочки `DOCKER`, `DOCKER-USER`) раньше правил ufw. Порт, опубликованный через `-p 5432:5432`, будет доступен из интернета, **даже если ufw его запрещает**. Решения: публиковать на `127.0.0.1`, не публиковать вовсе (общение через сеть Docker), правила в цепочке `DOCKER-USER` или внешний файрвол облака.

## Особые режимы

```bash
docker run --network host nginx                    # слушает прямо на портах хоста
docker run --network container:web nicolaka/netshoot   # разделить сетевой namespace с контейнером web
```

`--network container:имя` — тот же принцип, что у пода в Kubernetes: несколько контейнеров с одним IP и общим `localhost`.

## Диагностика

```bash
docker exec web cat /etc/resolv.conf                # nameserver 127.0.0.11 в пользовательской сети
docker exec web getent hosts db                     # резолвится ли имя
docker run --rm -it --network appnet nicolaka/netshoot   # контейнер с curl, dig, tcpdump, ss, ip
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' web
sudo iptables -t nat -L DOCKER -n                   # правила проброса портов
```

Типичные проблемы:

- приложение слушает `127.0.0.1` **внутри** контейнера — снаружи порт не работает. Нужно слушать `0.0.0.0`;
- контейнеры в разных сетях не видят друг друга;
- в стандартной сети `bridge` не работает обращение по имени;
- подсеть Docker (`172.17.0.0/16`) пересеклась с корпоративной сетью или VPN — меняют через `default-address-pools` в `/etc/docker/daemon.json`.

## Практика

- [ ] Запустить два контейнера в стандартном bridge и убедиться, что по имени они друг друга не видят, а по IP — видят
- [ ] Создать свою сеть, запустить в ней приложение и PostgreSQL, подключиться к базе по имени `db`
- [ ] Запустить nginx с `--network host` и найти его порт в `ss -tlnp` на хосте
- [ ] Опубликовать порт с ufw, запрещающим этот порт, и проверить доступ с другой машины; затем исправить через `127.0.0.1:`
- [ ] Запустить `nicolaka/netshoot` в сети приложения и проверить DNS, порты и маршруты
- [ ] Найти veth-интерфейсы контейнеров на хосте: `ip link` и `bridge link`

## Лаборатория

```bash setup
lab_drm() { docker rm -f "$@" >/dev/null 2>&1; true; }
# образ есть локально или скачивается (если ученик почистил образы через prune)
lab_img() { for i in "$@"; do docker image inspect "$i" >/dev/null 2>&1 || docker pull -q "$i" >/dev/null; done; }
# lab_wait_http URL [строка] — дождаться ответа
lab_wait_http() { for i in $(seq 60); do curl -s --max-time 1 "$1" 2>/dev/null | grep -q "${2:-.}" && return 0; sleep 0.25; done; return 1; }
lab_img redis:7-alpine alpine:3.20 nginx:1.27-alpine
```

### Связь контейнеров по имени

Создайте сеть Docker **`appnet`** и запустите в ней два контейнера: **`db`** (образ `redis:7-alpine`) и **`app`** (образ `alpine:3.20`, команда `sleep 100000`). Контейнер `app` должен обращаться к Redis **по имени** `db` на порту 6379.

```bash setup
lab_drm db app
docker network rm appnet >/dev/null 2>&1; true
```

```bash check
docker network inspect appnet >/dev/null 2>&1 || fail "Сети appnet нет"
for c in db app; do
  [ "$(docker inspect -f '{{.State.Running}}' $c 2>/dev/null)" = true ] || fail "Контейнер $c не запущен"
  docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' $c | grep -qw appnet || fail "Контейнер $c не подключён к сети appnet"
done
docker exec app nc -z -w 2 db 6379 || fail "Из app не подключиться к db:6379 по имени"
ok "app → db:6379 по имени в сети appnet"
```

```text hint
1. Создать пользовательскую сеть типа bridge.
2. Запустить оба контейнера в фоне с именами и указанием сети.
3. Проверить из app подключение к порту по имени (в alpine есть nc).
```

```bash solution
docker network create appnet
docker run -d --name db --network appnet redis:7-alpine
docker run -d --name app --network appnet alpine:3.20 sleep 100000
sleep 1
docker exec app nc -zv db 6379
```

```text review
Эталон: `docker network create appnet` + `--network appnet` у обоих контейнеров.

- В **пользовательской** сети работает встроенный DNS Docker (`127.0.0.11`): имя контейнера = DNS-имя. В стандартной сети `bridge` имён нет — только IP, которые меняются при пересоздании.
- Compose создаёт такую сеть сам: сервисы видят друг друга по именам сервисов.
- Порт 6379 не публиковался (`-p` не нужен): внутри сети контейнеры общаются напрямую. Публикуют только то, что должно быть доступно с хоста или снаружи.
```

### Порт только для хоста

Запустите Redis в контейнере **`cache`** (образ `redis:7-alpine`) так, чтобы его порт **6380** на хосте вёл на 6379 контейнера, но был доступен **только с самого хоста** — не снаружи.

```bash setup
lab_drm cache
```

```bash check
[ "$(docker inspect -f '{{.State.Running}}' cache 2>/dev/null)" = true ] || fail "Контейнер cache не запущен"
b=$(docker inspect -f '{{range $p, $c := .NetworkSettings.Ports}}{{range $c}}{{$p}}={{.HostIp}}:{{.HostPort}} {{end}}{{end}}' cache)
echo "$b" | grep -q '6379/tcp=127.0.0.1:6380' || fail "Порт 6379 контейнера опубликован так: «${b:-никак}» — нужен 6380 только на 127.0.0.1"
echo "$b" | grep -qE '6379/tcp=(0\.0\.0\.0|::|):' && fail "Порт опубликован и на всех интерфейсах: $b"
redis-cli -p 6380 ping 2>/dev/null | grep -q PONG || fail "С хоста redis-cli -p 6380 ping не отвечает"
ok "cache: $b"
```

```text hint
У ключа публикации порта есть полная форма из трёх частей: адрес хоста, порт хоста и порт контейнера.
```

```bash solution
docker run -d --name cache -p 127.0.0.1:6380:6379 redis:7-alpine
sleep 1
redis-cli -p 6380 ping
```

```text review
Эталон: `-p 127.0.0.1:6380:6379`.

- `-p 6380:6379` слушает на `0.0.0.0` — порт открыт в интернет, и **ufw этого не видит**: Docker пишет свои правила iptables раньше правил ufw. Сотни тысяч Redis и Elasticsearch без пароля утекли именно так.
- Базам и кэшам публикация обычно вообще не нужна — к ним ходят контейнеры по внутренней сети. На хост — только для отладки и только на `127.0.0.1`.
- Проверить, что реально слушает хост: `ss -ltnp | grep 6380` (процесс `docker-proxy`).
```

### Изоляция сетей

Соберите схему из трёх контейнеров:

- **`front`** (`nginx:1.27-alpine`) — в сети **`frontnet`**;
- **`store`** (`redis:7-alpine`) — в сети **`backnet`**;
- **`api`** (`alpine:3.20`, `sleep 100000`) — **в обеих** сетях.

`api` должен достучаться и до `front:80`, и до `store:6379`, а `front` до `store` — **нет**.

```bash setup
lab_drm front store api
docker network rm frontnet backnet >/dev/null 2>&1; true
```

```bash check
for c in front store api; do [ "$(docker inspect -f '{{.State.Running}}' $c 2>/dev/null)" = true ] || fail "Контейнер $c не запущен"; done
nets() { docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' $1; }
nets front | grep -qw frontnet && ! nets front | grep -qw backnet || fail "front должен быть только в frontnet (сейчас: $(nets front))"
nets store | grep -qw backnet && ! nets store | grep -qw frontnet || fail "store должен быть только в backnet (сейчас: $(nets store))"
nets api | grep -qw frontnet && nets api | grep -qw backnet || fail "api должен быть в обеих сетях (сейчас: $(nets api))"
docker exec api nc -z -w 2 front 80 || fail "api не достаёт до front:80"
docker exec api nc -z -w 2 store 6379 || fail "api не достаёт до store:6379"
docker exec front sh -c 'nc -z -w 2 store 6379' 2>/dev/null && fail "front достаёт до store — сети не изолированы"
ok "front ⟂ store, api видит обоих"
```

```text hint
1. Создать две сети.
2. Каждый контейнер запустить в своей сети. Контейнер можно подключить к ещё одной сети уже после запуска отдельной командой сети.
3. Проверить связность изнутри контейнеров.
```

```bash solution
docker network create frontnet
docker network create backnet
docker run -d --name front --network frontnet nginx:1.27-alpine
docker run -d --name store --network backnet redis:7-alpine
docker run -d --name api --network frontnet alpine:3.20 sleep 100000
docker network connect backnet api
sleep 1
docker exec api nc -zv front 80; docker exec api nc -zv store 6379
```

```text review
Эталон: две сети, `docker network connect backnet api`.

- Классическая схема: прокси/фронт в публичной сети, база — во внутренней, приложение — в обеих. Взломанный nginx не получит прямого доступа к базе.
- В Compose то же самое — раздел `networks:` у сервисов; сеть можно пометить `internal: true` — без выхода наружу вообще.
- В Kubernetes изоляцию между подами делают NetworkPolicy — по умолчанию там все поды видят всех.
```

## Тест

### Какой сетевой драйвер Docker используется по умолчанию?
= bridge
> Контейнеры получают IP во внутренней сети моста и выходят наружу через NAT.

### Почему контейнеры в стандартной сети bridge не могут обратиться друг к другу по имени?
- [ ] Это ошибка Docker
- [x] Встроенный DNS с именами контейнеров работает только в пользовательских сетях, созданных через docker network create
- [ ] Нужно указать --dns 8.8.8.8
- [ ] Имена контейнеров нельзя использовать как адреса
> Compose создаёт пользовательскую сеть автоматически.

### Что делает режим --network host?
- [ ] Создаёт отдельную сеть для хоста
- [x] Контейнер использует сетевой стек хоста напрямую: без изоляции сети и NAT, флаг -p игнорируется
- [ ] Запрещает контейнеру сеть
- [ ] Связывает контейнеры на разных хостах
> Быстро, но порты контейнера конфликтуют с портами хоста.

### Какой драйвер нужен для связи контейнеров на разных хостах в Docker Swarm?
= overlay
> Он строит виртуальную сеть поверх физической (VXLAN).

### Когда используют драйвер macvlan?
- [ ] Для ускорения DNS
- [x] Когда контейнер должен выглядеть как отдельное устройство в физической сети со своим MAC и IP
- [ ] Для изоляции без сети
- [ ] Для Docker Swarm
> Например, для легаси-приложений, которые ждут прямого доступа в LAN.

### Приложение в контейнере слушает 127.0.0.1:8000, порт опубликован -p 8000:8000, но снаружи не открывается. Почему?
- [ ] Нужно перезапустить Docker
- [x] 127.0.0.1 внутри контейнера — это loopback контейнера; приложение должно слушать 0.0.0.0
- [ ] Порт 8000 запрещён
- [ ] Нужно использовать -P
> Трафик с хоста приходит на eth0 контейнера, а не на его loopback.

### Почему порт, опубликованный через -p, может быть доступен из интернета, даже если ufw его запрещает?
- [ ] ufw не работает с TCP
- [x] Docker добавляет свои правила iptables, которые обрабатываются раньше правил ufw
- [ ] Docker отключает ufw
- [ ] Это происходит только с UDP
> Публикуйте на 127.0.0.1 или используйте цепочку DOCKER-USER.

### Нужно ли публиковать порт PostgreSQL через -p, чтобы приложение в другом контейнере той же сети к нему подключилось?
- [ ] Да, всегда
- [x] Нет: контейнеры одной сети общаются напрямую по внутренним портам; публикация нужна только для доступа с хоста или извне
- [ ] Да, иначе DNS не работает
- [ ] Только для UDP
> Меньше опубликованных портов — меньше поверхность атаки.

### Какой адрес DNS-сервера видит контейнер в пользовательской сети Docker?
= 127.0.0.11
> Это встроенный DNS Docker, который резолвит имена контейнеров и сервисов.

### Что делает --network container:web?
- [ ] Создаёт сеть с именем web
- [x] Новый контейнер использует сетевой namespace контейнера web: общий IP и localhost
- [ ] Копирует настройки сети web
- [ ] Запрещает сеть для web
> Так же устроен под в Kubernetes.

### Как сделать, чтобы опубликованный порт был доступен только с самого хоста?
- [x] -p 127.0.0.1:8080:80
- [ ] -p 8080:80 --private
- [ ] --expose 8080
- [ ] -p localhost
> Так часто публикуют базы и админки, к которым ходят через SSH-туннель.

### Подсеть Docker пересеклась с корпоративной сетью VPN, и часть адресов стала недоступна. Как исправить?
- [ ] Отключить VPN
- [x] Задать другие диапазоны через default-address-pools в /etc/docker/daemon.json (или указать подсеть при создании сети)
- [ ] Использовать --network none
- [ ] Удалить docker0
> После изменения daemon.json нужен перезапуск Docker и пересоздание сетей.

### Как устроено подключение контейнера к bridge-сети?
- [ ] Через отдельную физическую сетевую карту
- [x] Через пару veth: один конец — eth0 в сетевом namespace контейнера, второй подключён к мосту на хосте
- [ ] Через VPN-туннель
- [ ] Через Unix-сокет
> Наружу трафик выходит через MASQUERADE в iptables.
