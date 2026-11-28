---
title: Свой systemd-сервис
slug: svoj-systemd-servis
description: Практика — HTTP-сервер на Python как служба systemd с автозапуском, перезапуском при падении, лимитом памяти и защитными настройками.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: ArchWiki — systemd (на русском)
    url: https://wiki.archlinux.org/title/Systemd_(%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9)
    type: документация
  - title: systemd.resource-control(5) — MemoryMax, CPUQuota
    url: https://manpages.debian.org/systemd.resource-control
    type: документация
---

# Свой systemd-сервис

Задача из практики роадмапа: превратить простой HTTP-сервер на Python в настоящую службу. Она должна стартовать при загрузке, подниматься после `kill -9`, работать от отдельного пользователя и не съедать больше заданного объёма памяти.

## 1. Приложение

```python
# /opt/hello/app.py
from http.server import BaseHTTPRequestHandler, HTTPServer
import os

PORT = int(os.environ.get("PORT", "8080"))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"ok\n" if self.path == "/health" else b"Hello from systemd!\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(body)

HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
```

## 2. Системный пользователь

Служба не должна работать от root: если её взломают, злоумышленник получит только права этого пользователя.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin hello
sudo mkdir -p /opt/hello
sudo cp app.py /opt/hello/
sudo chown -R root:hello /opt/hello && sudo chmod 750 /opt/hello
echo "PORT=8080" | sudo tee /etc/hello.env
```

## 3. Unit-файл

```ini
# /etc/systemd/system/hello.service
[Unit]
Description=Hello HTTP service
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=hello
Group=hello
EnvironmentFile=/etc/hello.env
WorkingDirectory=/opt/hello
ExecStart=/usr/bin/python3 /opt/hello/app.py
Restart=always
RestartSec=3
MemoryMax=100M
CPUQuota=50%
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

| Директива | Зачем |
| --- | --- |
| `Restart=always`, `RestartSec=3` | Перезапуск через 3 секунды после любого завершения, в том числе после `kill -9` |
| `StartLimitIntervalSec`, `StartLimitBurst` | Не больше 5 перезапусков за 60 секунд, иначе служба помечается как failed — защита от бесконечного цикла падений |
| `MemoryMax=100M` | Жёсткий лимит памяти через cgroups: при превышении OOM Killer убьёт процесс службы |
| `CPUQuota=50%` | Не больше половины одного ядра |
| `NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, `PrivateTmp` | Песочница: процесс не может повысить привилегии, писать в системные каталоги и видеть /home |

Если приложению нужно куда-то писать, разрешите конкретный каталог: `ReadWritePaths=/var/lib/hello` или `StateDirectory=hello`.

## 4. Запуск и проверка

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hello
systemctl status hello
curl http://localhost:8080/health
journalctl -u hello -f
```

### Проверка перезапуска

```bash
systemctl show hello -p MainPID -p NRestarts
sudo kill -9 $(systemctl show hello -p MainPID --value)
sleep 4
systemctl show hello -p MainPID -p NRestarts    # новый PID, счётчик перезапусков +1
```

### Проверка лимита памяти

Добавьте в приложение эндпоинт, который выделяет память (или временно поставьте `MemoryMax=20M`). Затем:

```bash
systemctl status hello          # строка Memory: текущее потребление и лимит
journalctl -k | grep -i oom     # запись OOM Killer
systemctl show hello -p Result  # oom-kill, если служба упала из-за памяти
```

### Проверка автозапуска

```bash
sudo reboot
# после загрузки:
systemctl is-active hello && curl localhost:8080
```

### Оценка безопасности

```bash
systemd-analyze security hello   # оценка «опасности» службы и подсказки, что ещё ограничить
```

## Практика

- [ ] Развернуть приложение и службу по шагам этой темы
- [ ] Убедиться, что после `kill -9` служба поднимается, а `NRestarts` растёт
- [ ] Убить службу 6 раз подряд за минуту и посмотреть, как срабатывает StartLimitBurst; вернуть её командой `systemctl reset-failed hello`
- [ ] Спровоцировать превышение MemoryMax и найти запись OOM в журнале
- [ ] Перезагрузить сервер и проверить автозапуск
- [ ] Прогнать `systemd-analyze security hello` и добавить ещё пару защитных директив

## Лаборатория

### Таймер вместо cron

Скрипт `/opt/lab/backup-db.sh` делает дамп и кладёт его в `/var/backups/lab/`. Запускайте его **каждый день в 03:00** средствами systemd: создайте службу `db-backup.service` и таймер `db-backup.timer`. Таймер должен быть включён и запущен, а если сервер был выключен в 03:00 — запуск должен произойти при следующей загрузке.

```bash setup
systemctl disable --now db-backup.timer >/dev/null 2>&1
rm -f /etc/systemd/system/db-backup.service /etc/systemd/system/db-backup.timer
systemctl daemon-reload
mkdir -p /opt/lab /var/backups/lab
rm -f /var/backups/lab/*
cat > /opt/lab/backup-db.sh <<'EOF'
#!/bin/bash
# «Дамп базы»: просто файл с датой
echo "dump $(date -Is)" > /var/backups/lab/db-$(date +%Y%m%d-%H%M%S).sql
echo "backup done"
EOF
chmod 755 /opt/lab/backup-db.sh
```

```bash check
[ -f /etc/systemd/system/db-backup.service ] || fail "Нет /etc/systemd/system/db-backup.service"
[ -f /etc/systemd/system/db-backup.timer ] || fail "Нет /etc/systemd/system/db-backup.timer"
[ "$(systemctl is-enabled db-backup.timer 2>/dev/null)" = enabled ] || fail "Таймер не включён в автозапуск — после перезагрузки он не заработает"
[ "$(systemctl is-active db-backup.timer)" = active ] || fail "Таймер не запущен"
cal=$(systemctl show -p TimersCalendar --value db-backup.timer)
echo "$cal" | grep -qE 'OnCalendar=\*-\*-\* 03:00:00' || fail "Таймер срабатывает не каждый день в 03:00: $cal"
[ "$(systemctl show -p Persistent --value db-backup.timer)" = yes ] || fail "Пропущенный из-за выключения сервера запуск не будет выполнен"
rm -f /var/backups/lab/*
systemctl start db-backup.service 2>/dev/null
sleep 1
ls /var/backups/lab/db-*.sql >/dev/null 2>&1 || fail "Служба db-backup.service не создаёт дамп — проверьте её: $(journalctl -u db-backup.service -n 2 --no-pager -o cat | tr '\n' ' ')"
ok "следующий запуск: $(systemctl show -p NextElapseUSecRealtime --value db-backup.timer)"
```

```text hint
1. Служба для разовой задачи: в разделе [Service] тип «выполнить и завершиться» и путь к скрипту. Раздела установки ей не нужно — её запускает таймер.
2. Таймер с тем же именем: в разделе [Timer] — календарное расписание и флаг «догнать пропущенный запуск»; в разделе [Install] — привязка к цели таймеров.
3. Перечитать конфигурацию systemd, включить и запустить таймер. Проверить календарь — у systemd-analyze есть команда, которая проверяет выражение и показывает следующий запуск.
```

```bash solution
sudo tee /etc/systemd/system/db-backup.service >/dev/null <<'EOF'
[Unit]
Description=Database backup

[Service]
Type=oneshot
ExecStart=/opt/lab/backup-db.sh
EOF
sudo tee /etc/systemd/system/db-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Daily database backup at 03:00

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now db-backup.timer
systemctl list-timers db-backup.timer --no-pager
```

```text review
Эталон: `db-backup.service` (`Type=oneshot`) + `db-backup.timer` (`OnCalendar=*-*-* 03:00:00`, `Persistent=true`, `WantedBy=timers.target`) → `enable --now db-backup.timer`.

- Чем таймер лучше cron: вывод задачи в журнале (`journalctl -u db-backup`), видно время последнего и следующего запуска (`systemctl list-timers`), можно запустить вручную (`systemctl start db-backup.service`), ограничить ресурсы и задать зависимости.
- Календарь: `daily` = `*-*-* 00:00:00`, `Mon..Fri 09:00`, `*:0/15` (каждые 15 минут). Проверить выражение: `systemd-analyze calendar '*-*-* 03:00:00'`.
- `Persistent=true` — если сервер был выключен в момент запуска, задача выполнится сразу после загрузки. `RandomizedDelaySec=30m` — разнести запуск у сотни серверов.
- Включают **таймер**, а не службу: `enable db-backup.service` без `[Install]` выдаст предупреждение.
```

```text notes
crontab|/etc/cron => Задача ставилась в cron — работает, но в этой теме цель — systemd-таймер: журнал, list-timers и Persistent.
```

### Служба без лишних прав

Служба `lab-web` (`/etc/systemd/system/lab-web.service`) — простой веб-сервер на порту 8090 — запускается от **root**. Сделайте её безопаснее:

- работает от системного пользователя **`web`** (создайте его без возможности входа);
- не может повысить себе права (`NoNewPrivileges`);
- вся файловая система для неё только на чтение (`ProtectSystem=strict`);
- у неё свой изолированный `/tmp` (`PrivateTmp`).

Служба должна продолжать работать и отвечать на порту 8090.

```bash setup
systemctl stop lab-web 2>/dev/null
rm -rf /etc/systemd/system/lab-web.service.d /etc/systemd/system.control/lab-web.service.d
userdel web 2>/dev/null; true
mkdir -p /srv/lab-web && echo "<h1>lab-web</h1>" > /srv/lab-web/index.html
cat > /etc/systemd/system/lab-web.service <<'EOF'
[Unit]
Description=Lab web server

[Service]
ExecStart=/usr/bin/python3 -m http.server 8090 --directory /srv/lab-web
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now lab-web >/dev/null 2>&1
```

```bash check
id web >/dev/null 2>&1 || fail "Пользователя web нет"
sh=$(getent passwd web | cut -d: -f7)
case "$sh" in */nologin|*/false) ;; *) fail "Под пользователем web можно войти в систему (оболочка $sh)";; esac
[ "$(systemctl is-active lab-web)" = active ] || fail "Служба lab-web не работает: $(journalctl -u lab-web -n 2 --no-pager -o cat | tr '\n' ' ')"
s() { systemctl show -p "$1" --value lab-web; }
[ "$(s User)" = web ] || fail "Служба работает от «$(s User)»"
[ "$(s NoNewPrivileges)" = yes ] || fail "Служба может повысить себе права"
[ "$(s ProtectSystem)" = strict ] || fail "Файловая система для службы не только на чтение (ProtectSystem=$(s ProtectSystem))"
[ "$(s PrivateTmp)" = yes ] || fail "У службы общий /tmp с остальной системой"
pid=$(s MainPID)
[ "$(ps -o user= -p $pid | tr -d ' ')" = web ] || fail "Процесс службы работает не от web — служба не перезапущена после изменений?"
curl -s --max-time 3 http://127.0.0.1:8090/ | grep -q lab-web || fail "Служба не отвечает на порту 8090"
ok "lab-web: User=web, $(systemd-analyze security lab-web 2>/dev/null | tail -1)"
```

```text hint
1. Создать системного пользователя без домашнего каталога и с оболочкой, запрещающей вход.
2. Добавить нужные директивы в раздел [Service] — удобнее отдельным файлом-дополнением через команду редактирования службы, чем правкой основного файла.
3. Перечитать конфигурацию systemd и перезапустить службу. Оценить защищённость поможет команда security у systemd-analyze.
```

```bash solution
sudo useradd -r -s /usr/sbin/nologin web
sudo mkdir -p /etc/systemd/system/lab-web.service.d
sudo tee /etc/systemd/system/lab-web.service.d/hardening.conf >/dev/null <<'EOF'
[Service]
User=web
NoNewPrivileges=yes
ProtectSystem=strict
PrivateTmp=yes
EOF
sudo systemctl daemon-reload
sudo systemctl restart lab-web
systemd-analyze security lab-web | tail -1
```

```text review
Эталон: `useradd -r -s /usr/sbin/nologin web` + drop-in с `User=web`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes` → `daemon-reload` → `restart`.

- Взлом приложения = права его пользователя. От root злоумышленник получает всю машину, от `web` с `ProtectSystem=strict` — почти ничего.
- `ProtectSystem=strict` делает весь корень только для чтения; куда писать можно — разрешают явно: `ReadWritePaths=/var/lib/app` или `StateDirectory=app` (systemd создаст `/var/lib/app` с нужным владельцем).
- Ещё полезное: `ProtectHome=yes`, `PrivateDevices=yes`, `CapabilityBoundingSet=` (пусто — никаких capabilities), `DynamicUser=yes` (временный пользователь без создания).
- `systemd-analyze security <служба>` оценивает от 0 (максимальная защита) до 10 и подсказывает, что ещё закрыть.
- Порт меньше 1024 без root — `AmbientCapabilities=CAP_NET_BIND_SERVICE`.
```

## Тест

### Какая директива заставит systemd перезапускать службу даже после kill -9?
- [ ] Restart=no
- [x] Restart=always (или Restart=on-failure)
- [ ] ExecReload=always
- [ ] KillMode=none
> SIGKILL — это аварийное завершение, поэтому on-failure тоже перезапустит службу. always перезапускает ещё и после штатного выхода с кодом 0.

### Почему службу запускают от отдельного системного пользователя, а не от root?
- [ ] Так быстрее
- [x] При взломе злоумышленник получит только права этого пользователя, а не всей системы
- [ ] Root не может открыть порт 8080
- [ ] Это требование Python
> Принцип минимальных привилегий.

### Какой командой создать системного пользователя без домашнего каталога и без возможности входа?
- [ ] useradd -m hello
- [x] useradd --system --no-create-home --shell /usr/sbin/nologin hello
- [ ] adduser --root hello
- [ ] passwd -l hello
> Оболочка nologin не даст войти под этим пользователем.

### Что делает MemoryMax=100M?
- [ ] Резервирует 100 МБ памяти для службы
- [x] Устанавливает жёсткий лимит памяти через cgroups; при превышении процессы службы убивает OOM Killer
- [ ] Ограничивает размер логов
- [ ] Ограничивает swap
> Мягкий лимит задаётся MemoryHigh=: при его превышении ядро начинает активно отбирать память, но не убивает процесс.

### Зачем нужны StartLimitIntervalSec и StartLimitBurst?
- [ ] Чтобы ускорить запуск
- [x] Чтобы ограничить число перезапусков за интервал и не перезапускать бесконечно падающую службу
- [ ] Чтобы задать время запуска по расписанию
- [ ] Чтобы ограничить CPU
> После превышения лимита служба переходит в failed; сбросить — `systemctl reset-failed`.

### Как узнать, сколько раз systemd перезапускал службу?
= systemctl show hello -p NRestarts
= systemctl show -p NRestarts hello
> MainPID покажет текущий PID процесса.

### Что делает ProtectSystem=strict?
- [ ] Запрещает службе сетевые подключения
- [x] Монтирует всю файловую систему для службы только на чтение, кроме явно разрешённых каталогов
- [ ] Запускает службу от root
- [ ] Шифрует файлы службы
> Каталоги для записи разрешают через ReadWritePaths= или StateDirectory=.

### Служба с ProtectSystem=strict падает с ошибкой Read-only file system при записи в /var/lib/hello. Как исправить?
- [ ] Убрать все защитные директивы
- [x] Разрешить запись в нужный каталог: ReadWritePaths=/var/lib/hello или StateDirectory=hello
- [ ] Запустить службу от root
- [ ] Выполнить chmod 777 /var/lib/hello
> Ослаблять защиту целиком не нужно — достаточно открыть конкретный каталог.

### Какие команды нужны после создания unit-файла, чтобы служба заработала и запускалась при загрузке?
- [x] systemctl daemon-reload
- [x] systemctl enable --now hello
- [ ] systemctl mask hello
- [ ] systemctl isolate hello
> mask наоборот запрещает запуск.

### Как оценить, насколько служба изолирована, и получить подсказки по защите?
= systemd-analyze security hello
> Утилита выставляет «уровень опасности» и перечисляет, какие директивы ещё можно включить.

### Где хранить переменные окружения службы, например порт и адрес базы?
- [ ] В ~/.bashrc пользователя hello
- [x] В отдельном файле, подключённом через EnvironmentFile=, или в директивах Environment=
- [ ] В /etc/profile
- [ ] Прямо в коде
> systemd не читает .bashrc. Файл с секретами защитите правами 600 или 640.

### Как проверить, что служба переживает перезагрузку сервера?
- [ ] systemctl status сразу после enable
- [x] Перезагрузить сервер и после загрузки проверить systemctl is-active и ответ приложения
- [ ] Посмотреть файл unit
- [ ] Проверить journalctl до перезагрузки
> Только реальная перезагрузка показывает, что enable и зависимости настроены правильно.
