---
title: tcpdump и Wireshark
slug: tcpdump-i-wireshark
description: Захват трафика на сервере через tcpdump, фильтры захвата, сохранение в pcap и разбор пакетов в Wireshark.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: man7 — tcpdump(1)
    url: https://www.man7.org/linux/man-pages/man1/tcpdump.1.html
    type: документация
  - title: Wireshark User's Guide — Building Display Filter Expressions
    url: https://www.wireshark.org/docs/wsug_html_chunked/ChWorkBuildDisplayFilterSection.html
    type: документация
  - title: Wireshark Wiki — Display Filters (примеры)
    url: https://wiki.wireshark.org/DisplayFilters
    type: документация
---

# tcpdump и Wireshark

Когда логи молчат, а `curl` и `nc` не объясняют, что происходит, смотрят **сами пакеты**. Уходит ли запрос? Приходит ли ответ? Кто обрывает соединение? **tcpdump** захватывает трафик на сервере в консоли, **Wireshark** удобно разбирает его в графическом интерфейсе.

## tcpdump

```bash
sudo tcpdump -D                              # список интерфейсов
sudo tcpdump -i eth0                         # весь трафик интерфейса (Ctrl+C — стоп)
sudo tcpdump -i any -n port 5432             # трафик PostgreSQL на всех интерфейсах
sudo tcpdump -i eth0 -n host 10.0.0.7        # только с этим хостом
sudo tcpdump -i eth0 -n 'tcp port 443 and host 203.0.113.10'
sudo tcpdump -i eth0 -n -c 100 icmp          # первые 100 ICMP-пакетов
sudo tcpdump -i lo -n -A port 8000           # содержимое в ASCII — видно HTTP-запросы
sudo tcpdump -i eth0 -n -w /tmp/cap.pcap port 80   # записать в файл для Wireshark
tcpdump -n -r /tmp/cap.pcap                  # прочитать файл
```

Полезные флаги:

| Флаг | Смысл |
| --- | --- |
| `-i` | Интерфейс (`any` — все) |
| `-n` | Не резолвить IP и порты в имена — быстрее и понятнее |
| `-c N` | Остановиться после N пакетов |
| `-w файл` / `-r файл` | Записать в pcap / прочитать из pcap |
| `-A` / `-X` | Показать содержимое в ASCII / в hex и ASCII |
| `-v`, `-vv` | Подробнее |
| `-s 0` | Захватывать пакеты целиком (по умолчанию в современных версиях так и есть) |

### Фильтры захвата (BPF)

Фильтр пишется в конце команды и отбирает пакеты **ещё в ядре** — это важно на нагруженном сервере.

```
host 10.0.0.7            src host 10.0.0.7         dst host 10.0.0.7
net 10.0.0.0/24          port 53                   portrange 8000-8100
tcp / udp / icmp / arp   not port 22               'host A and (port 80 or port 443)'
'tcp[tcpflags] & (tcp-syn|tcp-rst) != 0'           только SYN и RST
```

Всегда добавляйте `not port 22`, если смотрите трафик по SSH, иначе tcpdump будет захватывать собственный вывод, который уходит вам по SSH.

### Как читать вывод

```
10:21:03.112 IP 10.0.0.5.51514 > 10.0.0.7.5432: Flags [S], seq 1001, length 0
10:21:03.113 IP 10.0.0.7.5432 > 10.0.0.5.51514: Flags [S.], seq 2001, ack 1002, length 0
10:21:03.113 IP 10.0.0.5.51514 > 10.0.0.7.5432: Flags [.], ack 2002, length 0
```

Флаги TCP: `[S]` — SYN, `[S.]` — SYN-ACK, `[.]` — ACK, `[P.]` — данные (PUSH), `[F.]` — FIN, `[R]` — RST.

Что можно понять:

- Видны только `[S]` без ответа, с повторами → пакеты не доходят или ответ режется (файрвол, маршрут).
- `[S]` → `[R.]` → порт закрыт (Connection refused).
- Соединение установилось, данные ушли, ответа нет → проблема в приложении на той стороне.
- Неожиданный `[R]` посреди обмена → кто-то обрывает соединение: приложение, балансировщик по таймауту, файрвол.

## Wireshark

Графический анализатор: раскладывает каждый пакет по уровням модели OSI, «склеивает» TCP-потоки, понимает сотни протоколов. На сервере обычно захватывают через `tcpdump -w`, файл копируют себе (`scp`) и открывают в Wireshark.

**Display filters** (фильтры отображения) — другой синтаксис, не путайте с фильтрами захвата:

```
ip.addr == 10.0.0.7
tcp.port == 5432
http.request
http.response.code >= 500
dns
tls.handshake.type == 1          ClientHello
tcp.flags.reset == 1             пакеты RST
tcp.analysis.retransmission      повторные передачи
```

Полезные функции:

- **Follow → TCP Stream** — весь диалог одного соединения как текст;
- **Statistics → Conversations** — кто с кем сколько обменялся;
- **Expert Information** — найденные проблемы: повторы, потери, ошибки.

`tshark` — консольная версия Wireshark с теми же фильтрами.

> [!warning] Трафик — это данные
> В захвате могут оказаться пароли, токены и персональные данные (особенно в незашифрованном HTTP). Не выкладывайте pcap-файлы публично и удаляйте их после разбора.

## Практика

- [ ] Захватить свой `curl http://example.com` через `tcpdump -n -A port 80` и найти HTTP-запрос и ответ
- [ ] Захватить TCP-рукопожатие и завершение соединения с локальным сервисом (`-i lo`) и разметить флаги
- [ ] Захватить DNS-запрос (`port 53`) во время `dig` и найти запрос и ответ
- [ ] Получить RST: подключиться к закрытому порту и найти пакет `[R]` в tcpdump
- [ ] Записать захват в файл, открыть в Wireshark и применить фильтры `http.request`, `dns`, `tcp.flags.reset == 1`
- [ ] Использовать Follow TCP Stream для HTTP-запроса к своему приложению

## Лаборатория

Клиент `lab-tdc` (10.70.0.10) и сервер `lab-tds` (10.70.0.20) соединены кабелем, интерфейс у каждого — `eth0`. Слушать трафик можно изнутри любой из машин: `sudo ip netns exec lab-tds tcpdump -i eth0 ...`.

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
lab_ns tdc; lab_ns tds
lab_link tdc eth0 10.70.0.10/24 tds eth0 10.70.0.20/24
```

### Пароль в открытом виде

Клиент раз в пару секунд входит в веб-приложение на сервере по **HTTP без TLS**. Перехватите трафик и найдите **пароль**, который он отправляет. Запишите его в `~/sniffed.txt`.

```bash setup
rm -f /home/student/sniffed.txt
pw="P@ss-$(tr -dc a-z0-9 </dev/urandom | head -c 8)"
echo "$pw" > /var/lib/lab/sniff-pw
lab_bg tds-web tds python3 -m http.server 80 --bind 10.70.0.20 --directory /tmp
lab_wait_port tds 10.70.0.20 80
lab_bg tdc-login tdc bash -c "while true; do curl -s -o /dev/null --data-urlencode 'user=admin' --data-urlencode 'password=$pw' http://10.70.0.20/login; sleep 2; done"
```

```bash check
want=$(cat /var/lib/lab/sniff-pw)
[ -f /home/student/sniffed.txt ] || fail "Нет ~/sniffed.txt"
got=$(tr -d '[:space:]' < /home/student/sniffed.txt)
[ "$got" = "$want" ] || fail "В ~/sniffed.txt «$got» — это не пароль из перехваченного запроса"
ok "пароль перехвачен — вот почему HTTP без TLS нельзя"
```

```text hint
1. Запустить захват на интерфейсе сервера (или клиента), отфильтровав по порту веб-сервера, без разрешения имён, с выводом содержимого пакетов в текстовом виде и ограничением числа пакетов.
2. Пароль идёт в теле POST-запроса в формате «поле=значение&...», спецсимволы в нём закодированы процентами (%40 — это @).
```

```bash solution
sudo ip netns exec lab-tds timeout 5 tcpdump -i eth0 -n -A -c 20 'tcp port 80' 2>/dev/null | grep -o 'password=[^& ]*' | head -1
pw=$(sudo ip netns exec lab-tds timeout 5 tcpdump -i eth0 -n -A -c 20 'tcp port 80' 2>/dev/null | grep -o 'password=[^& ]*' | head -1 | cut -d= -f2)
python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$pw" > ~/sniffed.txt
```

```text review
Эталон: `tcpdump -i eth0 -n -A 'tcp port 80'` → найти `password=...` в теле POST.

- Любой, кто видит трафик (сосед в Wi-Fi, провайдер, взломанный маршрутизатор, сосед по облачной сети), читает HTTP целиком. Поэтому всё с паролями, токенами и cookie — только через HTTPS, а внутри инфраструктуры — mTLS или хотя бы TLS между сервисами.
- Фильтры tcpdump (BPF): `host 10.70.0.10`, `port 80`, `tcp[tcpflags] & tcp-syn != 0`, `and`/`or`/`not`. `-w file.pcap` — сохранить для Wireshark, `-r file.pcap` — прочитать.
- `-A` — содержимое в ASCII, `-X` — hex + ASCII, `-s 0` — пакет целиком, `-c N` — остановиться после N пакетов.
- На проде tcpdump видит чужие данные — снимают дамп только с разрешения и коротко.
```

### Кто получает отказ

Клиент без конца пытается подключиться к какому-то TCP-порту сервера `10.70.0.20` и получает отказ — сервер отвечает сбросом соединения (RST). По захвату трафика определите **номер порта**, к которому ломится клиент, и запишите его в `~/rst-port.txt`.

```bash setup
rm -f /home/student/rst-port.txt
port=$(( RANDOM % 20000 + 20000 ))
echo $port > /var/lib/lab/rst-port
lab_bg tdc-knock tdc bash -c "while true; do timeout 1 bash -c '</dev/tcp/10.70.0.20/$port' 2>/dev/null; timeout 1 bash -c '</dev/tcp/10.70.0.20/80' 2>/dev/null; sleep 1; done"
```

```bash check
want=$(cat /var/lib/lab/rst-port)
[ -f /home/student/rst-port.txt ] || fail "Нет ~/rst-port.txt"
got=$(tr -d '[:space:]' < /home/student/rst-port.txt)
[ "$got" = "$want" ] || fail "В ~/rst-port.txt «$got» — клиент получает отказ на другом порту"
ok "клиент стучится в закрытый порт $want"
```

```text hint
1. Захватить трафик между машинами без разрешения имён и портов в названия.
2. Оставить только пакеты с флагом сброса соединения — у фильтра tcpdump есть доступ к флагам TCP. В выводе флаг сброса помечен буквой R.
3. Порт сервера — в адресе отправителя пакета сброса (после последней точки).
```

```bash solution
sudo ip netns exec lab-tds timeout 4 tcpdump -i eth0 -n -c 3 'tcp[tcpflags] & tcp-rst != 0' 2>/dev/null
sudo ip netns exec lab-tds timeout 4 tcpdump -i eth0 -n -c 1 'tcp[tcpflags] & tcp-rst != 0' 2>/dev/null | awk '{print $3}' | awk -F. '{print $NF}' > ~/rst-port.txt
```

```text review
Эталон: `tcpdump -n 'tcp[tcpflags] & tcp-rst != 0'` → порт в адресе отправителя RST.

- Флаги в выводе tcpdump: `[S]` — SYN, `[S.]` — SYN-ACK, `[.]` — ACK, `[P.]` — данные, `[F.]` — FIN, `[R]`/`[R.]` — сброс.
- RST в ответ на SYN = порт закрыт («Connection refused»). RST посреди соединения — сервер или файрвол рвёт соединение (перезапуск бэкенда, тайм-аут балансировщика).
- Рукопожатие целиком: `tcpdump -n 'tcp[tcpflags] & (tcp-syn|tcp-fin|tcp-rst) != 0'`.
- В Wireshark то же фильтром `tcp.flags.reset == 1`, а Statistics → Conversations покажет, кто с кем говорит.
```

## Тест

### Для чего нужен tcpdump?
- [ ] Для проверки DNS-записей
- [x] Для захвата и просмотра сетевых пакетов на интерфейсе
- [ ] Для сканирования портов
- [ ] Для настройки маршрутов
> Это «последний аргумент», когда логи и обычные проверки ничего не объясняют.

### Как захватить трафик PostgreSQL на всех интерфейсах, не резолвя имена?
= sudo tcpdump -i any -n port 5432
= tcpdump -i any -n port 5432
> `-n` экономит время и избавляет от лишних DNS-запросов.

### Как записать захваченный трафик в файл для разбора в Wireshark?
- [ ] tcpdump > cap.pcap
- [x] tcpdump -w cap.pcap
- [ ] tcpdump -r cap.pcap
- [ ] tcpdump -A cap.pcap
> `-r` — наоборот, прочитать сохранённый файл.

### Что означает флаг [R] в выводе tcpdump?
- [ ] Повторная передача
- [x] RST — сброс соединения
- [ ] Ответ на запрос
- [ ] Маршрутизация
> [S] — SYN, [S.] — SYN-ACK, [F.] — FIN, [P.] — данные.

### В tcpdump видны повторяющиеся пакеты [S] от клиента к серверу и ни одного ответа. Что вероятнее всего?
- [ ] Порт закрыт и отвечает RST
- [x] Пакеты или ответы теряются по дороге: файрвол с DROP, неверный маршрут или сервер недоступен
- [ ] Соединение установлено
- [ ] Ошибка в приложении
> Если бы порт был закрыт, пришёл бы RST.

### Чем фильтры захвата tcpdump отличаются от фильтров отображения Wireshark?
- [x] Фильтры захвата (BPF, например port 80) отбирают пакеты в момент захвата и пишутся в другом синтаксисе
- [x] Фильтры отображения Wireshark (например tcp.port == 80) только скрывают лишнее в уже захваченных данных
- [ ] Это одно и то же
- [ ] Фильтры захвата работают только в Windows
> Перепутать синтаксис — частая ошибка новичков.

### Зачем при захвате по SSH добавлять not port 22?
- [ ] Чтобы не сломать SSH
- [x] Чтобы не захватывать собственный SSH-трафик, по которому вам приходит вывод tcpdump
- [ ] Порт 22 нельзя захватывать
- [ ] Чтобы ускорить SSH
> Иначе вывод растёт лавинообразно.

### Какой фильтр Wireshark покажет только пакеты с флагом RST?
- [ ] tcp.port == rst
- [x] tcp.flags.reset == 1
- [ ] rst
- [ ] tcp[RST]
> Ещё полезный фильтр — `tcp.analysis.retransmission`.

### Какая функция Wireshark показывает весь диалог одного TCP-соединения как текст?
- [ ] Statistics → Summary
- [x] Follow → TCP Stream
- [ ] Capture → Options
- [ ] View → Zoom
> Удобно для разбора HTTP-запросов и ответов.

### Как в tcpdump увидеть содержимое HTTP-запросов в текстовом виде?
- [ ] tcpdump -n
- [x] tcpdump -A (содержимое в ASCII)
- [ ] tcpdump -c
- [ ] tcpdump -D
> Для HTTPS содержимое будет зашифрованным.

### Почему pcap-файлы нельзя выкладывать публично?
- [ ] Они слишком большие
- [x] В них могут быть пароли, токены, cookies и персональные данные
- [ ] Wireshark запрещает это лицензией
- [ ] Они содержат вирусы
> Храните захваты осторожно и удаляйте после разбора.

### Какой фильтр tcpdump отберёт трафик с хостом 10.0.0.7 только на портах 80 или 443?
- [x] 'host 10.0.0.7 and (port 80 or port 443)'
- [ ] host == 10.0.0.7 && port in (80,443)
- [ ] ip.addr == 10.0.0.7
- [ ] -host 10.0.0.7 -port 80,443
> Выражение лучше брать в кавычки, чтобы оболочка не трогала скобки.
