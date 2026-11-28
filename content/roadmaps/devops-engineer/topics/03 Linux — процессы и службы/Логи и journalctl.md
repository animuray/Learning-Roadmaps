---
title: Логи и journalctl
slug: logi-i-journalctl
description: Где Linux хранит логи — journald и /var/log, как искать в journalctl, уровни syslog и ротация логов через logrotate.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: man7 — journalctl(1)
    url: https://www.man7.org/linux/man-pages/man1/journalctl.1.html
    type: документация
  - title: ArchWiki — systemd (на русском), раздел про журнал
    url: https://wiki.archlinux.org/title/Systemd_(%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9)
    type: документация
---

# Логи и journalctl

Когда что-то сломалось, первым делом смотрят логи. В Linux два основных места для логов: журнал **systemd-journald** (смотрится через `journalctl`) и текстовые файлы в **/var/log**.

## Кто пишет логи

- **journald** собирает stdout и stderr всех служб systemd, сообщения ядра и syslog. Журнал хранится в бинарном формате: в `/run/log/journal` (пропадает при перезагрузке) или в `/var/log/journal` (сохраняется). Постоянное хранение задаётся `Storage=persistent` в `/etc/systemd/journald.conf`. Также оно включается, если создан каталог `/var/log/journal`.
- **rsyslog** (если установлен) пишет текстовые файлы в `/var/log`.
- Многие приложения пишут логи сами: `/var/log/nginx/`, `/var/log/postgresql/`.

| Файл | Что там |
| --- | --- |
| `/var/log/syslog` (Debian/Ubuntu), `/var/log/messages` (RHEL) | Общий системный лог |
| `/var/log/auth.log` (Debian/Ubuntu), `/var/log/secure` (RHEL) | Входы, sudo, SSH |
| `/var/log/kern.log`, `dmesg` | Сообщения ядра |
| `/var/log/nginx/access.log`, `error.log` | Запросы и ошибки nginx |
| `/var/log/apt/`, `/var/log/dnf.log` | Установка пакетов |

## journalctl

```bash
journalctl -u nginx                 # логи службы
journalctl -u nginx -f              # следить в реальном времени
journalctl -u nginx -n 100          # последние 100 строк
journalctl -u nginx --since "1 hour ago"
journalctl --since "2024-06-01 10:00" --until "2024-06-01 11:00"
journalctl -b                       # с момента текущей загрузки
journalctl -b -1                    # предыдущая загрузка — что было перед падением
journalctl -p err -b                # только ошибки и серьёзнее
journalctl -k                       # сообщения ядра (как dmesg)
journalctl _PID=1234                # по PID
journalctl -u myapp -o json-pretty  # структурированный вывод со всеми полями
journalctl --disk-usage             # сколько места занимает журнал
sudo journalctl --vacuum-size=500M  # почистить до 500 МБ
sudo journalctl --vacuum-time=14d   # удалить записи старше 14 дней
```

Флаги можно сочетать: `journalctl -u myapp -p warning --since today`.

## Уровни важности (syslog)

| Код | Уровень | Когда |
| --- | --- | --- |
| 0 | emerg | Система неработоспособна |
| 1 | alert | Нужно действовать немедленно |
| 2 | crit | Критическая ошибка |
| 3 | **err** | Ошибка |
| 4 | **warning** | Предупреждение |
| 5 | notice | Важное, но нормальное событие |
| 6 | **info** | Информационное сообщение |
| 7 | debug | Отладка |

`-p err` покажет уровни 0–3. Написать в журнал из скрипта: `logger -p user.err "Бэкап не удался"` или `echo "..." | systemd-cat -t backup`.

## logrotate — ротация логов

Логи растут бесконечно и рано или поздно заполняют диск. **logrotate** (обычно запускается раз в сутки таймером или cron) переименовывает текущий файл, сжимает старые и удаляет совсем старые.

```
# /etc/logrotate.d/myapp
# daily — раз в день (или weekly, monthly, size 100M)
# rotate 14 — хранить 14 старых файлов
# delaycompress — не сжимать самый свежий архив: приложение может ещё писать в него
# create — создать новый пустой файл с такими правами и владельцем
# postrotate — сказать приложению переоткрыть файл
/var/log/myapp/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 myapp myapp
    postrotate
        systemctl kill -s USR1 myapp.service
    endscript
}
```

Комментарии в конфигах logrotate и systemd пишут только на отдельных строках: текст после директивы на той же строке будет считаться частью значения.

Если приложение не умеет переоткрывать файл по сигналу, используют `copytruncate`: файл копируется, а оригинал обрезается до нуля. Немного строк при этом может потеряться.

```bash
sudo logrotate -d /etc/logrotate.d/myapp   # пробный прогон: покажет, что будет сделано
sudo logrotate -f /etc/logrotate.d/myapp   # принудительная ротация
```

> [!warning] Удалили лог, а место не освободилось
> Если удалить огромный лог через `rm`, а процесс продолжает писать в открытый файл, место освободится только после закрытия файла. Найти такие файлы: `lsof +L1`. Правильно очищать работающий лог так: `truncate -s 0 file.log` или `: > file.log`.

## Практика

- [ ] Посмотреть логи sshd за последний час и найти свои входы
- [ ] Найти все ошибки текущей загрузки: `journalctl -p err -b`
- [ ] Посмотреть логи предыдущей загрузки (если журнал постоянный) или включить постоянное хранение
- [ ] Найти в `/var/log/auth.log` или `/var/log/secure` неудачные попытки входа по SSH
- [ ] Написать конфиг logrotate для логов своего приложения и проверить его через `logrotate -d`
- [ ] Отправить сообщение из скрипта в журнал через `logger` и найти его в `journalctl`

## Лаборатория

### Найти ошибку в журнале

Служба `billing` пишет в системный журнал много сообщений об оплатах. Среди них есть ошибки. Найдите **последнее** сообщение уровня `err` от `billing` и запишите номер заказа из него (только число) в `~/order.txt`.

```bash setup
rm -f /home/student/order.txt
systemd-tmpfiles --create --prefix /var/log/journal >/dev/null 2>&1
for i in $(seq 1 25); do echo "payment ok order=$((RANDOM % 90000 + 10000)) amount=$((RANDOM % 5000))" | systemd-cat -t billing -p info; done
id=$((RANDOM % 90000 + 10000))
echo "payment failed order=$id: card declined" | systemd-cat -t billing -p err
for i in $(seq 1 10); do echo "payment ok order=$((RANDOM % 90000 + 10000)) amount=$((RANDOM % 5000))" | systemd-cat -t billing -p info; done
echo "$id" > /var/lib/lab/billing-order
sleep 1
```

```bash check
want=$(cat /var/lib/lab/billing-order)
[ -f /home/student/order.txt ] || fail "Нет ~/order.txt"
got=$(tr -d '[:space:]' < /home/student/order.txt)
[ "$got" = "$want" ] || fail "В ~/order.txt «$got» — это не номер заказа из последней ошибки billing"
ok "последняя ошибка billing: заказ $want"
```

```text hint
1. У просмотрщика журнала есть фильтры: по идентификатору программы, по уровню важности и по количеству последних записей.
2. Формат вывода «только текст сообщения» уберёт дату и имя хоста — номер станет проще вырезать.
```

```bash solution
journalctl -t billing -p err -n 1 --no-pager -o cat
journalctl -t billing -p err -n 1 --no-pager -o cat | grep -o 'order=[0-9]*' | cut -d= -f2 > ~/order.txt
```

```text review
Эталон: `journalctl -t billing -p err -n 1 -o cat`.

- Фильтры journalctl: `-u nginx` — юнит, `-t billing` — идентификатор (SYSLOG_IDENTIFIER), `-p err` — уровень **и важнее** (`err`, `crit`, `alert`, `emerg`), `--since "10 min ago"`, `-b` — текущая загрузка, `-f` — следить.
- `-o cat` — только текст; `-o json` — все поля, удобно для разбора скриптом.
- Писать в журнал из скриптов: `logger -t myapp -p user.err "текст"` или `echo текст | systemd-cat -t myapp -p err`.
- `grep error` по тексту найдёт и «0 errors», и пропустит «FAILED». Уровень важности надёжнее — если программа его честно ставит.
```

```text notes
grep\s+-i?\s*['"]?(error|failed|err)\b => Ошибки искались grep по тексту. Работает, но фильтр journalctl -p err по уровню надёжнее: он не цепляет «0 errors» в обычных сообщениях.
```

### Журнал, который переживает перезагрузку

На этом сервере журнал хранится только в памяти: после перезагрузки все логи пропадают, разбирать причину сбоя не по чему. Сделайте хранение журнала **постоянным** — на диске — и примените настройку без перезагрузки сервера.

```bash setup
mkdir -p /etc/systemd/journald.conf.d
find /etc/systemd/journald.conf.d -name '*.conf' ! -name '10-lab.conf' -delete
printf '[Journal]\nStorage=volatile\n' > /etc/systemd/journald.conf.d/10-lab.conf
sed -i 's/^Storage=.*/#Storage=auto/' /etc/systemd/journald.conf
rm -rf /var/log/journal
systemctl restart systemd-journald
```

```bash check
eff=$(systemd-analyze cat-config systemd/journald.conf 2>/dev/null | grep -E '^Storage=' | tail -1 | cut -d= -f2)
[ "$eff" = persistent ] || [ "$eff" = auto ] || fail "Итоговая настройка хранения журнала — «${eff:-по умолчанию}»: журнал живёт только в памяти"
ls /var/log/journal/*/system.journal >/dev/null 2>&1 || fail "Журнал не пишется на диск: файлов в /var/log/journal нет (journald не перезапущен или настройка не применилась)"
ok "Storage=$eff, журнал на диске: $(du -sh /var/log/journal | cut -f1)"
```

```text hint
1. Настройки journald собираются из основного файла и из каталога дополнений рядом с ним; значения из дополнений важнее, а среди дополнений побеждает файл, который идёт последним по имени. Посмотрите итоговый конфиг — у systemd-analyze есть команда, которая склеивает все части.
2. Нужный режим хранения задаётся одной строкой в разделе журнала.
3. Перезапустить саму службу журнала — она создаст каталог на диске.
```

```bash solution
systemd-analyze cat-config systemd/journald.conf | grep -E '^(#|Storage)' | grep -v '^#  ' | tail -5
printf '[Journal]\nStorage=persistent\n' | sudo tee /etc/systemd/journald.conf.d/50-persistent.conf >/dev/null
sudo systemctl restart systemd-journald
sudo systemd-tmpfiles --create --prefix /var/log/journal
journalctl --disk-usage
```

```text review
Эталон: drop-in `/etc/systemd/journald.conf.d/50-persistent.conf` со `Storage=persistent` → `systemctl restart systemd-journald`.

- Ловушка задачи: правка основного `/etc/systemd/journald.conf` не помогла бы — дополнение `10-lab.conf` с `volatile` важнее. `systemd-analyze cat-config` показывает, кто что задал. Так же устроены `sshd_config.d`, `sysctl.d`, unit-файлы с drop-in.
- `Storage=auto` (по умолчанию) пишет на диск, **если** существует `/var/log/journal`. `persistent` создаёт каталог сам — но без прав для группы `systemd-journal` и `adm`: обычные пользователи из этих групп перестанут видеть журнал. Права выставляет `systemd-tmpfiles --create --prefix /var/log/journal` (при загрузке это происходит само).
- Размер ограничивают `SystemMaxUse=500M` или чисткой: `journalctl --vacuum-time=14d`, `--vacuum-size=1G`.
- Посмотреть прошлую загрузку: `journalctl --list-boots`, `journalctl -b -1 -p err` — главный инструмент после внезапной перезагрузки.
```

```text notes
journald\.conf(?!\.d) => Правился основной journald.conf — в этой системе дополнения из journald.conf.d важнее его. Смотрите итоговую картину: systemd-analyze cat-config systemd/journald.conf.
```

### Ротация логов приложения

Приложение пишет логи в `/var/log/labapp/*.log`, и они растут бесконечно. Настройте **logrotate** для этих файлов: ротация каждый день, хранить 7 старых файлов, сжимать их, не ругаться на отсутствующие файлы и не ротировать пустые.

```bash setup
rm -f /etc/logrotate.d/labapp
rm -rf /var/log/labapp
mkdir -p /var/log/labapp
for f in app worker; do for i in $(seq 1 200); do echo "2026-11-28 12:00:$((i % 60)) INFO $f event $i"; done > /var/log/labapp/$f.log; done
```

```bash check
c=/etc/logrotate.d/labapp
[ -f $c ] || fail "Нет конфигурации /etc/logrotate.d/labapp"
grep -q '/var/log/labapp/\*\.log' $c || fail "В конфигурации нет шаблона /var/log/labapp/*.log"
grep -qwE '^[[:space:]]*daily' $c || fail "Не задана ежедневная ротация"
grep -qwE '^[[:space:]]*compress' $c || fail "Старые файлы не сжимаются"
grep -qwE '^[[:space:]]*missingok' $c || fail "Если файла нет, logrotate выдаст ошибку — не задан пропуск отсутствующих файлов"
grep -qwE '^[[:space:]]*notifempty' $c || fail "Пустые файлы тоже будут ротироваться"
grep -qE '^[[:space:]]*rotate[[:space:]]+7[[:space:]]*$' $c || fail "Число хранимых старых файлов не равно 7"
out=$(logrotate -d $c 2>&1) || fail "logrotate находит ошибку в конфигурации: $(echo "$out" | grep -iE 'error' | head -1)"
logrotate -f -s /tmp/lab-logrotate.state $c >/dev/null 2>&1 || fail "Принудительная ротация завершилась ошибкой"
ls /var/log/labapp/app.log.1* >/dev/null 2>&1 || fail "После ротации нет app.log.1 — конфигурация не срабатывает"
ok "ротация работает: $(ls /var/log/labapp | tr '\n' ' ')"
```

```text hint
1. Свой файл для приложения — в каталоге дополнительных конфигураций logrotate.
2. Структура: шаблон путей и фигурные скобки, внутри — директивы по одной на строку: периодичность, сколько хранить, сжатие и два «вежливых» правила для пустых и отсутствующих файлов.
3. Проверить конфигурацию в режиме отладки (ничего не меняет), а затем — принудительной ротацией.
```

```bash solution
sudo tee /etc/logrotate.d/labapp >/dev/null <<'EOF'
/var/log/labapp/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
EOF
sudo logrotate -d /etc/logrotate.d/labapp
```

```text review
Эталон — блок `/var/log/labapp/*.log { daily; rotate 7; compress; missingok; notifempty }`.

- `logrotate -d` — сухой прогон с объяснением, `-f` — принудительно сейчас. Запускается он раз в сутки таймером `logrotate.timer` (или cron).
- `delaycompress` — не сжимать самый свежий архив (`app.log.1`): программа может ещё дописывать в него.
- Программа держит файл открытым: после переименования она продолжит писать в `app.log.1`. Решения: `postrotate` с `systemctl reload app` (программа переоткроет файл) или `copytruncate` (скопировать и обнулить — возможна потеря строк).
- `maxsize 100M` — ротировать раньше срока, если файл вырос; `dateext` — суффикс с датой вместо номера.
```

## Тест

### Как посмотреть логи службы nginx в journald?
= journalctl -u nginx
> Добавьте `-f`, чтобы следить в реальном времени, или `-n 100` для последних строк.

### Как вывести сообщения журнала только с момента текущей загрузки?
- [ ] journalctl -n
- [x] journalctl -b
- [ ] journalctl --now
- [ ] journalctl -k
> `-b -1` — предыдущая загрузка: удобно, чтобы понять, почему сервер упал.

### Как показать только ошибки и более серьёзные сообщения?
- [ ] journalctl --errors-only
- [x] journalctl -p err
- [ ] journalctl -e
- [ ] journalctl | grep -v info
> Уровни syslog: 0 emerg … 3 err … 7 debug. `-p err` покажет 0–3.

### В каком файле в Ubuntu искать неудачные попытки входа по SSH?
- [ ] /var/log/syslog.ssh
- [x] /var/log/auth.log
- [ ] /var/log/kern.log
- [ ] /etc/ssh/log
> В RHEL-семействе — `/var/log/secure`.

### Почему после перезагрузки сервера journalctl -b -1 говорит, что предыдущей загрузки нет?
- [ ] Журнал всегда хранит только текущую загрузку
- [x] Журнал хранится в /run/log/journal (в памяти); нужно включить постоянное хранение в /var/log/journal
- [ ] Нужно перезапустить journald
- [ ] Не хватает прав
> Постоянное хранение: `Storage=persistent` в journald.conf или создание каталога `/var/log/journal`.

### Зачем нужен logrotate?
- [ ] Чтобы пересылать логи на другой сервер
- [x] Чтобы регулярно ротировать логи: переименовывать, сжимать и удалять старые, не давая им заполнить диск
- [ ] Чтобы шифровать логи
- [ ] Чтобы перезапускать службы по расписанию
> Конфиги для отдельных приложений лежат в `/etc/logrotate.d/`.

### Что делает директива rotate 14 в конфиге logrotate?
- [ ] Ротирует лог каждые 14 дней
- [x] Хранит 14 старых файлов, более старые удаляет
- [ ] Ротирует, когда файл больше 14 МБ
- [ ] Поворачивает лог на 14 строк
> Частота задаётся отдельно: daily, weekly, monthly или size.

### Когда в logrotate используют copytruncate?
- [ ] Всегда, это лучший вариант
- [x] Когда приложение не умеет переоткрывать лог-файл по сигналу: файл копируется, а оригинал обрезается до нуля
- [ ] Для сжатия логов
- [ ] Для пересылки логов
> Минус: строки, записанные между копированием и обрезкой, теряются.

### Огромный лог удалили через rm, а df показывает, что место не освободилось. Почему?
- [ ] df кэширует результат
- [x] Процесс держит удалённый файл открытым: место освободится, когда файл будет закрыт
- [ ] rm перемещает файлы в корзину
- [ ] Нужно выполнить sync
> Найти такие файлы: `lsof +L1`. Решение — перезапустить процесс. А очищать работающий лог лучше через `truncate -s 0`.

### Как проверить конфиг logrotate без реальной ротации?
= logrotate -d /etc/logrotate.d/myapp
= sudo logrotate -d /etc/logrotate.d/myapp
> `-d` — debug-режим: выводит план действий и ничего не меняет.

### Как отправить сообщение в системный журнал из bash-скрипта?
- [x] logger "текст"
- [x] echo "текст" | systemd-cat -t myscript
- [ ] journalctl --write "текст"
- [ ] echo "текст" > /run/log/journal
> Сообщение потом найдётся через `journalctl -t myscript` или по тексту.

### Как посмотреть, сколько места занимает журнал, и уменьшить его?
- [x] journalctl --disk-usage, затем journalctl --vacuum-size=500M
- [ ] du -sh /var/log/journal, затем rm -rf /var/log/journal
- [ ] logrotate -f journald
- [ ] systemctl clean journald
> Можно также задать постоянный лимит `SystemMaxUse=` в journald.conf.

### Как следить за логом службы myapp в реальном времени?
= journalctl -u myapp -f
= journalctl -fu myapp
> Аналог `tail -f` для журнала.
