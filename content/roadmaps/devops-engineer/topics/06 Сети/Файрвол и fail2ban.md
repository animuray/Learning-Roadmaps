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
