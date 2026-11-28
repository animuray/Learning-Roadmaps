---
title: Директория proc
slug: direktoriya-proc
description: Псевдофайловая система /proc — информация о процессах и ядре, /proc/PID, /proc/meminfo, sysctl и откуда берут данные ps, top и free.
duration: 60
level: Средний
quizSize: 10
materials:
  - title: man7 — proc_pid_status(5)
    url: https://man7.org/linux/man-pages/man5/proc_pid_status.5.html
    type: документация
  - title: "man7 — proc_pid_stat(5): файл, который читает ps"
    url: https://www.man7.org/linux/man-pages/man5/proc_pid_stat.5.html
    type: документация
  - title: Filesystem Hierarchy Standard — /proc
    url: https://refspecs.linuxfoundation.org/FHS_3.0/fhs/index.html
    type: документация
---

# Директория /proc

`/proc` — **псевдофайловая система** (procfs). На диске этих файлов нет: ядро формирует содержимое в момент чтения. Через `/proc` ядро показывает, что происходит с процессами и системой, а через `/proc/sys` позволяет менять некоторые параметры на лету.

Все привычные утилиты берут данные отсюда: `ps` и `top` читают `/proc/PID/stat` и `/proc/PID/status`, `free` — `/proc/meminfo`, `uptime` — `/proc/uptime` и `/proc/loadavg`. Убедиться можно так: `strace -e trace=openat ps 2>&1 | grep /proc | head`.

```bash
ls -l /proc/meminfo     # размер 0 — содержимое генерируется при чтении
mount | grep proc       # proc on /proc type proc
```

## /proc/PID — всё о процессе

Каждому процессу соответствует каталог `/proc/<PID>`. `/proc/self` — ссылка на каталог процесса, который её читает.

| Путь | Что там |
| --- | --- |
| `cmdline` | Полная командная строка (аргументы разделены нулевыми байтами) |
| `environ` | Переменные окружения процесса |
| `status` | Удобная для чтения сводка: состояние, PPID, UID, память (VmRSS), число потоков |
| `stat` | То же в одну строку — это читает `ps` |
| `cwd` | Ссылка на текущий каталог процесса |
| `exe` | Ссылка на исполняемый файл |
| `fd/` | Открытые файловые дескрипторы: файлы, сокеты, пайпы |
| `limits` | Лимиты процесса: открытые файлы, процессы |
| `maps` | Карта памяти: какие библиотеки подгружены |
| `io` | Сколько процесс прочитал и записал |
| `oom_score`, `oom_score_adj` | Оценка для OOM Killer и её корректировка |
| `cgroup`, `ns/` | В какой cgroup и namespace находится процесс (основа контейнеров) |

```bash
cat /proc/$(pidof -s nginx)/status | grep -E 'State|PPid|VmRSS|Threads'
tr '\0' ' ' < /proc/1/cmdline; echo
ls -l /proc/1234/cwd /proc/1234/exe
ls -l /proc/1234/fd | wc -l        # сколько файлов открыто
grep 'open files' /proc/1234/limits
```

> [!tip] Спасти удалённый файл
> Если файл удалили, а процесс его ещё держит открытым, данные доступны через `/proc/PID/fd/N`: `cp /proc/1234/fd/4 /tmp/restored.log`. По той же причине место на диске не освобождается, пока процесс не закроет файл, — об этом в теме «Место на диске».

## Информация о системе

```bash
cat /proc/cpuinfo        # процессоры (grep -c processor /proc/cpuinfo — количество)
cat /proc/meminfo        # память: MemTotal, MemFree, MemAvailable, Cached, SwapTotal...
cat /proc/loadavg        # load average за 1, 5, 15 минут и число процессов
cat /proc/uptime         # секунды с момента загрузки
cat /proc/version        # версия ядра
cat /proc/mounts         # смонтированные файловые системы
cat /proc/partitions     # разделы дисков
cat /proc/net/tcp        # TCP-сокеты (это читают ss и netstat)
cat /proc/cmdline        # параметры, с которыми загружено ядро
```

## /proc/sys и sysctl — параметры ядра

```bash
cat /proc/sys/net/ipv4/ip_forward        # 0 — маршрутизация пакетов выключена
sysctl net.ipv4.ip_forward               # то же через sysctl
sudo sysctl -w net.ipv4.ip_forward=1     # изменить до перезагрузки
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-forward.conf
sudo sysctl --system                     # применить все файлы настроек
```

Часто меняемые параметры: `vm.swappiness` (насколько охотно использовать swap), `fs.file-max` (лимит открытых файлов в системе), `net.core.somaxconn` (очередь входящих соединений), `vm.max_map_count` (нужен Elasticsearch).

## /proc и /sys

`/sys` (sysfs) — ещё одна виртуальная ФС. Она описывает устройства, драйверы и подсистемы ядра в виде дерева. Например, `/sys/class/net/eth0/` — сетевой интерфейс, `/sys/fs/cgroup/` — cgroups. Исторически многое лежит в `/proc`, но новые интерфейсы ядра добавляют в `/sys`.

## Практика

- [ ] Найти PID своей оболочки (`echo $$`) и изучить её каталог в `/proc`: `status`, `cmdline`, `environ`, `cwd`, `fd`
- [ ] Сравнить вывод `free -m` с `/proc/meminfo`, а `uptime` — с `/proc/loadavg`
- [ ] Посчитать число ядер через `/proc/cpuinfo` и сравнить с `nproc`
- [ ] Открыть файл в `less` в одном терминале, удалить его в другом и восстановить через `/proc/PID/fd`
- [ ] Включить `net.ipv4.ip_forward` через `sysctl -w`, затем сделать настройку постоянной через `/etc/sysctl.d/`

## Лаборатория

```bash setup
lab_unit() { systemctl stop "$1" 2>/dev/null; systemctl reset-failed "$1" 2>/dev/null; true; }
mkdir -p /opt/lab
```

### Вернуть удалённый файл

Кто-то удалил `~/data/orders.csv` — выгрузку заказов, копии нет. Но программа `orders-exporter` до сих пор держит этот файл открытым. Восстановите файл на прежнее место **с полным содержимым**.

```bash setup
lab_unit lab-exporter
rm -rf /home/student/data
mkdir -p /home/student/data
{ echo "id,customer,total"; for i in $(seq 1 500); do echo "$i,customer$((i % 37)),$((i * 7 % 1000))"; done; } > /home/student/data/orders.csv
chown -R student:student /home/student/data
md5sum < /home/student/data/orders.csv > /var/lib/lab/orders.md5
cat > /opt/lab/orders-exporter <<'EOF'
#!/usr/bin/env python3
import time
f = open("/home/student/data/orders.csv")
while True:
    time.sleep(60)
EOF
chmod 755 /opt/lab/orders-exporter
systemd-run -q --unit=lab-exporter -p User=student /opt/lab/orders-exporter
sleep 1
rm -f /home/student/data/orders.csv
```

```bash check
f=/home/student/data/orders.csv
[ -f $f ] || fail "~/data/orders.csv нет"
[ "$(md5sum < $f)" = "$(cat /var/lib/lab/orders.md5)" ] || fail "Файл есть, но содержимое не совпадает с исходным ($(wc -l < $f) строк)"
ok "orders.csv восстановлен: $(wc -l < $f) строк"
```

```text hint
1. Найти PID программы.
2. В каталоге процесса в /proc есть подкаталог с его открытыми файловыми дескрипторами — это ссылки на файлы. Удалённый файл помечен там словом «deleted».
3. Через такую ссылку файл можно прочитать, пока процесс жив, — и скопировать куда нужно.
```

```bash solution
pid=$(pgrep -f orders-exporter)
ls -l /proc/$pid/fd/
fd=$(ls -l /proc/$pid/fd/ | awk '/orders.csv \(deleted\)/ {print $9}')
cp /proc/$pid/fd/$fd ~/data/orders.csv
```

```text review
Эталон: `ls -l /proc/<PID>/fd` → `cp /proc/<PID>/fd/<N> ~/data/orders.csv`.

- Удаление (`rm`) убирает только **имя** файла. Данные живут, пока на них ссылается хоть одно имя или открытый дескриптор.
- `/proc/PID/fd/N` — дескрипторы процесса; через них можно читать удалённые файлы. Найти все такие файлы в системе: `lsof +L1` (или `lsof | grep deleted`).
- Обратная сторона: удалённый, но открытый лог продолжает занимать место — `df` показывает, что диск полон, а `du` его «не видит». Лечится перезапуском программы или усечением через `: > /proc/PID/fd/N`.
- Ещё полезное в `/proc/PID`: `cmdline`, `environ`, `cwd`, `exe`, `status`, `limits`.
```

### Где работает процесс

Процесс `mystery-job` пишет какие-то файлы в свой текущий каталог. Узнайте его **текущий рабочий каталог** и запишите полный путь в `~/cwd.txt`.

```bash setup
lab_unit lab-mystery
d=/var/tmp/job-$(tr -dc a-z0-9 </dev/urandom | head -c 6)
rm -rf /var/tmp/job-*
mkdir -p $d && chown student:student $d
echo $d > /var/lib/lab/mystery-cwd
cat > /opt/lab/mystery-job <<'EOF'
#!/bin/bash
while true; do date > out.txt; sleep 5; done
EOF
chmod 755 /opt/lab/mystery-job
rm -f /home/student/cwd.txt
systemd-run -q --unit=lab-mystery -p User=student -p WorkingDirectory=$d /opt/lab/mystery-job
```

```bash check
want=$(cat /var/lib/lab/mystery-cwd)
[ -f /home/student/cwd.txt ] || fail "Нет ~/cwd.txt"
got=$(tr -d '[:space:]' < /home/student/cwd.txt)
[ "$got" = "$want" ] || fail "В ~/cwd.txt «$got» — это не рабочий каталог mystery-job"
ok "mystery-job работает в $want"
```

```text hint
В каталоге процесса в /proc есть символическая ссылка на его текущий каталог. Прочитать, куда ведёт ссылка, можно отдельной командой.
```

```bash solution
pid=$(pgrep -f /opt/lab/mystery-job)
readlink /proc/$pid/cwd > ~/cwd.txt
```

```text review
Эталон: `readlink /proc/<PID>/cwd`.

- Также `pwdx <PID>` или `lsof -p <PID> | grep cwd`.
- `/proc/PID/exe` — какой бинарник реально запущен (полезно, если файл подменили или удалили), `/proc/PID/root` — корень процесса (у процесса в контейнере — файловая система контейнера).
- Относительные пути в программе отсчитываются от cwd. У службы systemd он задаётся `WorkingDirectory=`, иначе это `/`.
```

### Параметр ядра — сейчас и навсегда

Для базы данных рекомендуют уменьшить склонность ядра к свопу: параметр `vm.swappiness` должен быть равен `10`. Примените значение **сразу** (без перезагрузки) и сделайте так, чтобы оно **сохранилось после перезагрузки** — отдельным файлом настроек.

```bash setup
sysctl -qw vm.swappiness=60
for f in /etc/sysctl.d/*.conf /etc/sysctl.conf; do [ -f "$f" ] && sed -i '/^[[:space:]]*vm\.swappiness/d' "$f"; done
true
```

```bash check
[ "$(sysctl -n vm.swappiness)" = 10 ] || fail "Сейчас vm.swappiness = $(sysctl -n vm.swappiness)"
files=$(grep -lE '^[[:space:]]*vm\.swappiness[[:space:]]*=[[:space:]]*10[[:space:]]*$' /etc/sysctl.d/*.conf 2>/dev/null)
[ -n "$files" ] || fail "Значение не сохранено в файле настроек в /etc/sysctl.d/ — после перезагрузки вернётся 60"
ok "vm.swappiness = 10, сохранено в $files"
```

```text hint
1. Параметры ядра видны как файлы в /proc/sys (точки в имени — это каталоги), а для чтения и записи есть отдельная утилита с ключом «записать».
2. Чтобы значение пережило перезагрузку, его кладут в свой файл с расширением .conf в каталоге настроек этой утилиты.
3. Применить все файлы настроек можно той же утилитой с ключом «системные».
```

```bash solution
sudo sysctl -w vm.swappiness=10
echo 'vm.swappiness = 10' | sudo tee /etc/sysctl.d/90-swappiness.conf >/dev/null
sudo sysctl --system >/dev/null
sysctl vm.swappiness
```

```text review
Эталон: `sysctl -w vm.swappiness=10` + файл `/etc/sysctl.d/90-swappiness.conf`.

- `sysctl -w` меняет значение только до перезагрузки. Постоянное — файлы `/etc/sysctl.d/*.conf`; применяются по порядку имён, поэтому свои называют с большим номером.
- `/proc/sys/vm/swappiness` и `sysctl vm.swappiness` — одно и то же: `echo 10 | sudo tee /proc/sys/vm/swappiness` тоже сработает (но тоже до перезагрузки).
- Часто меняют: `net.ipv4.ip_forward` (маршрутизация, Docker, Kubernetes), `fs.inotify.max_user_watches`, `net.core.somaxconn`, `vm.max_map_count` (Elasticsearch).
- `/etc/sysctl.conf` тоже читается, но отдельные файлы удобнее раскатывать Ansible и откатывать.
```

```text notes
>>\s*/etc/sysctl\.conf|nano\s+/etc/sysctl\.conf|vim?\s+/etc/sysctl\.conf => Значение дописывалось в /etc/sysctl.conf. Работает, но свои настройки удобнее держать отдельным файлом в /etc/sysctl.d/.
```

## Тест

### Что такое /proc?
- [ ] Каталог с программами процессора
- [x] Псевдофайловая система, через которую ядро показывает информацию о процессах и системе
- [ ] Каталог временных файлов процессов
- [ ] Раздел подкачки
> Файлов на диске нет — содержимое генерируется при чтении.

### Откуда утилиты ps и top берут информацию о процессах?
- [ ] Из /var/log/processes
- [x] Из файлов /proc/PID/stat, /proc/PID/status и других файлов в /proc
- [ ] Напрямую из оперативной памяти через драйвер
- [ ] Из systemd
> Проверить можно через strace: видно, как ps открывает файлы в /proc.

### В каком файле хранится полная командная строка процесса 1234?
= /proc/1234/cmdline
> Аргументы разделены нулевыми байтами, для чтения удобно `tr '\0' ' '`.

### Как узнать, сколько памяти (RSS) занимает процесс, через /proc?
- [ ] cat /proc/PID/limits
- [x] Посмотреть VmRSS в /proc/PID/status
- [ ] cat /proc/PID/cwd
- [ ] ls /proc/PID/fd
> В status собраны состояние, PPID, UID, память и число потоков в удобном виде.

### Что лежит в /proc/PID/fd?
- [ ] Логи процесса
- [x] Ссылки на открытые процессом файловые дескрипторы: файлы, сокеты, пайпы
- [ ] Конфигурация процесса
- [ ] Дочерние процессы
> Количество записей — число открытых файлов. Помогает при ошибке «Too many open files».

### Какой файл читает команда free?
= /proc/meminfo
> MemAvailable оттуда — оценка памяти, доступной новым приложениям.

### Что такое /proc/self?
- [ ] Каталог процесса PID 1
- [x] Ссылка на каталог /proc того процесса, который её читает
- [ ] Каталог ядра
- [ ] Каталог текущего пользователя
> `cat /proc/self/status` покажет информацию о самом процессе cat.

### Файл лога удалили, но приложение продолжает в него писать, и место на диске не освобождается. Как достать его содержимое?
- [ ] Это невозможно
- [x] Скопировать из /proc/PID/fd/N — ссылки на открытый удалённый файл
- [ ] Найти в /tmp
- [ ] Выполнить undelete
> Пока процесс держит файл открытым, данные остаются на диске.

### Как изменить параметр ядра net.ipv4.ip_forward так, чтобы настройка сохранилась после перезагрузки?
- [ ] sysctl -w net.ipv4.ip_forward=1
- [x] Записать параметр в файл в /etc/sysctl.d/ и применить через sysctl --system
- [ ] echo 1 > /proc/sys/net/ipv4/ip_forward
- [ ] Изменить /proc/cmdline
> `sysctl -w` и запись в /proc/sys действуют только до перезагрузки.

### Где посмотреть load average за 1, 5 и 15 минут без утилит?
- [ ] /proc/uptime
- [x] /proc/loadavg
- [ ] /proc/cpuinfo
- [ ] /proc/stat
> В этом же файле — число выполняемых и всех процессов и последний выданный PID.

### Как узнать, в каком каталоге работает процесс 1234?
- [x] ls -l /proc/1234/cwd
- [x] readlink /proc/1234/cwd
- [ ] cat /proc/1234/status
- [ ] cat /proc/1234/environ
> `cwd` — символическая ссылка на текущий каталог процесса.

### Где смотреть лимит открытых файлов для конкретного процесса?
- [ ] /etc/limits
- [x] /proc/PID/limits
- [ ] /proc/sys/fs/file-max
- [ ] /proc/PID/maps
> `/proc/sys/fs/file-max` — общий лимит системы, а не процесса.

### Что верно для /proc и /sys?
- [x] Обе — виртуальные файловые системы, их содержимое формирует ядро
- [x] В /sys описаны устройства, драйверы и подсистемы ядра, например cgroups
- [ ] Их содержимое нужно бэкапить
- [ ] Они хранятся на отдельном разделе диска
> Бэкапить их бессмысленно: после перезагрузки ядро создаст содержимое заново.
