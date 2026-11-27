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
