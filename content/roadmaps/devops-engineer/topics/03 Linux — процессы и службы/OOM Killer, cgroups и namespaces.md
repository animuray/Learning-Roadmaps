---
title: OOM Killer, cgroups и namespaces
slug: oom-killer-cgroups-namespaces
description: Что происходит, когда кончается память, как защитить процесс через oom_score_adj, и два механизма ядра, на которых построены контейнеры, — cgroups и namespaces.
duration: 120
level: Средний
quizSize: 10
materials:
  - title: man7 — proc_pid_oom_score_adj(5)
    url: https://www.man7.org/linux/man-pages/man5/proc_pid_oom_score_adj.5.html
    type: документация
  - title: man7 — proc_pid_oom_score(5)
    url: https://man7.org/linux/man-pages/man5/proc_pid_oom_score.5.html
    type: документация
  - title: Документация ядра — Control Group v2
    url: https://docs.kernel.org/admin-guide/cgroup-v2.html
    type: документация
  - title: man7 — namespaces(7)
    url: https://www.man7.org/linux/man-pages/man7/namespaces.7.html
    type: документация
  - title: systemd.resource-control(5)
    url: https://manpages.debian.org/systemd.resource-control
    type: документация
---

# OOM Killer, cgroups и namespaces

Эта тема — мостик от Linux к Docker и Kubernetes. Контейнер — это не виртуальная машина, а обычный процесс Linux, которому ядро **ограничило ресурсы** (cgroups) и **изолировало обзор системы** (namespaces). А когда контейнер выходит за лимит памяти, его убивает тот же OOM Killer.

## OOM Killer

Когда оперативная память и swap заканчиваются, ядро не может выделить память, но и остановиться не может. Тогда срабатывает **OOM Killer** (Out Of Memory): он выбирает процесс-«жертву» и убивает его сигналом SIGKILL, чтобы спасти систему.

- Жертву выбирают по **oom_score**: в основном это доля памяти, которую занимает процесс. Посмотреть: `cat /proc/PID/oom_score`.
- Оценку корректирует **oom_score_adj** — от **−1000** до **+1000**. Положительное значение делает процесс более вероятной жертвой, отрицательное — менее. **−1000** полностью исключает процесс из выбора.

```bash
cat /proc/$(pidof -s postgres)/oom_score
echo -500 | sudo tee /proc/1234/oom_score_adj    # защитить процесс (до перезапуска)
choom -p 1234 -n -500                            # то же через утилиту
```

Для службы постоянная настройка задаётся в unit-файле: `OOMScoreAdjust=-500`.

Как понять, что сработал OOM Killer:

```bash
journalctl -k | grep -i -E "out of memory|oom"
dmesg -T | grep -i "killed process"
# Out of memory: Killed process 4321 (java) total-vm:..., anon-rss:...
```

> [!warning] Защищать всё подряд нельзя
> Если запретить убивать главный «пожиратель» памяти, OOM Killer убьёт что-то другое, например sshd, и вы потеряете доступ к серверу. Настоящее решение — лимиты памяти и поиск причины роста.

## cgroups — ограничение ресурсов

**cgroups** (control groups) — механизм ядра. Он объединяет процессы в группы, **ограничивает** ресурсы группы и **считает** их потребление: CPU, память, ввод-вывод, число процессов.

- Современная версия — **cgroup v2**: единое дерево в `/sys/fs/cgroup`.
- Каждый процесс принадлежит одной cgroup: `cat /proc/PID/cgroup`.
- Если группа превышает лимит памяти, OOM Killer срабатывает **внутри этой группы**, а не во всей системе.

systemd держит каждую службу в своей cgroup:

```bash
systemd-cgls                      # дерево cgroup
systemd-cgtop                     # потребление ресурсов по группам, как top
systemctl show myapp -p MemoryMax
sudo systemd-run --scope -p MemoryMax=100M -p CPUQuota=50% ./heavy.sh   # разовый запуск с лимитами
cat /sys/fs/cgroup/system.slice/nginx.service/memory.current
```

Ключевые настройки: `MemoryMax=` (жёсткий лимит памяти), `MemoryHigh=` (мягкий: ядро начинает активно отбирать память), `CPUQuota=` (доля процессора), `TasksMax=` (число процессов).

**Как это связано с контейнерами.** `docker run --memory=512m --cpus=1` и `resources.limits` в Kubernetes — это настройки cgroup контейнера. Контейнер, превысивший лимит памяти, получает OOM Kill. В Kubernetes вы увидите статус **OOMKilled** и код выхода **137** (128 + SIGKILL).

## namespaces — изоляция

**Namespace** создаёт для процессов собственную копию глобального ресурса. Процесс внутри видит «свою» систему.

| Namespace | Что изолирует |
| --- | --- |
| **PID** | Номера процессов: в контейнере приложение — PID 1, процессы хоста не видны |
| **Network** | Сетевые интерфейсы, IP, порты, таблицы маршрутизации, правила файрвола |
| **Mount** | Точки монтирования — своя файловая система |
| **UTS** | Имя хоста |
| **IPC** | Межпроцессное взаимодействие (общая память, очереди сообщений) |
| **User** | UID и GID: root внутри может быть обычным пользователем снаружи |
| **Cgroup** | Видимая часть дерева cgroup |
| **Time** | Системные часы (время загрузки) |

```bash
ls -l /proc/$$/ns                                    # namespaces текущего процесса
sudo unshare --pid --fork --mount-proc bash          # bash в новом PID namespace
ps aux                                               # внутри видно только bash и ps!
sudo unshare --uts bash -c 'hostname box; hostname'  # своё имя хоста
sudo nsenter -t <PID> -n ip a                        # войти в сетевой namespace процесса
lsns                                                 # список namespaces в системе
```

## Из чего сделан контейнер

```
Контейнер = обычный процесс Linux
          + namespaces    (что процесс видит)
          + cgroups       (сколько ресурсов может потребить)
          + своя корневая ФС (образ, overlayfs)
          + capabilities, seccomp (что ему разрешено)
```

Поэтому контейнеры запускаются за доли секунды и не нуждаются в отдельном ядре, но и изолированы слабее, чем виртуальные машины. Подробнее — в разделе Docker.

## Практика

- [ ] Посмотреть `oom_score` и `oom_score_adj` у нескольких процессов; понять, кого OOM Killer выберет первым
- [ ] В тестовой ВМ запустить процесс с лимитом памяти: `systemd-run --scope -p MemoryMax=50M` с программой, которая выделяет память (например, `python3 -c "a = 'x' * 10**9"`), и найти запись об OOM в `journalctl -k`
- [ ] Ограничить своей службе CPU через `CPUQuota=20%` и проверить в `top` нагрузку от `yes > /dev/null`
- [ ] Через `unshare --pid --fork --mount-proc bash` создать новый PID namespace и посмотреть, какие процессы видны внутри
- [ ] Найти PID любого Docker-контейнера на хосте (`docker inspect -f '{{.State.Pid}}'`) и зайти в его сетевой namespace через `nsenter`

## Тест

### Когда срабатывает OOM Killer?
- [ ] Когда процесс использует 100% CPU
- [x] Когда системе (или cgroup) не хватает памяти, и ядро вынуждено убить процесс, чтобы освободить память
- [ ] Когда заканчивается место на диске
- [ ] По расписанию раз в сутки
> Жертву убивают сигналом SIGKILL.

### По какому признаку OOM Killer в первую очередь выбирает жертву?
- [ ] По времени работы процесса
- [x] По oom_score, который в основном зависит от объёма занятой памяти, с поправкой oom_score_adj
- [ ] По PID: убивается самый новый процесс
- [ ] Случайно
> Самый «тяжёлый» процесс обычно и становится жертвой.

### Какое значение oom_score_adj полностью исключает процесс из выбора OOM Killer?
= -1000
> Диапазон от −1000 до +1000. Пользуйтесь этим осторожно.

### Как задать защиту от OOM Killer для службы systemd постоянно?
- [ ] echo -500 > /proc/PID/oom_score_adj в crontab
- [x] Директива OOMScoreAdjust= в unit-файле службы
- [ ] MemoryMax=0
- [ ] Это невозможно
> Запись в /proc действует только до перезапуска процесса.

### Как убедиться, что процесс убил именно OOM Killer?
- [ ] Посмотреть в /etc/oom.log
- [x] Поискать в сообщениях ядра: journalctl -k или dmesg, строки «Out of memory: Killed process»
- [ ] Выполнить systemctl status oom
- [ ] Посмотреть ~/.bash_history
> Там же видно, сколько памяти занимал убитый процесс.

### Что такое cgroups?
- [ ] Группы пользователей в /etc/group
- [x] Механизм ядра, который объединяет процессы в группы и ограничивает и учитывает их ресурсы: CPU, память, ввод-вывод, число процессов
- [ ] Система контроля версий конфигов
- [ ] Сетевые группы безопасности
> На cgroups построены лимиты в systemd, Docker и Kubernetes.

### Что такое namespaces в Linux?
- [ ] Пространства имён в YAML-файлах
- [x] Механизм ядра, который даёт процессам изолированный взгляд на ресурс: свои PID, сеть, точки монтирования, имя хоста, пользователей
- [ ] Каталоги в /proc
- [ ] Группы процессов с общим лимитом памяти
> namespaces отвечают за то, что процесс видит, cgroups — за то, сколько он может потребить.

### Какие механизмы ядра лежат в основе контейнеров?
- [x] namespaces
- [x] cgroups
- [ ] Гипервизор KVM
- [ ] Отдельное ядро для каждого контейнера
> Контейнеры используют ядро хоста. Поэтому они легче виртуальных машин, но изолированы слабее.

### Под в Kubernetes перезапустился со статусом OOMKilled и кодом 137. Что произошло?
- [ ] Под не прошёл liveness-пробу
- [x] Контейнер превысил лимит памяти своей cgroup, и OOM Killer убил его сигналом SIGKILL
- [ ] Не скачался образ
- [ ] Нода перезагрузилась
> 137 = 128 + 9 (SIGKILL). Решение — найти утечку или увеличить лимит памяти.

### Какой namespace отвечает за то, что в контейнере приложение имеет PID 1?
- [ ] Network
- [ ] Mount
- [x] PID
- [ ] UTS
> Внутри PID namespace нумерация процессов начинается заново.

### Какой namespace даёт контейнеру собственные сетевые интерфейсы и порты?
= network
= net
= Network
> Поэтому два контейнера могут одновременно слушать порт 80 каждый в своём namespace.

### Где в системе с cgroup v2 находится дерево cgroups?
- [ ] /proc/cgroups/tree
- [x] /sys/fs/cgroup
- [ ] /etc/cgroup
- [ ] /var/lib/cgroups
> Удобно смотреть через `systemd-cgls`.

### Какая команда запустит bash в новом PID namespace, где видны только его процессы?
- [ ] chroot / bash
- [x] sudo unshare --pid --fork --mount-proc bash
- [ ] nsenter --pid bash
- [ ] systemd-run bash
> `--mount-proc` перемонтирует /proc, чтобы ps показывал процессы нового namespace.
