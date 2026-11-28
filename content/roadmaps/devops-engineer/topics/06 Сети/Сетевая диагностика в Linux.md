---
title: Сетевая диагностика в Linux
slug: setevaya-diagnostika-v-linux
description: Главные сетевые команды — ip, ss и netstat, curl, telnet и nc, nmap — и алгоритм поиска сетевой проблемы.
duration: 75
level: Основы
quizSize: 10
materials:
  - title: man7 — ip(8)
    url: https://man7.org/linux/man-pages/man8/ip.8.html
    type: документация
  - title: man7 — ss(8)
    url: https://man7.org/linux/man-pages/man8/ss.8.html
    type: документация
  - title: linkmeup — Сети для самых маленьких
    url: https://linkmeup.ru/sdsm/
    type: курс
---

# Сетевая диагностика в Linux

Практика из роадмапа начинается с реальных проблем вашего проекта: бэкенд не видит базу, сайт не открывается, порт закрыт. Для их решения хватает десятка команд — их нужно знать наизусть.

## ip — адреса, интерфейсы, маршруты

Пакет **iproute2** заменил устаревшие `ifconfig`, `route` и `arp`.

```bash
ip a                      # адреса всех интерфейсов (ip address)
ip -br a                  # кратко: интерфейс, состояние, адреса
ip link                   # интерфейсы, MAC, состояние UP/DOWN
ip -s link show eth0      # счётчики: пакеты, ошибки, отбрасывания
ip route                  # таблица маршрутизации
ip route get 10.0.2.15    # каким маршрутом и через какой интерфейс пойдёт пакет
ip neigh                  # ARP-кэш
sudo ip addr add 10.0.0.50/24 dev eth0   # добавить адрес (до перезагрузки)
sudo ip link set eth0 up
```

Изменения через `ip` действуют до перезагрузки. Постоянные настройки — в **netplan** (Ubuntu, `/etc/netplan/*.yaml`) или **NetworkManager** (`nmcli`).

## ss и netstat — порты и соединения

```bash
sudo ss -tulpn              # слушающие TCP/UDP-порты и процессы
ss -tan                     # все TCP-соединения с состояниями
ss -tn state established    # только установленные
ss -s                       # сводка
sudo ss -tlnp 'sport = :80' # кто слушает порт 80
sudo netstat -tulpn         # то же старой утилитой (пакет net-tools)
```

Флаги: **t** — TCP, **u** — UDP, **l** — слушающие, **p** — процесс, **n** — не резолвить имена и порты.

На что смотреть в колонке **Local Address**:

| Адрес | Что значит |
| --- | --- |
| `127.0.0.1:8000` | Доступно только с этой машины |
| `0.0.0.0:8000` или `*:8000` | На всех IPv4-интерфейсах — доступно снаружи (если пустит файрвол) |
| `[::]:8000` | На всех IPv6 (часто и IPv4 тоже) |
| `10.0.0.5:5432` | Только на конкретном адресе |

Классическая ошибка: приложение слушает `127.0.0.1`, а к нему пытаются подключиться с другой машины.

## curl — проверка HTTP

```bash
curl -v http://10.0.0.5:8000/health
curl -s -o /dev/null -w "%{http_code} connect=%{time_connect} total=%{time_total}\n" https://example.com
```

## telnet и nc — проверка TCP-порта

```bash
nc -zv 10.0.0.5 5432           # открыт ли порт (z — без отправки данных, v — подробно)
nc -zv -w 3 10.0.0.5 5432      # с таймаутом 3 секунды
telnet 10.0.0.5 5432           # старый способ: «Connected» — порт открыт
nc -l 9000                     # слушать порт (простейший тестовый сервер)
echo "hello" | nc 10.0.0.5 9000   # отправить данные
```

Три возможных исхода проверки порта:

- **succeeded / Connected** — порт открыт и кто-то слушает;
- **Connection refused** — хост доступен, но порт никто не слушает (или файрвол отвечает REJECT);
- **таймаут** — пакеты теряются: файрвол с DROP, неверный маршрут, хост выключен.

## nmap — сканирование портов

```bash
nmap 10.0.0.5                  # популярные TCP-порты
nmap -p 22,80,443,5432 10.0.0.5
nmap -sV -p 1-1000 10.0.0.5    # с определением версий сервисов
sudo nmap -sU -p 53 10.0.0.2   # UDP
```

Состояния: **open**, **closed** (порт отвечает, но не слушается), **filtered** (ответа нет — режет файрвол).

> [!warning] Сканируйте только свои системы
> Сканирование чужих серверов без разрешения может нарушать правила провайдера и закон.

## Алгоритм «не работает соединение A → B»

1. **Есть ли у A сеть и маршрут?** `ip a`, `ip route get <IP B>`
2. **Резолвится ли имя B?** `dig +short b.example.com`, `getent hosts b`
3. **Доступен ли B по сети?** `ping B` (помня, что ICMP могут резать), `mtr B`
4. **Открыт ли порт?** `nc -zv B порт`: refused или таймаут?
5. **На B: слушает ли сервис и на каком адресе?** `sudo ss -tulpn | grep порт`
6. **Пускает ли файрвол на B и в облаке?** `sudo ufw status`, `sudo nft list ruleset`, группы безопасности
7. **Что говорит само приложение?** `curl -v`, логи сервиса

## Практика

- [ ] Найти свой IP, шлюз и маршрут до `8.8.8.8` с помощью `ip`
- [ ] Посмотреть все слушающие порты на сервере из практики Linux и определить, какие доступны снаружи, а какие — только локально
- [ ] Решить проблему из практики: бэкенд не видит базу. Пройти алгоритм выше по шагам и записать каждый шаг
- [ ] Проверить порт PostgreSQL с другой машины через `nc -zv` до и после настройки `listen_addresses` и ufw
- [ ] Просканировать свою ВМ через `nmap` и сравнить результат с `ss -tulpn`
- [ ] Получить разные исходы проверки порта: open, refused и таймаут

## Лаборатория

Машины — сетевые пространства имён `lab-*`: `sudo ip netns exec lab-<имя> <команда>`.

### Бэкенд не видит базу

Бэкенд на машине `lab-app` (10.60.0.10) не может подключиться к базе на `lab-db` (**10.60.1.20:5432**) — между ними маршрутизатор `lab-gw`. База запускается службой `lab-net-db`, адрес, который она слушает, задан в `/etc/lab-db.conf` (после правки службу нужно перезапустить). Найдите **все** причины и устраните их, чтобы `sudo ip netns exec lab-app nc -zv 10.60.1.20 5432` проходил.

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
lab_ns app; lab_ns gw; lab_ns db
lab_link app eth0 10.60.0.10/24 gw eth0 10.60.0.1/24
lab_link gw eth1 10.60.1.1/24 db eth0 10.60.1.20/24
ip netns exec lab-gw sysctl -qw net.ipv4.ip_forward=1
ip -n lab-app route add default via 10.60.0.1
echo 'LISTEN=127.0.0.1' > /etc/lab-db.conf
cat > /opt/lab-fake-db.py <<'EOF'
import socket
conf = dict(l.strip().split("=", 1) for l in open("/etc/lab-db.conf") if "=" in l)
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind((conf.get("LISTEN", "127.0.0.1"), 5432)); s.listen(50)
print("fake db listens on", conf.get("LISTEN"), flush=True)
while True:
    c, _ = s.accept(); c.close()
EOF
lab_bg db db python3 /opt/lab-fake-db.py
lab_wait_port db 127.0.0.1 5432
```

```bash check
ip netns exec lab-app timeout 3 bash -c '</dev/tcp/10.60.1.20/5432' 2>/dev/null || {
  ip netns exec lab-app ping -c1 -W1 10.60.1.20 >/dev/null 2>&1 || fail "С lab-app до 10.60.1.20 нет даже ping"
  fail "lab-app пингует базу, но порт 5432 недоступен"
}
ok "lab-app → 10.60.1.20:5432 доступен"
```

```text hint
1. Идти по уровням снизу вверх: есть ли у машин адреса и маршруты? Пингуется ли шлюз? Пингуется ли база с бэкенда, а бэкенд с базы? Для ответа базе нужен обратный путь.
2. Когда сеть работает, проверить, что база слушает нужный адрес: список слушающих сокетов изнутри машины с базой. Адрес loopback снаружи недоступен.
3. Исправить конфиг базы и перезапустить её службу.
```

```bash solution
sudo ip netns exec lab-app ping -c1 -W1 10.60.0.1
sudo ip netns exec lab-app ping -c1 -W1 10.60.1.20 || true
sudo ip netns exec lab-db ip route
sudo ip -n lab-db route add default via 10.60.1.1
sudo ip netns exec lab-db ss -ltn
echo 'LISTEN=0.0.0.0' | sudo tee /etc/lab-db.conf >/dev/null
sudo systemctl restart lab-net-db
sleep 1
sudo ip netns exec lab-app nc -zv -w2 10.60.1.20 5432
```

```text review
Эталон: две проблемы — у базы нет маршрута обратно (`ip route add default via 10.60.1.1` в `lab-db`) и база слушает только `127.0.0.1` (`LISTEN=0.0.0.0` + перезапуск).

- Алгоритм «A не видит B»: адрес и маршрут у A → пинг шлюза → пинг B → (пинг A с B — обратный путь!) → порт: `nc -zv B 5432` → на B: `ss -ltnp` (слушает ли и какой адрес) → файрвол на B → журнал сервиса.
- Типичные «две причины сразу» на собеседовании: `listen_addresses = 'localhost'` в PostgreSQL + закрытый порт в ufw/security group; или `bind 127.0.0.1` в Redis + отсутствующее правило файрвола.
- `ping` проходит, а порт — нет: смотрите на сам сервис и файрвол. Пинг не проходит: адреса, маршруты, ICMP-фильтры.
```

## Тест

### Какой командой посмотреть IP-адреса интерфейсов в современном Linux?
= ip a
= ip addr
= ip address
> `ifconfig` устарел и часто не установлен.

### Какую команду используют, чтобы увидеть слушающие порты вместе с процессами?
- [ ] ip route
- [x] sudo ss -tulpn
- [ ] ping -p
- [ ] dig -p
> Устаревший аналог — `netstat -tulpn`.

### В ss -tulpn приложение слушает 127.0.0.1:8000. Что это значит?
- [ ] Порт доступен из интернета
- [x] Порт доступен только с этой же машины
- [ ] Порт закрыт
- [ ] Приложение не запущено
> Чтобы к нему подключались снаружи, приложение должно слушать 0.0.0.0 или конкретный внешний адрес.

### nc -zv 10.0.0.5 5432 зависает и завершается по таймауту. Что вероятнее всего?
- [ ] На порту никто не слушает
- [x] Пакеты отбрасываются по дороге: файрвол с DROP, неверный маршрут или хост выключен
- [ ] Неверный пароль базы
- [ ] Проблема с DNS
> Если никто не слушает, ответ приходит сразу: Connection refused.

### nc сразу отвечает Connection refused. Что это значит?
- [ ] Файрвол отбрасывает пакеты
- [x] Хост доступен, но на этом порту никто не слушает (или файрвол явно отвечает отказом)
- [ ] Хост выключен
- [ ] Порт открыт
> Проверьте на сервере `ss -tulpn` — запущен ли сервис и на каком адресе он слушает.

### Как узнать, через какой интерфейс и шлюз пойдёт пакет к 10.0.2.15?
= ip route get 10.0.2.15
> Удобно, когда на машине несколько интерфейсов и маршрутов.

### Что означают флаги в ss -tulpn?
- [x] t — TCP, u — UDP
- [x] l — только слушающие сокеты, p — показать процессы, n — не резолвить имена
- [ ] t — timeout, u — user
- [ ] l — логи, p — пароли
> Без sudo процессы других пользователей не видны.

### Что означает состояние filtered в выводе nmap?
- [ ] Порт открыт
- [ ] Порт закрыт, но отвечает
- [x] Ответа нет: пакеты, скорее всего, режет файрвол
- [ ] Порт занят nmap
> closed — порт отвечает отказом, open — порт слушается.

### Чем изменения через ip addr add отличаются от настроек в netplan?
- [ ] Ничем
- [x] Изменения через ip действуют до перезагрузки, а настройки netplan (или NetworkManager) сохраняются
- [ ] ip работает только с IPv6
- [ ] netplan работает только в RHEL
> В RHEL-семействе постоянные настройки обычно делают через nmcli.

### Как через curl узнать код ответа и время запроса, не выводя тело?
- [ ] curl -I --time
- [x] curl -s -o /dev/null -w "%{http_code} %{time_total}\n" URL
- [ ] curl -v URL | grep code
- [ ] curl -k URL
> Удобно для скриптов проверки доступности.

### Бэкенд не может подключиться к базе на другом сервере. Какие шаги проверки правильные?
- [x] Проверить порт с бэкенда: nc -zv db 5432
- [x] На сервере базы проверить, на каком адресе слушает PostgreSQL: ss -tulpn
- [x] Проверить файрвол на сервере базы и группы безопасности в облаке
- [ ] Сразу переустановить PostgreSQL
> Идите по алгоритму от сети к приложению.

### Как посмотреть счётчики ошибок и отброшенных пакетов на интерфейсе eth0?
= ip -s link show eth0
= ip -s link
> Растущие errors и dropped — повод проверить сетевую карту, драйвер или перегрузку.
