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

## Лаборатория

```bash setup
lab_unit() { systemctl stop "$1" 2>/dev/null; systemctl reset-failed "$1" 2>/dev/null; true; }
mkdir -p /opt/lab
```

### Кто убил импорт

Служба `lab-import` упала посреди работы. В её логе ничего толкового нет. Выясните по журналу **ядра**, что произошло, и запишите в `~/oom-pid.txt` PID процесса, которого убило ядро.

```bash setup
lab_unit lab-import
# журнал на диске должен быть доступен группе systemd-journal (ученик в ней)
systemd-tmpfiles --create --prefix /var/log/journal >/dev/null 2>&1
rm -f /home/student/oom-pid.txt
systemd-run -q --unit=lab-import -p MemoryMax=40M -p MemorySwapMax=0 python3 -c "import time; time.sleep(1); a = b'x' * (300*1024*1024)"
for i in $(seq 40); do [ "$(systemctl is-active lab-import)" = failed ] && break; sleep 0.25; done
sleep 0.5
journalctl -k --no-pager -o cat | grep -oE 'Killed process [0-9]+ \(python3\)' | tail -1 | awk '{print $3}' > /var/lib/lab/oom-pid
[ -s /var/lib/lab/oom-pid ]
```

```bash check
want=$(cat /var/lib/lab/oom-pid)
[ -f /home/student/oom-pid.txt ] || fail "Нет ~/oom-pid.txt"
got=$(tr -d '[:space:]' < /home/student/oom-pid.txt)
[ "$got" = "$want" ] || fail "В ~/oom-pid.txt «$got» — это не PID процесса, которого последним убил OOM killer"
ok "OOM killer убил PID $want"
```

```text hint
1. Сообщения ядра доступны через journalctl с ключом «только ядро» (или старым dmesg).
2. Ищите строку о том, что памяти не хватило и процесс был убит, — там его PID. Нужна последняя такая запись.
3. Статус самой службы тоже подскажет причину падения.
```

```bash solution
systemctl status lab-import --no-pager | head -5
journalctl -k --no-pager | grep -i 'killed process' | tail -1
journalctl -k --no-pager -o cat | grep -oE 'Killed process [0-9]+' | tail -1 | awk '{print $3}' > ~/oom-pid.txt
```

```text review
Эталон: `journalctl -k | grep -i 'killed process'` (или `dmesg -T | grep -i oom`).

- OOM killer убивает SIGKILL — программа не успевает ничего записать в свой лог. Поэтому причину ищут в журнале ядра, а у systemd-службы — в статусе: `Failed with result 'oom-kill'`.
- `Memory cgroup out of memory` — сработал **лимит cgroup** (MemoryMax службы, limits.memory контейнера), а не закончилась память всей машины. В Kubernetes это `OOMKilled` в `kubectl describe pod`.
- Что делать: смотреть, сколько процессу реально нужно, поднимать лимит или искать утечку. Защитить важный процесс от OOM killer — `OOMScoreAdjust=-500` в юните (или `oom_score_adj`).
```

### Ограничить память службе

Служба `lab-cache` (файл `/etc/systemd/system/lab-cache.service`) может съесть всю память сервера. Ограничьте ей память **100 МБ** средствами systemd так, чтобы ограничение действовало сейчас и **сохранилось** после перезапуска службы и перезагрузки. Служба должна работать.

```bash setup
lab_unit lab-cache
rm -rf /etc/systemd/system/lab-cache.service.d /etc/systemd/system.control/lab-cache.service.d /run/systemd/system.control/lab-cache.service.d
cat > /etc/systemd/system/lab-cache.service <<'EOF'
[Unit]
Description=Lab cache service

[Service]
ExecStart=/usr/bin/python3 -c "import time; a = b'x' * (20*1024*1024); time.sleep(10**7)"

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl start lab-cache
```

```bash check
[ "$(systemctl is-active lab-cache)" = active ] || fail "Служба lab-cache не работает"
[ "$(systemctl show -p MemoryMax --value lab-cache)" = 104857600 ] || fail "Ограничение памяти службы сейчас: $(systemctl show -p MemoryMax --value lab-cache)"
cg=/sys/fs/cgroup$(systemctl show -p ControlGroup --value lab-cache)
[ "$(cat $cg/memory.max 2>/dev/null)" = 104857600 ] || fail "В cgroup службы memory.max = $(cat $cg/memory.max 2>/dev/null) — ограничение не применено к работающей службе"
grep -rqsE '^MemoryMax=(100M|104857600)' /etc/systemd/system/lab-cache.service /etc/systemd/system/lab-cache.service.d /etc/systemd/system.control/lab-cache.service.d \
  || fail "Ограничение действует, но не сохранено в настройках службы — после перезагрузки пропадёт"
ok "lab-cache: MemoryMax=100M ($cg/memory.max)"
```

```text hint
1. Ограничение памяти — свойство службы в разделе [Service]. Его можно задать отдельным файлом-дополнением к юниту либо командой systemctl, которая меняет свойство работающей службы.
2. У этой команды есть режим «только до перезагрузки» — он здесь не подходит.
3. Проверить: свойство службы и файл memory.max в её cgroup.
```

```bash solution
sudo systemctl set-property lab-cache MemoryMax=100M
systemctl show -p MemoryMax lab-cache
cat /sys/fs/cgroup/system.slice/lab-cache.service/memory.max
```

```text review
Эталон: `sudo systemctl set-property lab-cache MemoryMax=100M` (или drop-in `[Service] MemoryMax=100M` + `daemon-reload` + `restart`).

- `set-property` применяет лимит к работающей службе сразу и сохраняет его в `/etc/systemd/system.control/`; с `--runtime` — только до перезагрузки.
- Под капотом — cgroup v2: `memory.max` в каталоге службы в `/sys/fs/cgroup`. Docker (`--memory`) и Kubernetes (`limits.memory`) делают то же самое.
- `MemoryHigh=` — мягкий порог (ядро начинает отбирать память), `MemoryMax=` — жёсткий (дальше OOM). `CPUQuota=50%`, `TasksMax=`, `IOWeight=` — другие ресурсы.
- Сколько служба потребляет сейчас: `systemctl status lab-cache` (строка Memory) или `systemd-cgtop`.
```

```text notes
--runtime => Ограничение ставилось с --runtime — оно пропадёт после перезагрузки.
echo\s+[^\n]*memory\.max => memory.max записывался напрямую в cgroup — systemd об этом не знает и при перезапуске службы сбросит значение. Ограничения служб задают через systemd.
```

### Отдельный PID namespace

Запустите команду `ps -e` в **новом PID namespace** со своим `/proc`, чтобы она видела только процессы этого namespace, и сохраните её вывод в `~/ns-ps.txt`.

```bash setup
rm -f /home/student/ns-ps.txt
```

```bash check
f=/home/student/ns-ps.txt
[ -s $f ] || fail "~/ns-ps.txt пуст или не создан"
grep -q systemd $f && fail "В выводе видны процессы системы (systemd) — команда выполнялась в общем PID namespace"
n=$(grep -cE '^[[:space:]]*[0-9]+' $f)
[ "$n" -ge 1 ] && [ "$n" -le 5 ] || fail "В выводе $n процессов — это не изолированный namespace"
awk '$1 == 1' $f | grep -q . || fail "В выводе нет процесса с PID 1 — у нового namespace свой PID 1"
ok "в namespace видно процессов: $n ($(awk 'NR>1 {print $1":"$NF}' $f | tr '\n' ' '))"
```

```text hint
1. Есть утилита, которая запускает программу в новых namespace. Нужны три ключа: новый PID namespace, отдельный дочерний процесс (он и станет PID 1) и свежий /proc, иначе ps покажет процессы хоста.
2. Создавать namespace может только root.
3. Вывод команды перенаправить в файл.
```

```bash solution
sudo unshare --pid --fork --mount-proc ps -e > ~/ns-ps.txt
cat ~/ns-ps.txt
```

```text review
Эталон: `sudo unshare --pid --fork --mount-proc ps -e`.

- Внутри нового PID namespace первый процесс получает PID 1 и видит только своих потомков. `--mount-proc` монтирует новый `/proc`, иначе `ps` читал бы `/proc` хоста.
- Контейнер — это и есть набор namespace (pid, net, mnt, uts, ipc, user, cgroup) + cgroups для лимитов + своя файловая система. Docker собирает это за вас.
- Зайти в namespace работающего процесса: `nsenter -t <PID> -n ip a` — сеть контейнера без утилит внутри контейнера.
- Список namespace в системе: `lsns`.
```

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
