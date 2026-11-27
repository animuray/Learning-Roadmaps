---
title: systemd и unit-файлы
slug: systemd-i-unit-fajly
description: Что такое systemd и чем он отличается от SysV init, команды systemctl, устройство unit-файла, автозапуск, рестарт и таймеры.
duration: 120
level: Средний
quizSize: 10
materials:
  - title: ArchWiki — systemd (на русском)
    url: https://wiki.archlinux.org/title/Systemd_(%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9)
    type: документация
  - title: systemd.resource-control(5) — лимиты ресурсов для служб
    url: https://manpages.debian.org/systemd.resource-control
    type: документация
---

# systemd и unit-файлы

**systemd** — система инициализации и менеджер служб. Ядро запускает его первым процессом (**PID 1**), а он запускает всё остальное: монтирует диски, поднимает сеть, стартует службы, следит за ними и перезапускает при падении. На любом современном сервере вы будете управлять службами через `systemctl`.

## Чем systemd отличается от SysV init

| | SysV init (раньше) | systemd |
| --- | --- | --- |
| Описание служб | Shell-скрипты в `/etc/init.d/` | Декларативные **unit-файлы** |
| Запуск | Последовательно, по номерам в runlevel | **Параллельно**, по явным зависимостям |
| Режимы | Runlevels 0–6 | **Targets**: `multi-user.target`, `graphical.target` |
| Слежение за процессами | PID-файлы, легко «потерять» процесс | Каждая служба в своей **cgroup** — видны все её процессы |
| Логи | Каждая служба сама по себе | Единый журнал **journald** |
| Дополнительно | — | Перезапуск при падении, лимиты ресурсов, таймеры, запуск по сокету |

## systemctl — управление службами

```bash
systemctl status nginx         # состояние, PID, последние строки лога
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx   # остановить и запустить
sudo systemctl reload nginx    # перечитать конфиг без остановки (если служба умеет)
sudo systemctl enable nginx    # автозапуск при загрузке
sudo systemctl enable --now nginx   # включить автозапуск и сразу запустить
sudo systemctl disable nginx
systemctl is-active nginx; systemctl is-enabled nginx
systemctl list-units --type=service          # запущенные службы
systemctl list-units --failed                # что упало
systemctl cat nginx            # показать unit-файл со всеми дополнениями
sudo systemctl mask nginx      # запретить запуск совсем (даже вручную)
```

> [!important] start и enable — разные вещи
> `start` запускает службу сейчас. `enable` включает автозапуск при загрузке. Частая ошибка: служба запущена, но после перезагрузки сервера её нет, потому что забыли `enable`.

## Типы юнитов

`.service` — служба, `.socket` — сокет для запуска по требованию, `.timer` — расписание, `.target` — группа юнитов (аналог runlevel), `.mount` — точка монтирования, `.path` — слежение за файлом.

## Unit-файл своей службы

Свои юниты кладут в `/etc/systemd/system/`. Юниты из пакетов лежат в `/usr/lib/systemd/system/` (в Debian также `/lib/systemd/system/`), и файлы в `/etc` имеют приоритет.

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Python web app
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
EnvironmentFile=/etc/myapp/env
ExecStart=/opt/myapp/.venv/bin/python -m http.server 8080
Restart=on-failure
RestartSec=5
MemoryMax=256M

[Install]
WantedBy=multi-user.target
```

| Директива | Смысл |
| --- | --- |
| `After=` / `Before=` | Порядок запуска (только порядок, не зависимость!) |
| `Wants=` / `Requires=` | Зависимость: мягкая (не запустилась — не страшно) / жёсткая |
| `Type=simple` | Процесс из ExecStart и есть служба. `forking` — для старых демонов, которые уходят в фон сами; `oneshot` — для разовых задач |
| `User=` | От какого пользователя запускать (не от root!) |
| `ExecStart=` | Команда запуска — с **абсолютным путём** |
| `Restart=` | `no`, `on-failure` (перезапуск при ненулевом коде или сигнале), `always` |
| `MemoryMax=`, `CPUQuota=` | Лимиты ресурсов через cgroups |
| `WantedBy=multi-user.target` | К какому target подключить службу при `enable` |

После создания или изменения файла:

```bash
sudo systemctl daemon-reload          # systemd перечитывает unit-файлы
sudo systemctl enable --now myapp
systemctl status myapp
journalctl -u myapp -f
```

Изменять юнит из пакета напрямую не стоит — обновление пакета перезапишет правки. Используйте **drop-in**: `sudo systemctl edit nginx` создаст `/etc/systemd/system/nginx.service.d/override.conf` только с вашими изменениями.

## Таймеры вместо cron

```ini
# /etc/systemd/system/backup.timer
[Timer]
OnCalendar=*-*-* 03:00:00
# если сервер был выключен в 03:00 — запустить задачу при включении
Persistent=true

[Install]
WantedBy=timers.target
```

Таймер запускает одноимённую службу `backup.service` (обычно `Type=oneshot`). Включение — `systemctl enable --now backup.timer`, список — `systemctl list-timers`. Плюсы перед cron: логи в journald, зависимости, лимиты ресурсов.

## Анализ загрузки

```bash
systemd-analyze                 # сколько длилась загрузка
systemd-analyze blame           # какие юниты грузились дольше всего
systemctl get-default           # target по умолчанию
```

## Практика

- [ ] Посмотреть `systemctl status` для sshd и nginx; найти unit-файлы через `systemctl cat`
- [ ] Найти упавшие юниты: `systemctl list-units --failed`
- [ ] Написать unit-файл для простого HTTP-сервера на Python от отдельного пользователя, с `Restart=on-failure` и автозапуском
- [ ] Убить процесс службы через `kill -9` и убедиться, что systemd поднял его снова
- [ ] Через `systemctl edit` добавить службе `MemoryMax=` и проверить в `systemctl status`, что лимит применился
- [ ] Перенести любую свою cron-задачу на systemd timer

## Тест

### Какой PID у systemd?
= 1
> Его запускает ядро. Все остальные процессы — его потомки.

### Чем systemctl enable отличается от systemctl start?
- [ ] Ничем
- [x] enable включает автозапуск при загрузке системы, start запускает службу прямо сейчас
- [ ] start включает автозапуск, enable запускает сейчас
- [ ] enable работает только для таймеров
> `enable --now` делает и то и другое.

### Вы изменили unit-файл в /etc/systemd/system. Что нужно выполнить, чтобы systemd увидел изменения?
= sudo systemctl daemon-reload
= systemctl daemon-reload
> Затем перезапустите службу, чтобы новые параметры применились к процессу.

### Чем systemd отличается от SysV init?
- [x] Запускает службы параллельно с учётом зависимостей
- [x] Описывает службы декларативными unit-файлами, а не shell-скриптами
- [x] Отслеживает все процессы службы через cgroups и собирает логи в journald
- [ ] Не умеет перезапускать упавшие службы
> SysV init запускал скрипты из /etc/init.d последовательно по runlevel.

### Какая директива unit-файла задаёт автоматический перезапуск службы при падении?
- [ ] ExecRestart=yes
- [x] Restart=on-failure (или Restart=always)
- [ ] AutoRestart=true
- [ ] WantedBy=restart.target
> `RestartSec=` задаёт паузу перед перезапуском.

### Где правильно размещать собственные unit-файлы?
- [ ] /usr/lib/systemd/system
- [x] /etc/systemd/system
- [ ] /var/lib/systemd
- [ ] /etc/init.d
> В /usr/lib (/lib) лежат юниты из пакетов, и обновление пакета может их перезаписать.

### Что делает директива After=postgresql.service?
- [ ] Гарантирует, что PostgreSQL будет запущен
- [x] Задаёт только порядок: если оба юнита запускаются, наш стартует после PostgreSQL
- [ ] Запрещает запуск без PostgreSQL
- [ ] Перезапускает службу после PostgreSQL
> Чтобы PostgreSQL обязательно запустился, нужна ещё зависимость: `Wants=` или `Requires=`.

### Зачем в секции [Install] пишут WantedBy=multi-user.target?
- [ ] Чтобы служба запускалась только для нескольких пользователей
- [x] Чтобы при enable служба подключилась к обычному многопользовательскому режиму загрузки и стартовала автоматически
- [ ] Чтобы служба работала от root
- [ ] Это обязательный комментарий
> Без секции [Install] команда enable не будет знать, куда подключить службу.

### Как поменять параметры службы из пакета, не правя её unit-файл?
- [ ] Отредактировать файл в /usr/lib/systemd/system
- [x] Создать drop-in через systemctl edit имя_службы
- [ ] Переименовать службу
- [ ] Это невозможно
> Drop-in в /etc/systemd/system/имя.service.d/ переживёт обновление пакета.

### Как посмотреть, какие службы упали?
- [ ] systemctl status --all
- [x] systemctl list-units --failed
- [ ] journalctl --failed
- [ ] systemctl show failed
> Затем смотрите причину: `systemctl status имя` и `journalctl -u имя`.

### Чем systemctl reload отличается от restart?
- [ ] Ничем
- [x] reload просит службу перечитать конфигурацию без остановки, restart останавливает и запускает службу заново
- [ ] reload перезагружает сервер
- [ ] restart работает только для таймеров
> reload поддерживают не все службы — в юните должен быть задан ExecReload.

### Как ограничить службе потребление памяти 256 МБ средствами systemd?
- [ ] ulimit -m 256M в ExecStart
- [x] Директива MemoryMax=256M в секции [Service]
- [ ] LimitMemory=256M в [Install]
- [ ] Это делается только в Docker
> systemd применяет лимит через cgroups. При превышении сработает OOM Killer внутри этой cgroup.

### Чем systemd timer удобнее cron?
- [ ] Таймеры работают без systemd
- [x] Логи задач попадают в journald, можно задавать зависимости и лимиты ресурсов, а Persistent=true догоняет пропущенные запуски
- [ ] Таймеры поддерживают только секундные интервалы
- [ ] cron не умеет запускать скрипты
> Список таймеров и время следующего запуска — `systemctl list-timers`.
