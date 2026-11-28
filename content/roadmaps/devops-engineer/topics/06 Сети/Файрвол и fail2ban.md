---
title: Файрвол и fail2ban
slug: fajrvol-i-fail2ban
description: Как устроен netfilter, цепочки и правила iptables, современный nftables, обёртки ufw и firewalld, и автоматическая блокировка перебора паролей через fail2ban.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: ArchWiki — nftables (на русском)
    url: https://wiki.archlinux.org/title/Nftables_(%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9)
    type: документация
  - title: nftables wiki — Quick reference, nftables in 10 minutes
    url: https://wiki.nftables.org/wiki-nftables/index.php/Quick_reference-nftables_in_10_minutes
    type: документация
  - title: Хабр — Краткое пособие по переходу с iptables на nftables
    url: https://habr.com/ru/post/580648
    type: статья
  - title: DigitalOcean — Настройка брандмауэра UFW (на русском)
    url: https://www.digitalocean.com/community/tutorials/how-to-set-up-a-firewall-with-ufw-on-ubuntu-20-04-ru
    type: статья
  - title: ArchWiki — Fail2ban
    url: https://wiki.archlinux.org/title/Fail2ban
    type: документация
---

# Файрвол и fail2ban

Файрвол решает, какие пакеты пропустить, а какие отбросить. В Linux фильтрацию выполняет подсистема ядра **netfilter**. Управлять ей можно напрямую (iptables, nftables) или через удобные обёртки (ufw, firewalld). Docker и Kubernetes тоже активно пишут свои правила в netfilter, поэтому понимать его основы нужно.

## netfilter: таблицы, цепочки, правила

Пакет проходит через **цепочки** — точки, где проверяются правила:

| Цепочка | Какие пакеты |
| --- | --- |
| **INPUT** | Пришедшие на эту машину |
| **OUTPUT** | Созданные этой машиной |
| **FORWARD** | Проходящие через машину транзитом (маршрутизатор, Docker, Kubernetes) |
| PREROUTING / POSTROUTING | До и после маршрутизации — здесь работает NAT |

Правила в цепочке проверяются **сверху вниз**, срабатывает первое подходящее. Если ни одно не подошло — применяется **политика** цепочки (ACCEPT или DROP).

Действия:

- **ACCEPT** — пропустить;
- **DROP** — молча отбросить: клиент ждёт до таймаута;
- **REJECT** — отбросить и сообщить отправителю: клиент сразу видит «Connection refused»;
- **DNAT / SNAT / MASQUERADE** — изменить адрес (проброс портов, выход в интернет через NAT).

**Stateful**-фильтрация: netfilter отслеживает соединения (conntrack). Правило «пропускать пакеты ESTABLISHED,RELATED» разрешает ответы на исходящие соединения, не открывая порты.

## iptables

```bash
sudo iptables -L -n -v --line-numbers       # правила таблицы filter
sudo iptables -t nat -L -n -v               # правила NAT
# Базовый stateful-файрвол:
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -A INPUT -p tcp -s 10.0.0.0/24 --dport 5432 -j ACCEPT
sudo iptables -P INPUT DROP                 # политика по умолчанию — в самом конце!
sudo iptables -D INPUT 3                    # удалить правило №3
```

Правила iptables живут в памяти и пропадают после перезагрузки. Сохранение — `iptables-save > /etc/iptables/rules.v4` и пакет `iptables-persistent`.

## nftables

Современная замена iptables: единый синтаксис для IPv4 и IPv6, атомарная загрузка всего набора правил. В новых дистрибутивах команда `iptables` часто работает поверх nftables (`iptables-nft`).

```
# /etc/nftables.conf
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    tcp dport 22 accept
    tcp dport { 80, 443 } accept
    ip saddr 10.0.0.0/24 tcp dport 5432 accept
    icmp type echo-request limit rate 5/second accept
  }
}
```

```bash
sudo nft list ruleset
sudo nft -c -f /etc/nftables.conf     # проверить файл без применения
sudo systemctl enable --now nftables  # загрузить правила при старте
```

## Обёртки: ufw и firewalld

- **ufw** (Ubuntu) — простой интерфейс: `ufw allow 22/tcp`, `ufw deny 23`, `ufw status numbered`, `ufw delete 3`. Разобран в теме «Первичная настройка сервера».
- **firewalld** (RHEL-семейство) — зоны и сервисы: `firewall-cmd --permanent --add-service=https`, `firewall-cmd --reload`, `firewall-cmd --list-all`.

Используйте **один** инструмент: ufw, firewalld и ручные правила iptables одновременно конфликтуют.

> [!warning] Docker и файрвол
> Docker сам добавляет правила NAT и FORWARD для опубликованных портов (`-p 8080:80`). Такие порты оказываются доступны снаружи **в обход правил ufw**: трафик идёт через цепочку FORWARD, а не через INPUT. Публикуйте порты только на нужном адресе (`-p 127.0.0.1:8080:80`) или фильтруйте в цепочке `DOCKER-USER`.

## fail2ban

**fail2ban** читает логи (или journald), находит повторяющиеся неудачные попытки — входа по SSH, авторизации в nginx — и **временно блокирует IP** через файрвол.

```bash
sudo apt install fail2ban
sudo tee /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 10.0.0.0/8

[sshd]
enabled = true
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd                    # сколько заблокировано
sudo fail2ban-client set sshd unbanip 203.0.113.50  # разблокировать
```

- Настройки пишут в `jail.local` (или `jail.d/*.local`), а не в `jail.conf`: его перезапишет обновление пакета.
- **jail** = фильтр (регулярные выражения для логов) + действие (бан в файрволе) + параметры.
- `maxretry` попыток за `findtime` → бан на `bantime`.
- Добавьте свой адрес в `ignoreip`, чтобы не заблокировать себя.
- Если вход по паролю в SSH отключён, fail2ban в основном сокращает шум в логах и нагрузку — главная защита уже обеспечена ключами.

## Практика

- [ ] Посмотреть текущие правила: `sudo iptables -L -n -v` и `sudo nft list ruleset` — что туда добавили ufw и Docker
- [ ] На тестовой ВМ собрать базовый stateful-файрвол на nftables по примеру выше и проверить доступ к портам с другой машины
- [ ] Сравнить поведение клиента при DROP и REJECT (таймаут против Connection refused)
- [ ] Установить fail2ban, включить jail sshd, с другой машины несколько раз ввести неверный пароль и увидеть бан в `fail2ban-client status sshd`
- [ ] Запустить контейнер с `-p 8080:80` при включённом ufw и проверить, доступен ли порт снаружи; затем опубликовать его на `127.0.0.1`

## Лаборатория

### Файрвол с состоянием на nftables

Сервер `lab-fw` (10.80.0.2) подключён к стенду (10.80.0.1). На нём слушают порты 22, 80, 5432 и 8080. Настройте на **`lab-fw`** входящий файрвол на nftables:

- всё входящее по умолчанию **отбрасывается** (DROP — клиент получает тайм-аут, а не отказ);
- разрешены: loopback, ответы на соединения, которые сервер открыл сам, и входящие **TCP 22 и 80**;
- исходящие соединения сервера продолжают работать.

Команды внутри сервера: `sudo ip netns exec lab-fw nft ...`. Сохранять правила в файл не нужно.

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
lab_ns fw
lab_link - labfw0 10.80.0.1/24 fw eth0 10.80.0.2/24
cat > /opt/lab-listen.py <<'EOF'
import socket, sys, threading
def serve(host, port):
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((host, port)); s.listen(50)
    while True:
        c, _ = s.accept(); c.close()
host = sys.argv[1]
for p in sys.argv[2:]:
    threading.Thread(target=serve, args=(host, int(p)), daemon=True).start()
threading.Event().wait()
EOF
lab_bg fw-listen fw python3 /opt/lab-listen.py 0.0.0.0 22 80 5432 8080
systemctl stop lab-net-fw-out 2>/dev/null
systemd-run -q --unit=lab-net-fw-out python3 /opt/lab-listen.py 10.80.0.1 9999
lab_wait_port fw 0.0.0.0 8080
```

```bash check
t() { timeout 3 bash -c "</dev/tcp/10.80.0.2/$1" 2>/dev/null; echo $?; }
[ "$(t 22)" = 0 ] || fail "Порт 22 на lab-fw недоступен со стенда"
[ "$(t 80)" = 0 ] || fail "Порт 80 на lab-fw недоступен со стенда"
r=$(t 5432); [ "$r" = 0 ] && fail "Порт 5432 открыт"
[ "$r" = 124 ] || fail "Порт 5432 закрыт отказом (Connection refused), а нужно молча отбрасывать пакеты"
r=$(t 8080); [ "$r" = 0 ] && fail "Порт 8080 открыт — всё, что не разрешено явно, должно отбрасываться"
[ "$r" = 124 ] || fail "Порт 8080 закрыт отказом, а не отбрасыванием"
ip netns exec lab-fw timeout 3 bash -c '</dev/tcp/10.80.0.1/9999' 2>/dev/null || fail "Исходящие соединения с lab-fw перестали работать — ответы на них отбрасываются"
ok "22, 80 — открыты; остальное — DROP; исходящие работают"
```

```text hint
1. Создать таблицу и цепочку для входящего трафика с политикой «отбросить» (тип filter, хук input).
2. Правила по порядку: разрешить состояние «установлено/связано» (ответы на свои соединения), разрешить loopback-интерфейс, разрешить новые соединения на два TCP-порта.
3. Посмотреть получившийся набор правил и проверить порты со стенда с ограничением по времени.
```

```bash solution
sudo ip netns exec lab-fw nft -f - <<'EOF'
flush ruleset
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    iif "lo" accept
    tcp dport { 22, 80 } accept
  }
}
EOF
sudo ip netns exec lab-fw nft list ruleset
nc -zv -w2 10.80.0.2 80; nc -zv -w2 10.80.0.2 5432 || true
```

```text review
Эталон — в «Решении»: `policy drop` + `ct state established,related accept` + `iif lo accept` + `tcp dport { 22, 80 } accept`.

- `ct state established,related` — сердце stateful-файрвола: ответы на исходящие соединения (DNS, apt, запросы к API) проходят без отдельных правил. Без этой строки сервер «теряет интернет».
- DROP — тайм-аут у клиента (сканеру меньше информации), REJECT — мгновенный отказ (удобнее для своих сервисов). Для внешнего периметра обычно DROP.
- На настоящем сервере правила сохраняют в `/etc/nftables.conf` + `systemctl enable nftables`; в Ubuntu чаще ufw (`ufw default deny incoming`, `ufw allow 22/tcp`), а под капотом всё равно nftables.
- **Всегда** разрешайте SSH до включения политики DROP на удалённом сервере — иначе отрежете себя.
- Docker пишет свои правила в обход ufw: опубликованный `-p 8080:80` открыт наружу даже при `ufw deny`. Публикуйте на `127.0.0.1:8080:80` или используйте цепочку `DOCKER-USER`.
```

```text notes
reject => Использовался REJECT — по условию нужен DROP (тишина вместо отказа).
```

### Бан за подбор пароля

Приложение `labapp` пишет неудачные входы в `/var/log/labapp/auth.log` строками вида `2026-11-28 10:15:02 labapp: login failed for user=root from=10.90.0.5`.

Настройте **fail2ban**: jail `labapp` с фильтром для таких строк, который банит IP после **3** неудачных попыток за 10 минут на 1 час. Служба fail2ban должна работать. Проверка сама допишет в лог несколько попыток с разных адресов и посмотрит, кого забанят.

```bash setup
systemctl stop fail2ban 2>/dev/null
rm -f /etc/fail2ban/jail.d/labapp*.conf /etc/fail2ban/filter.d/labapp*.conf
mkdir -p /var/log/labapp
: > /var/log/labapp/auth.log
```

```bash check
[ "$(systemctl is-active fail2ban)" = active ] || fail "Служба fail2ban не работает: $(journalctl -u fail2ban -n 2 --no-pager -o cat | tr '\n' ' ')"
fail2ban-client status labapp >/dev/null 2>&1 || fail "В fail2ban нет jail labapp (fail2ban-client status labapp)"
fail2ban-client unban 10.90.0.5 10.90.0.6 >/dev/null 2>&1
a="10.90.$((RANDOM % 200 + 1)).$((RANDOM % 200 + 1))"; b="10.91.$((RANDOM % 200 + 1)).$((RANDOM % 200 + 1))"
for i in 1 2 3 4; do echo "$(date '+%Y-%m-%d %H:%M:%S') labapp: login failed for user=root from=$a" >> /var/log/labapp/auth.log; sleep 0.3; done
echo "$(date '+%Y-%m-%d %H:%M:%S') labapp: login failed for user=admin from=$b" >> /var/log/labapp/auth.log
for i in $(seq 30); do fail2ban-client status labapp 2>/dev/null | grep -q "$a" && break; sleep 0.5; done
st=$(fail2ban-client status labapp)
echo "$st" | grep -q "$a" || fail "После 4 неудачных попыток с $a бана нет. Сейчас: $(echo "$st" | grep -E 'Currently failed|Total failed' | tr -s ' \t' ' ' | tr '\n' ';')"
echo "$st" | grep -q "$b" && fail "Забанен $b после одной попытки — порог не 3"
f2b() { fail2ban-client get labapp "$1" 2>/dev/null; }
[ "$(f2b maxretry)" = 3 ] || fail "Порог попыток — $(f2b maxretry)"
[ "$(f2b findtime)" = 600 ] || fail "Окно подсчёта попыток — $(f2b findtime) с"
[ "$(f2b bantime)" = 3600 ] || fail "Срок бана — $(f2b bantime) с"
fail2ban-client unban "$a" >/dev/null 2>&1
ok "jail labapp банит после 3 попыток: $a забанен, $b — нет"
```

```text hint
1. Фильтр — файл в каталоге фильтров fail2ban: раздел Definition и регулярное выражение для неудачной попытки, где адрес нарушителя заменён специальной меткой.
2. Jail — свой файл в каталоге дополнений: включён, какой фильтр, какой лог, порог попыток, окно и время бана (в секундах или с суффиксами m/h).
3. Проверить регулярное выражение на строке лога можно утилитой fail2ban-regex. Затем запустить службу и посмотреть статус jail.
```

```bash solution
sudo tee /etc/fail2ban/filter.d/labapp.conf >/dev/null <<'EOF'
[Definition]
failregex = labapp: login failed for user=\S+ from=<HOST>\s*$
ignoreregex =
EOF
sudo tee /etc/fail2ban/jail.d/labapp.conf >/dev/null <<'EOF'
[labapp]
enabled  = true
filter   = labapp
logpath  = /var/log/labapp/auth.log
backend  = auto
maxretry = 3
findtime = 10m
bantime  = 1h
EOF
fail2ban-regex "2026-11-28 10:15:02 labapp: login failed for user=root from=10.90.0.5" /etc/fail2ban/filter.d/labapp.conf | grep -E '^(Failregex|Lines)'
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
sleep 2
sudo fail2ban-client status labapp
```

```text review
Эталон: фильтр `filter.d/labapp.conf` с `failregex` и `<HOST>` + jail в `jail.d/labapp.conf` (`maxretry = 3`, `findtime = 10m`, `bantime = 1h`).

- `<HOST>` — метка, куда fail2ban подставляет шаблон IP; по ней он понимает, кого банить.
- Свои настройки — только в `jail.d/*.conf` или `jail.local`: `jail.conf` перезапишется при обновлении пакета.
- `fail2ban-regex <лог или строка> <фильтр>` — проверить фильтр до включения: сколько строк совпало.
- Банит fail2ban правилами iptables/nftables (`banaction`); разбанить — `fail2ban-client set labapp unbanip <IP>`. Для sshd в Ubuntu jail включён по умолчанию.
- Защитит от массового перебора, но не заменит ключи вместо паролей и закрытые наружу порты.
```

## Тест

### Какая подсистема ядра Linux выполняет фильтрацию пакетов?
= netfilter
> iptables, nftables, ufw и firewalld — инструменты управления ей.

### Через какую цепочку проходят пакеты, адресованные самой машине?
- [ ] OUTPUT
- [x] INPUT
- [ ] FORWARD
- [ ] POSTROUTING
> FORWARD — транзитные пакеты, OUTPUT — исходящие от самой машины.

### В каком порядке проверяются правила в цепочке?
- [ ] Сначала самые строгие
- [x] Сверху вниз; срабатывает первое подходящее, а если ни одно не подошло — политика цепочки
- [ ] Снизу вверх
- [ ] В случайном порядке
> Поэтому порядок правил важен.

### Чем DROP отличается от REJECT?
- [x] DROP молча отбрасывает пакет — клиент ждёт до таймаута
- [x] REJECT отбрасывает пакет и сообщает отправителю — клиент сразу получает ошибку
- [ ] REJECT пропускает пакет с задержкой
- [ ] Это одно и то же
> Это объясняет разницу между таймаутом и Connection refused при диагностике.

### Зачем нужно правило, разрешающее состояния ESTABLISHED и RELATED?
- [ ] Чтобы открыть все порты
- [x] Чтобы пропускать ответы на соединения, которые машина установила сама, не открывая лишних портов
- [ ] Чтобы включить NAT
- [ ] Чтобы ускорить DNS
> Это основа stateful-файрвола.

### Почему опасно сначала выполнить iptables -P INPUT DROP на удалённом сервере, а потом добавлять правила?
- [ ] Это удалит все правила
- [x] Политика DROP сразу оборвёт SSH-соединение, если правило для SSH ещё не добавлено
- [ ] iptables не позволит это сделать
- [ ] Ничего страшного не произойдёт
> Сначала разрешающие правила, политику — в конце. А лучше загружать правила атомарно через nftables.

### Что происходит с правилами iptables после перезагрузки, если их не сохранить?
- [ ] Сохраняются автоматически
- [x] Пропадают: правила хранятся в памяти ядра
- [ ] Переносятся в ufw
- [ ] Становятся правилами nftables
> Сохранение — iptables-save и пакет iptables-persistent или конфиг nftables.

### Чем nftables лучше iptables?
- [x] Единый синтаксис для IPv4 и IPv6
- [x] Атомарная загрузка всего набора правил из файла
- [ ] nftables не требует ядра Linux
- [ ] nftables работает только в Docker
> В новых дистрибутивах iptables часто является оболочкой над nftables.

### Почему порт, опубликованный через docker run -p 8080:80, может быть доступен снаружи даже при запрещающих правилах ufw?
- [ ] ufw не работает с портами выше 1024
- [x] Docker добавляет свои правила NAT и FORWARD, и трафик к контейнеру не проходит через цепочку INPUT, которую настраивает ufw
- [ ] Docker отключает ufw при установке
- [ ] Это ошибка в ufw, которую нужно чинить переустановкой
> Публикуйте порт на 127.0.0.1 или фильтруйте в цепочке DOCKER-USER.

### Что делает fail2ban?
- [ ] Шифрует SSH-трафик
- [x] Находит в логах повторяющиеся неудачные попытки входа и временно блокирует IP-адреса через файрвол
- [ ] Обновляет пароли пользователей
- [ ] Сканирует порты
> Реагирует по логам: сначала попытки, потом бан.

### Где правильно задавать свои настройки fail2ban?
- [ ] В /etc/fail2ban/jail.conf
- [x] В /etc/fail2ban/jail.local или файлах в jail.d/*.local
- [ ] В /etc/ssh/sshd_config
- [ ] В /etc/ufw/user.rules
> jail.conf перезаписывается при обновлении пакета.

### Как посмотреть, какие IP заблокированы в jail sshd?
= sudo fail2ban-client status sshd
= fail2ban-client status sshd
> Разблокировать — `fail2ban-client set sshd unbanip IP`.

### Какие параметры fail2ban задают «5 неудачных попыток за 10 минут — бан на час»?
- [x] maxretry = 5, findtime = 10m, bantime = 1h
- [ ] retries = 5, window = 10m, block = 1h
- [ ] limit = 5/10m, ban = 1h
- [ ] attempts = 5, period = 10m, jail = 1h
> Не забудьте добавить свой адрес в ignoreip.
