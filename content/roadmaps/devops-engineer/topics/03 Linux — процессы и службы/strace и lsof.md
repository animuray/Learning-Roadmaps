---
title: strace и lsof
slug: strace-i-lsof
description: Как подсмотреть, что делает процесс, — системные вызовы через strace и ltrace, открытые файлы и сокеты через lsof.
duration: 60
level: Продвинутый
optional: true
quizSize: 10
materials:
  - title: man7 — strace(1)
    url: https://man7.org/linux/man-pages/man1/strace.1.html
    type: документация
  - title: Хабр — Процессы в Linux (системные вызовы fork, exec)
    url: https://habr.com/ru/articles/423049/
    type: статья
---

# strace и lsof

Необязательная тема, но очень полезная. Когда в логах пусто, а программа ведёт себя странно — не стартует без понятной ошибки, зависает, «не видит» конфиг, — можно подсмотреть, что она на самом деле делает.

## Системные вызовы

Программа не может сама прочитать файл или открыть сокет — она просит ядро через **системные вызовы** (syscalls):

| Вызов | Что делает |
| --- | --- |
| `openat`, `read`, `write`, `close` | Работа с файлами |
| `stat`, `access` | Проверить файл, права |
| `execve` | Запустить программу |
| `clone`, `fork` | Создать процесс или поток |
| `socket`, `connect`, `accept`, `sendto`, `recvfrom` | Сеть |
| `futex`, `poll`, `epoll_wait` | Ожидание событий и блокировок |

## strace — трассировка системных вызовов

```bash
strace ls /tmp                          # все вызовы команды
strace -f ./start.sh                    # следить и за дочерними процессами
strace -e trace=openat,stat nginx -t    # только определённые вызовы
strace -e trace=file ./app              # всё, что связано с файлами
strace -e trace=network curl example.com
strace -p 1234                          # подключиться к работающему процессу
strace -tt -T -p 1234                   # с метками времени и длительностью вызовов
strace -c ./app                         # статистика: какие вызовы и сколько времени
strace -o trace.log -f -s 200 ./app     # в файл, строки до 200 символов
```

Строка вывода — это вызов, его аргументы и результат:

```
openat(AT_FDCWD, "/etc/myapp/config.yml", O_RDONLY) = -1 ENOENT (No such file or directory)
openat(AT_FDCWD, "/var/log/myapp.log", O_WRONLY|O_APPEND) = -1 EACCES (Permission denied)
connect(3, {sa_family=AF_INET, sin_port=htons(5432), sin_addr=inet_addr("10.0.0.5")}, 16) = -1 ECONNREFUSED
```

Типичные находки:

- **ENOENT** — программа ищет файл не там, где вы думали. Так находят «правильный» путь к конфигу.
- **EACCES** — не хватает прав на конкретный файл или каталог.
- **ECONNREFUSED** или зависание на `connect` — сервис по адресу не слушает или порт закрыт файрволом.
- Процесс завис: `strace -p PID` покажет, на каком вызове он ждёт: `read` из сокета, `futex` (блокировка), `epoll_wait` (просто ждёт событий — это нормально).

> [!warning] strace замедляет процесс
> Трассировка может замедлить программу в разы. На нагруженном продакшене используйте её коротко и прицельно (`-e trace=...`).

**ltrace** — то же для вызовов библиотечных функций (`malloc`, `strlen`, функции libssl), а не ядра.

## lsof — кто что открыл

В Linux «всё есть файл»: обычные файлы, каталоги, сокеты, пайпы, устройства. `lsof` (list open files) показывает, какие процессы что держат открытым.

```bash
sudo lsof -p 1234                 # всё, что открыл процесс
sudo lsof /var/log/app.log        # кто держит этот файл
sudo lsof +D /mnt/data            # кто использует файлы в каталоге
sudo lsof -i :8080                # кто слушает или подключён к порту 8080
sudo lsof -i -P -n                # все сетевые соединения (без резолва имён и портов)
sudo lsof -u www-data             # файлы пользователя
sudo lsof +L1                     # удалённые, но ещё открытые файлы
```

### Типовые ситуации

**`umount: target is busy`** — диск нельзя отмонтировать, пока его используют:

```bash
sudo lsof +D /mnt/data
sudo fuser -vm /mnt/data          # альтернатива: кто использует точку монтирования
```

**Удалили большой лог, а место не освободилось:**

```bash
sudo lsof +L1 | grep deleted
# java  4321 app  12w  REG  8,1  53687091200  0  /var/log/app.log (deleted)
```

Процесс 4321 держит удалённый файл размером 50 ГБ. Варианты: перезапустить процесс или обрезать файл через дескриптор: `: > /proc/4321/fd/12`.

**Кто занял порт:** `sudo lsof -i :80` (то же покажет `ss -tulpn`, о нём — в теме «Сетевая диагностика»).

**Too many open files:** сравните `ls /proc/PID/fd | wc -l` с лимитом в `/proc/PID/limits`, а `lsof -p PID` покажет, что именно открыто: часто это незакрытые сокеты.

## Практика

- [ ] Выполнить `strace -e trace=openat cat /etc/hostname` и найти в выводе открытие файла
- [ ] Выяснить через `strace -e trace=file`, какие конфигурационные файлы читает при запуске `ssh` или `git`
- [ ] Подключиться через `strace -p` к процессу `sleep` и к простаивающему веб-серверу и объяснить, на каком вызове они ждут
- [ ] Через `lsof -i -P -n` найти все процессы, которые слушают порты
- [ ] Воспроизвести «удалённый, но открытый файл»: `python3 -c "import time; f=open('/tmp/big','w'); f.write('x'*10**8); f.flush(); time.sleep(600)" &`, удалить файл, найти его через `lsof +L1` и посмотреть `df`
- [ ] Смонтировать диск или каталог, зайти в него в другом терминале и разобраться с ошибкой `target is busy` через `fuser` или `lsof`

## Лаборатория

```bash setup
lab_unit() { systemctl stop "$1" 2>/dev/null; systemctl reset-failed "$1" 2>/dev/null; true; }
mkdir -p /opt/lab
```

### Место пропало, а файлов нет

Служба `lab-logger` пишет лог, который кто-то удалил командой `rm`. Место на диске при этом не освободилось: `du` не находит, куда оно делось. Освободите место, **не останавливая и не перезапуская** `lab-logger`.

```bash setup
lab_unit lab-logger
rm -f /var/tmp/lab-app.log
cat > /opt/lab/lab-logger <<'EOF'
#!/usr/bin/env python3
import time
f = open("/var/tmp/lab-app.log", "a")
f.write("x" * (200 * 1024 * 1024))
f.flush()
while True:
    f.write(time.ctime() + " still logging\n"); f.flush(); time.sleep(2)
EOF
chmod 755 /opt/lab/lab-logger
systemd-run -q --unit=lab-logger -p User=student /opt/lab/lab-logger
for i in $(seq 50); do [ "$(stat -c %s /var/tmp/lab-app.log 2>/dev/null || echo 0)" -gt 200000000 ] && break; sleep 0.2; done
rm -f /var/tmp/lab-app.log
systemctl show -p MainPID --value lab-logger > /var/lib/lab/logger-pid
```

```bash check
pid=$(cat /var/lib/lab/logger-pid)
[ -d /proc/$pid ] || fail "Процесс lab-logger (PID $pid) больше не работает — его остановили или перезапустили"
fd=$(ls -l /proc/$pid/fd 2>/dev/null | awk '/lab-app.log \(deleted\)/ {print $9}' | head -1)
[ -n "$fd" ] || fail "lab-logger больше не держит удалённый лог — похоже, его перезапустили"
sz=$(stat -L -c %s /proc/$pid/fd/$fd)
[ "$sz" -lt 10485760 ] || fail "Удалённый, но открытый файл всё ещё занимает $((sz / 1024 / 1024)) МБ"
ok "место освобождено, lab-logger работает (файл сейчас $sz байт)"
```

```text hint
1. Найти файлы, которые удалены, но всё ещё открыты каким-то процессом, — у lsof есть ключ «файлы без единой ссылки в каталогах».
2. Запомнить PID процесса и номер дескриптора (колонка FD, без буквы режима).
3. Через путь к дескриптору в /proc файл можно обнулить, не трогая процесс, — например, пустым перенаправлением.
```

```bash solution
lsof +L1 2>/dev/null | grep lab-app.log
pid=$(pgrep -f /opt/lab/lab-logger)
fd=$(ls -l /proc/$pid/fd | awk '/lab-app.log \(deleted\)/ {print $9}')
: > /proc/$pid/fd/$fd
df -h /var/tmp
```

```text review
Эталон: `lsof +L1` → `: > /proc/<PID>/fd/<N>`.

- Классика ночных алертов «диск 100%»: лог удалили `rm` вместо ротации, а процесс продолжает держать файл. `df` видит занятое место, `du` — нет, потому что у файла больше нет имени.
- Варианты: обнулить через `/proc/PID/fd/N` (процесс продолжает писать), перезапустить программу (дескриптор закроется) или `reload`, если программа переоткрывает логи.
- Профилактика — logrotate с `postrotate`/`copytruncate` вместо ручного `rm`, и правило: живые логи обнуляют (`: > app.log`), а не удаляют.
- `lsof -p PID` — все файлы процесса, `lsof /var/log/app.log` — кто держит файл, `lsof -i :80` — кто на порту.
```

```text notes
systemctl\s+(restart|stop)\s+lab-logger|kill\s+[^\n]*lab-logger => lab-logger останавливали или перезапускали — по условию так нельзя. Место освобождают обнулением через /proc/PID/fd.
```

### Кто занял порт

Новое приложение не стартует: «Address already in use», порт `7070` кем-то занят. Найдите процесс, который **слушает TCP-порт 7070**, и запишите его PID в `~/port-pid.txt`.

```bash setup
lab_unit lab-squatter
rm -f /home/student/port-pid.txt
systemd-run -q --unit=lab-squatter python3 -m http.server 7070 --bind 0.0.0.0 --directory /tmp
for i in $(seq 20); do ss -ltnH 'sport = :7070' | grep -q . && break; sleep 0.25; done
```

```bash check
want=$(systemctl show -p MainPID --value lab-squatter)
[ -f /home/student/port-pid.txt ] || fail "Нет ~/port-pid.txt"
got=$(tr -d '[:space:]' < /home/student/port-pid.txt)
[ "$got" = "$want" ] || fail "В ~/port-pid.txt «$got» — это не процесс, который слушает порт 7070"
ok "порт 7070 слушает PID $want ($(ps -o args= -p $want))"
```

```text hint
1. Список слушающих сокетов вместе с процессами показывает утилита ss (или lsof с фильтром по порту). Процесс принадлежит root — без прав администратора колонка процессов будет пустой.
2. Отфильтровать по порту и достать PID.
```

```bash solution
sudo ss -ltnp 'sport = :7070'
sudo lsof -t -iTCP:7070 -sTCP:LISTEN > ~/port-pid.txt
```

```text review
Эталон: `sudo ss -ltnp 'sport = :7070'` или `sudo lsof -iTCP:7070 -sTCP:LISTEN`.

- `ss -ltnp`: `l` — слушающие, `t` — TCP, `n` — номера вместо имён, `p` — процессы. Для UDP — `-u`. Это первая команда при «порт занят» и «сервис недоступен».
- Без `sudo` процессы других пользователей не видны — частая причина «ss показывает порт, но без процесса».
- `fuser 7070/tcp` — коротко PID; `fuser -k 7070/tcp` — сразу убить (осторожно).
- Дальше решают: остановить лишнее (`systemctl stop ...`) или перенести своё приложение на другой порт.
```

### Какой конфиг ищет программа

Утилита `lab-tool` (запускается через `sudo lab-tool`) при старте ищет свой файл настроек, не находит его и молча завершается с ошибкой. Документации нет. Выясните **трассировкой системных вызовов**, какой файл она пытается найти, и создайте его (пустым). После этого `sudo lab-tool` должна печатать `config ok`.

```bash setup
rm -rf /etc/labtool-*
d=/etc/labtool-$(tr -dc a-z0-9 </dev/urandom | head -c 6)
echo "$d/settings.ini" > /var/lib/lab/labtool-conf
cat > /usr/local/bin/lab-tool <<EOF
#!/bin/bash
[ -r "$d/settings.ini" ] && { echo "config ok"; exit 0; }
exit 1
EOF
chmod 700 /usr/local/bin/lab-tool
```

```bash check
c=$(cat /var/lib/lab/labtool-conf)
[ -f "$c" ] || fail "Файла, который ищет lab-tool, нет"
[ "$(/usr/local/bin/lab-tool)" = "config ok" ] || fail "lab-tool по-прежнему не находит настройки"
ok "lab-tool нашла $c"
```

```text hint
1. Запустить утилиту под трассировщиком системных вызовов (от root, как и саму утилиту), следя и за дочерними процессами.
2. Оставить только вызовы, которые работают с путями к файлам, и найти неудачные — с ошибкой «нет такого файла».
3. Создать нужный каталог и файл.
```

```bash solution
sudo strace -f -e trace=file lab-tool 2>&1 | grep ENOENT | grep -v -e '/lib' -e '/usr/' | tail -3
c=$(sudo strace -f -e trace=file lab-tool 2>&1 | grep -oE '"/etc/labtool-[^"]+"' | tr -d '"' | head -1)
sudo mkdir -p "$(dirname "$c")"
sudo touch "$c"
sudo lab-tool
```

```text review
Эталон: `sudo strace -f -e trace=file lab-tool 2>&1 | grep ENOENT`.

- `strace` показывает каждый системный вызов: какие файлы программа открывает (`openat`), проверяет (`access`, `stat`), куда подключается (`connect`), что пишет. Это способ понять «чёрный ящик» без исходников.
- Полезные ключи: `-f` — следить за дочерними процессами, `-e trace=file|network|process`, `-p PID` — подключиться к работающему процессу, `-o файл` — вывод в файл, `-tt -T` — время и длительность вызовов (ищем, на чём висит).
- Типичные находки: программа читает не тот конфиг, ищет библиотеку не там, висит на `connect` к недоступному хосту или на `futex` (ждёт блокировку).
- strace сильно замедляет программу — на нагруженном проде с осторожностью.
```

```text notes
cat\s+[^\n]*/usr/local/bin/lab-tool => Путь подсмотрели в исходнике скрипта. Здесь это возможно, но у бинарных программ исходника нет — strace работает с любыми.
```

## Тест

### Что показывает strace?
- [ ] Использование памяти процессом
- [x] Системные вызовы, которые процесс делает к ядру, их аргументы и результаты, а также полученные сигналы
- [ ] Сетевой трафик процесса
- [ ] Исходный код программы
> Для вызовов библиотечных функций есть ltrace.

### Как подключить strace к уже работающему процессу с PID 1234?
= strace -p 1234
= sudo strace -p 1234
> Добавьте `-f`, чтобы видеть и потоки, и дочерние процессы.

### В выводе strace видна строка openat(..., "/etc/app/config.yml", ...) = -1 ENOENT. Что это значит?
- [ ] Нет прав на файл
- [x] Файла по этому пути нет — программа ищет конфиг там, где его нет
- [ ] Файл открыт успешно
- [ ] Файл слишком большой
> ENOENT — No such file or directory. Нет прав — EACCES.

### Как с помощью strace посмотреть только работу с файлами?
- [ ] strace --files ./app
- [x] strace -e trace=file ./app
- [ ] strace -f ./app
- [ ] strace -c ./app
> Аналогично `-e trace=network` — только сетевые вызовы.

### Почему strace нужно осторожно использовать на нагруженном продакшене?
- [ ] Он перезапускает процесс
- [x] Трассировка сильно замедляет процесс
- [ ] Он удаляет логи
- [ ] Он требует перезагрузки ядра
> Используйте фильтры `-e trace=` и короткие сеансы.

### Как узнать, какой процесс держит открытым файл /var/log/app.log?
= lsof /var/log/app.log
= sudo lsof /var/log/app.log
> Также поможет `fuser /var/log/app.log`.

### Как найти удалённые, но всё ещё открытые файлы, которые занимают место на диске?
- [ ] find / -deleted
- [x] lsof +L1 (или lsof | grep deleted)
- [ ] df -i
- [ ] du -sh /
> `+L1` — файлы, у которых осталось меньше одной ссылки, то есть удалённые.

### При umount появляется ошибка target is busy. Как найти виновника?
- [x] lsof +D /mnt/data
- [x] fuser -vm /mnt/data
- [ ] umount -9 /mnt/data
- [ ] df -h /mnt/data
> Часто виновата ваша же оболочка, которая находится в этом каталоге (`cd /mnt/data`).

### Как через lsof узнать, какой процесс слушает порт 8080?
= lsof -i :8080
= sudo lsof -i :8080
> То же умеет `ss -tulpn | grep 8080`.

### Процесс завис. strace -p показывает, что он висит на вызове connect() к 10.0.0.5:5432. О чём это говорит?
- [ ] Процесс ждёт ввода с клавиатуры
- [x] Процесс пытается подключиться к сервису по сети (вероятно, к PostgreSQL), и соединение не устанавливается — проблема с сетью, файрволом или самим сервисом
- [ ] Процесс читает файл с диска
- [ ] Процесс завершился
> Дальше проверяйте доступность хоста и порта сетевыми утилитами.

### Чем ltrace отличается от strace?
- [ ] Ничем
- [x] ltrace показывает вызовы функций динамических библиотек, а strace — системные вызовы ядра
- [ ] ltrace работает только с сетью
- [ ] ltrace показывает логи
> Например, ltrace покажет вызовы функций libssl, которых strace не видит.

### Что означает ошибка EACCES в выводе strace?
- [ ] Файл не найден
- [x] Нет прав доступа к файлу или каталогу
- [ ] Соединение отклонено
- [ ] Процесс получил сигнал
> Проверьте права на сам файл и на все каталоги по пути к нему.
