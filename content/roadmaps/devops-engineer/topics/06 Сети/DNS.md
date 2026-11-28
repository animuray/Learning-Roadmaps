---
title: DNS
slug: dns
description: Как работает DNS — рекурсивный и авторитативный серверы, типы записей A, AAAA, CNAME, MX, TXT, NS, TTL, dig, /etc/hosts и resolv.conf.
duration: 75
level: Основы
quizSize: 10
materials:
  - title: Cloudflare — What is DNS?
    url: https://www.cloudflare.com/learning/dns/what-is-dns/
    type: статья
  - title: linkmeup — Сети для самых маленьких
    url: https://linkmeup.ru/sdsm/
    type: курс
---

# DNS

**DNS** (Domain Name System) переводит имена вроде `example.com` в IP-адреса. Это распределённая иерархическая база данных. В DevOps её касаются постоянно: записи для сайтов и API, сервисы в Kubernetes, проверка домена для сертификатов, почта. Поговорка «It's always DNS» появилась не просто так.

## Иерархия

```
.                         корень (13 логических групп корневых серверов)
└── com.                  домен верхнего уровня (TLD)
    └── example.com.      домен второго уровня — его зона хранится у авторитативных серверов владельца
        └── api.example.com.
```

## Как проходит запрос

1. Приложение спрашивает адрес у системного резолвера. Тот смотрит **`/etc/hosts`** и локальный кэш.
2. Запрос уходит **рекурсивному резолверу** (провайдера, облака, `1.1.1.1`, `8.8.8.8`, корпоративному DNS).
3. Если ответа нет в кэше, резолвер спрашивает **корневой сервер**: «где `com.`?» → получает адреса серверов TLD.
4. Спрашивает сервер **`com.`**: «где `example.com.`?» → получает **NS** — авторитативные серверы домена.
5. Спрашивает **авторитативный сервер** `example.com`: «какой A у `api.example.com`?» → получает ответ.
6. Резолвер **кэширует** ответ на время **TTL** и отдаёт клиенту.

- **Рекурсивный резолвер** делает всю работу за клиента и кэширует ответы.
- **Авторитативный сервер** хранит записи зоны и отвечает «из первых рук».

## Типы записей

| Запись | Что хранит | Пример |
| --- | --- | --- |
| **A** | IPv4-адрес | `api.example.com. 300 IN A 203.0.113.10` |
| **AAAA** | IPv6-адрес | `… IN AAAA 2001:db8::10` |
| **CNAME** | Псевдоним на другое имя | `www.example.com. IN CNAME example.com.` |
| **MX** | Почтовые серверы домена с приоритетом | `example.com. IN MX 10 mail.example.com.` |
| **TXT** | Произвольный текст: SPF, DKIM, проверка владения доменом | `"v=spf1 include:_spf.google.com ~all"` |
| **NS** | Авторитативные серверы зоны | `example.com. IN NS ns1.provider.net.` |
| SOA | Параметры зоны: основной сервер, серийный номер, таймеры | — |
| PTR | Обратная запись: IP → имя | `10.113.0.203.in-addr.arpa. IN PTR api.example.com.` |
| SRV | Сервис, порт и хост | Используется в Kubernetes, VoIP |
| CAA | Какие удостоверяющие центры могут выпускать сертификаты | `0 issue "letsencrypt.org"` |

Ограничение: на имя с CNAME нельзя повесить другие записи. Поэтому на «голый» домен (`example.com`) CNAME обычно не ставят.

## TTL

**TTL** — сколько секунд ответ можно хранить в кэше. Большой TTL снижает нагрузку, но изменения расходятся долго. Перед миграцией сервера TTL заранее уменьшают (например, до 60 секунд), а после переезда возвращают обратно. Фраза «DNS ещё не обновился» почти всегда означает, что где-то в кэше живёт старая запись с непрошедшим TTL.

## dig — главный инструмент

```bash
dig example.com                     # запись A
dig +short example.com              # только ответ
dig example.com AAAA
dig example.com MX +short
dig www.example.com CNAME
dig @8.8.8.8 example.com            # спросить конкретный резолвер
dig @ns1.provider.net example.com   # спросить авторитативный сервер напрямую — без кэшей
dig +trace example.com              # пройти всю цепочку от корня самому
dig -x 203.0.113.10                 # обратный запрос (PTR)
```

В выводе смотрите **status** (`NOERROR`, `NXDOMAIN` — имени нет, `SERVFAIL` — ошибка сервера), секцию **ANSWER** и TTL рядом с записью.

Другие утилиты: `nslookup example.com`, `host example.com`, `getent hosts example.com` (резолвит так же, как приложения, с учётом /etc/hosts).

## Настройка DNS-клиента в Linux

- **`/etc/hosts`** — статические соответствия «IP имя». Проверяется раньше DNS (порядок задаёт `/etc/nsswitch.conf`). Удобно для тестов: `127.0.0.1 app.local`.
- **`/etc/resolv.conf`** — какие резолверы спрашивать:
  ```
  nameserver 10.0.0.2
  search corp.example.com
  options timeout:2 attempts:2
  ```
  `search` позволяет писать короткие имена: `ping db` → `db.corp.example.com`.
- В Ubuntu этим управляет **systemd-resolved**: в `resolv.conf` стоит `nameserver 127.0.0.53`, а реальные серверы видны в `resolvectl status`. Править `resolv.conf` вручную бесполезно — его перезапишут; настройка — через netplan или `/etc/systemd/resolved.conf`.

## Частые проблемы

- Домен «не открывается у части людей» — расходятся кэши после изменения записи; проверяйте авторитативный сервер напрямую.
- `NXDOMAIN` — опечатка или запись не создана.
- `SERVFAIL` — проблема на стороне DNS-сервера (часто DNSSEC).
- Работает по IP, но не по имени — проблема с резолвингом на клиенте: `resolv.conf`, `resolvectl`.
- В контейнерах и Kubernetes — свой DNS (CoreDNS), разберём в соответствующих разделах.

## Практика

- [ ] Выполнить `dig +trace ya.ru` и проследить цепочку от корня до ответа
- [ ] Посмотреть записи A, AAAA, MX, TXT и NS для любого крупного домена
- [ ] Сравнить ответы `dig @8.8.8.8` и `dig @1.1.1.1` и TTL в них; повторить запрос и посмотреть, как TTL уменьшается
- [ ] Добавить в `/etc/hosts` запись для `myapp.local` и проверить через `getent hosts` и `ping`
- [ ] Посмотреть, какие DNS-серверы реально используются: `cat /etc/resolv.conf` и `resolvectl status`
- [ ] Если есть свой домен — создать A-запись для сервера из практики Linux

## Лаборатория

В сети работает DNS-сервер компании `lab-dns` (адрес **10.53.0.53**), он обслуживает внутреннюю зону `.lab`. Со стенда до него можно достучаться напрямую.

```bash setup
# «Машины» задачи — network namespace lab-*, «кабели» — пары veth. Всё лабораторное начинается с lab.
lab_net_reset() {
  for u in $(systemctl list-units --all --plain --no-legend 'lab-net-*' | awk '{print $1}'); do
    systemctl stop "$u" 2>/dev/null; systemctl reset-failed "$u" 2>/dev/null
  done
  for ns in $(ip netns list | awk '$1 ~ /^lab-/ {print $1}'); do
    ip netns pids "$ns" | xargs -r kill -9 2>/dev/null; ip netns del "$ns"
  done
  for l in $(ip -o link show | awk -F': ' '{print $2}' | cut -d@ -f1 | grep '^lab'); do ip link del "$l" 2>/dev/null; done
  rm -rf /etc/netns/lab-*
  true
}
# lab_ns имя — пустая «машина» lab-имя с поднятым loopback
lab_ns() { ip netns add "lab-$1"; ip -n "lab-$1" link set lo up; }
# lab_link ns1 if1 addr1 ns2 if2 addr2 — кабель между двумя машинами; ns «-» — сам стенд, addr «-» — без адреса
lab_link() {
  local t1=labt$RANDOM t2=labu$RANDOM
  ip link add "$t1" type veth peer name "$t2"
  _lab_end "$1" "$t1" "$2" "$3"; _lab_end "$4" "$t2" "$5" "$6"
}
_lab_end() {
  if [ "$1" = - ]; then
    ip link set "$2" name "$3"; ip link set "$3" up; [ "$4" = - ] || ip addr add "$4" dev "$3"
  else
    ip link set "$2" netns "lab-$1"; ip -n "lab-$1" link set "$2" name "$3"; ip -n "lab-$1" link set "$3" up
    [ "$4" = - ] || ip -n "lab-$1" addr add "$4" dev "$3"
  fi
}
# lab_bg имя ns команда... — фоновый процесс внутри машины (служба lab-net-имя)
lab_bg() { local u=$1 ns=$2; shift 2; systemd-run -q --unit="lab-net-$u" ip netns exec "lab-$ns" "$@"; }
# lab_wait_port ns адрес порт — дождаться, пока сервис начнёт слушать
lab_wait_port() { for i in $(seq 40); do ip netns exec "lab-$1" ss -ltnH "src $2 and sport = :$3" | grep -q . && return 0; sleep 0.25; done; return 1; }
lab_net_reset
lab_ns dns; lab_ns dnsc
lab_link - labdns0 10.53.0.1/24 dns eth0 10.53.0.53/24
lab_link dns eth1 10.54.0.53/24 dnsc eth0 10.54.0.10/24
tok="lab-verify=$(tr -dc a-z0-9 </dev/urandom | head -c 10)"
echo "$tok" > /var/lib/lab/dns-txt
lab_bg dnsmasq dns dnsmasq --keep-in-foreground --no-resolv --no-hosts --bind-interfaces \
  --listen-address=10.53.0.53 --listen-address=10.54.0.53 \
  --address=/app.lab/10.53.0.10 --address=/db.lab/10.53.0.20 \
  --mx-host=lab,mail.lab,10 --address=/mail.lab/10.53.0.25 \
  --txt-record=verify.lab,"$tok"
for i in $(seq 40); do dig +short +time=1 +tries=1 @10.53.0.53 app.lab 2>/dev/null | grep -q . && break; sleep 0.25; done
```

### Запись у конкретного сервера

Для подтверждения домена в зоне `.lab` есть TXT-запись у имени `verify.lab`. Запросите её **у сервера 10.53.0.53** и запишите значение (без кавычек) в `~/txt.txt`.

```bash setup
rm -f /home/student/txt.txt
```

```bash check
want=$(cat /var/lib/lab/dns-txt)
[ -f /home/student/txt.txt ] || fail "Нет ~/txt.txt"
got=$(tr -d '"[:space:]' < /home/student/txt.txt)
[ "$got" = "$want" ] || fail "В ~/txt.txt «$got» — это не значение TXT-записи verify.lab"
ok "verify.lab TXT: $want"
```

```text hint
1. У утилиты запросов DNS сервер указывают через «собаку», а тип записи — отдельным словом.
2. Короткий режим вывода оставит только значение.
3. Системный резолвер стенда о зоне .lab ничего не знает — спрашивать нужно именно этот сервер.
```

```bash solution
dig @10.53.0.53 verify.lab TXT +short
dig @10.53.0.53 verify.lab TXT +short | tr -d '"' > ~/txt.txt
```

```text review
Эталон: `dig @10.53.0.53 verify.lab TXT +short`.

- `dig` без `@` спрашивает серверы из `/etc/resolv.conf`; с `@сервер` — конкретный. Так сравнивают ответы внутреннего DNS, `@8.8.8.8` и авторитативного сервера домена.
- Типы: `A`/`AAAA` — адреса, `CNAME` — псевдоним, `MX` — почта, `TXT` — проверки владения доменом, SPF, DKIM, `NS` — кто обслуживает зону, `SOA` — параметры зоны.
- Полезное: `+trace` — пройти от корня до ответа, `+noall +answer` — только ответ с TTL, `-x 1.2.3.4` — обратный запрос (PTR).
- После изменения записи старый ответ живёт в кэшах до истечения **TTL** — поэтому перед переездом TTL заранее уменьшают.
```

### Не резолвится имя

Приложение в машине `lab-dnsc` не может обратиться к `app.lab`: «Temporary failure in name resolution». DNS-сервер компании для этой машины доступен по адресу **10.54.0.53**. Почините разрешение имён в `lab-dnsc`, чтобы `sudo ip netns exec lab-dnsc getent hosts app.lab` возвращал адрес из DNS. Прописывать адрес вручную в `hosts` нельзя.

```bash setup
mkdir -p /etc/netns/lab-dnsc
printf '# DNS этой машины\nnameserver 10.54.0.99\n' > /etc/netns/lab-dnsc/resolv.conf
sed -i '/app\.lab/d' /etc/hosts
```

```bash check
[ -e /etc/netns/lab-dnsc/hosts ] && grep -q app.lab /etc/netns/lab-dnsc/hosts && fail "Имя прописано вручную в hosts — так при смене адреса приложение сломается снова"
grep -q 'app\.lab' /etc/hosts && fail "Имя прописано вручную в /etc/hosts"
r=$(ip netns exec lab-dnsc getent hosts app.lab | awk '{print $1}')
[ "$r" = 10.53.0.10 ] || fail "В lab-dnsc app.lab не разрешается (ответ: «${r:-пусто}»)"
ok "lab-dnsc: app.lab → $r"
```

```text hint
1. Проверить, отвечает ли DNS-сервер компании на запрос из этой машины, указав его адрес явно.
2. Посмотреть, какой DNS-сервер машина использует на самом деле. Команда ip netns exec подменяет файл с настройками резолвера для пространства имён — его копия лежит в каталоге /etc/netns/<имя>/.
3. Исправить адрес сервера в этом файле и повторить проверку.
```

```bash solution
sudo ip netns exec lab-dnsc cat /etc/resolv.conf
sudo ip netns exec lab-dnsc dig +short @10.54.0.53 app.lab
echo 'nameserver 10.54.0.53' | sudo tee /etc/netns/lab-dnsc/resolv.conf >/dev/null
sudo ip netns exec lab-dnsc getent hosts app.lab
```

```text review
Эталон: `dig @10.54.0.53 app.lab` (сервер отвечает) → в `resolv.conf` машины стоит неверный `nameserver` → исправить.

- Порядок диагностики DNS: `getent hosts имя` (как видит система, с учётом `/etc/hosts`) → `cat /etc/resolv.conf` (какой сервер) → `dig имя` (через него) → `dig @другой_сервер имя` (проблема в сервере или в настройке клиента).
- В Ubuntu `/etc/resolv.conf` — ссылка на `systemd-resolved` (`nameserver 127.0.0.53`); реальные серверы — в `resolvectl status`. Править `resolv.conf` руками там бесполезно — перезапишется; DNS задают в netplan.
- Порядок источников (файлы, DNS, mDNS) — в `/etc/nsswitch.conf`, строка `hosts:`.
- `/etc/hosts` годится для локальной разработки, но не как «починка» DNS: адрес поменяется — и все забудут, откуда берётся старый.
```

## Тест

### Для чего нужен DNS?
- [ ] Для выдачи IP-адресов по DHCP
- [x] Для преобразования доменных имён в IP-адреса (и других данных о доменах)
- [ ] Для шифрования трафика
- [ ] Для маршрутизации пакетов
> Это распределённая иерархическая база данных.

### Чем рекурсивный резолвер отличается от авторитативного сервера?
- [x] Рекурсивный резолвер выполняет за клиента всю цепочку запросов и кэширует ответы
- [x] Авторитативный сервер хранит записи зоны и отвечает за свой домен «из первых рук»
- [ ] Авторитативный сервер всегда стоит у пользователя дома
- [ ] Это одно и то же
> 1.1.1.1 и 8.8.8.8 — публичные рекурсивные резолверы.

### Какая запись хранит IPv4-адрес домена?
= A
> AAAA — IPv6.

### Что такое CNAME?
- [ ] Почтовый сервер домена
- [x] Псевдоним: имя указывает на другое имя
- [ ] Обратная запись IP → имя
- [ ] Текстовая запись для проверки домена
> Например, `www` как CNAME на основной домен.

### Какая запись указывает почтовые серверы домена?
= MX
> У MX есть приоритет: меньшее число — выше приоритет.

### Что означает TTL у DNS-записи?
- [ ] Время, через которое домен истечёт
- [x] Сколько секунд резолверы и клиенты могут хранить ответ в кэше
- [ ] Число хопов до сервера
- [ ] Время ответа сервера
> Перед переездом TTL уменьшают, чтобы изменения разошлись быстрее.

### Как узнать ответ авторитативного сервера напрямую, минуя кэши?
- [ ] dig +short example.com
- [x] dig @ns1.provider.net example.com (указать авторитативный сервер)
- [ ] ping example.com
- [ ] cat /etc/hosts
> Ещё вариант — `dig +trace`, который проходит цепочку от корня сам.

### Что проверяется раньше DNS при резолвинге имени в Linux (по умолчанию)?
- [ ] /etc/resolv.conf
- [x] /etc/hosts
- [ ] /etc/fstab
- [ ] ~/.ssh/config
> Порядок задаётся в /etc/nsswitch.conf.

### Что означает статус NXDOMAIN в ответе dig?
- [ ] Сервер DNS недоступен
- [x] Такого имени не существует
- [ ] Запись есть, но TTL истёк
- [ ] Ошибка DNSSEC
> SERVFAIL — ошибка на стороне сервера.

### В Ubuntu в /etc/resolv.conf указано nameserver 127.0.0.53. Как узнать, какие DNS-серверы реально используются?
- [ ] cat /etc/hosts
- [x] resolvectl status
- [ ] dig 127.0.0.53
- [ ] ip route
> 127.0.0.53 — локальный systemd-resolved, который пересылает запросы настоящим серверам.

### После смены A-записи у части пользователей открывается старый сервер. Почему?
- [ ] Новая запись создана с ошибкой
- [x] У них в кэше резолвера ещё живёт старая запись, пока не истечёт её TTL
- [ ] DNS работает только по UDP
- [ ] Это проблема браузера, DNS ни при чём
> Поэтому перед миграцией заранее уменьшают TTL.

### Для чего обычно используют TXT-записи?
- [x] Для SPF и DKIM — правил отправки почты
- [x] Для подтверждения владения доменом (облака, сервисы, удостоверяющие центры)
- [ ] Для хранения IPv6-адресов
- [ ] Для балансировки нагрузки
> Let's Encrypt тоже может проверять домен через TXT-запись (DNS-01).

### Какой командой пройти всю цепочку DNS-запросов от корневых серверов?
= dig +trace example.com
> Видно ответы корня, TLD и авторитативного сервера.
