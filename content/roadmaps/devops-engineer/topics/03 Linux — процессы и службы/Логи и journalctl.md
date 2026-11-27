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
