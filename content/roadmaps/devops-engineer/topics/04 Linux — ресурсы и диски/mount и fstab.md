---
title: mount и fstab
slug: mount-i-fstab
description: Как подключить новый диск — lsblk, разметка, mkfs, mount и umount, UUID и постоянное монтирование через /etc/fstab.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: ArchWiki — fstab (на русском)
    url: https://wiki.archlinux.org/title/Fstab_(%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9)
    type: документация
  - title: Debian Wiki — fstab (на русском)
    url: https://wiki.debian.org/ru/fstab
    type: документация
  - title: ArchWiki — mount (на русском)
    url: https://wiki.archlinux.org/title/Mount_(%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9)
    type: документация
---

# mount и fstab

В Linux одно дерево каталогов. Чтобы пользоваться диском, его файловую систему нужно **смонтировать** — подключить к каталогу (точке монтирования). Типичная задача DevOps: к виртуальной машине подключили новый диск под данные, его нужно разметить, отформатировать, смонтировать и прописать в `/etc/fstab`, чтобы он подключался после перезагрузки.

## Посмотреть диски

```bash
lsblk                 # дерево дисков и разделов
lsblk -f              # плюс файловые системы, метки и UUID
sudo blkid            # UUID и типы ФС
findmnt               # что куда смонтировано (дерево)
df -hT                # смонтированные ФС и место
```

Имена устройств: `/dev/sda`, `/dev/sdb` (SATA, SCSI, многие ВМ), `/dev/vda` (virtio в KVM), `/dev/nvme0n1` (NVMe). Разделы: `/dev/sdb1`, `/dev/nvme0n1p1`.

## Подключить новый диск

```bash
# 1. Разметить: создать таблицу разделов GPT и один раздел на весь диск
sudo parted /dev/sdb --script mklabel gpt mkpart primary ext4 0% 100%
# (или интерактивно: sudo fdisk /dev/sdb)

# 2. Создать файловую систему
sudo mkfs.ext4 -L data /dev/sdb1

# 3. Создать точку монтирования и смонтировать
sudo mkdir -p /mnt/data
sudo mount /dev/sdb1 /mnt/data
df -h /mnt/data
```

Диск можно отформатировать и целиком, без разделов (`mkfs.ext4 /dev/sdb`). Часто так делают в облаках и под LVM, но таблица разделов делает разметку понятнее для других утилит и людей.

## mount и umount

```bash
sudo mount /dev/sdb1 /mnt/data
sudo mount -o ro /dev/sdb1 /mnt/data        # только чтение
sudo mount -o remount,rw /                  # перемонтировать с другими опциями
sudo mount --bind /srv/www /var/www         # bind mount: показать каталог в другом месте
sudo umount /mnt/data                       # отмонтировать (umount, без n!)
```

`umount: target is busy` — кто-то использует ФС: процесс с открытыми файлами или ваша же оболочка в этом каталоге. Найти виновника: `sudo lsof +D /mnt/data` или `sudo fuser -vm /mnt/data`.

## /etc/fstab — монтирование при загрузке

```
# <устройство>                            <точка>    <тип>  <опции>           <dump> <pass>
UUID=0a3407de-014b-458b-b5c1-848e92a327a3 /          ext4   defaults           0      1
UUID=b411dc99-f0a0-4c87-9e05-184977be8539 /mnt/data  ext4   defaults,nofail    0      2
/swapfile                                 none       swap   sw                 0      0
```

| Поле | Значение |
| --- | --- |
| Устройство | Лучше **UUID=** или **LABEL=**, а не `/dev/sdb1` |
| Точка монтирования | Каталог (должен существовать) |
| Тип | `ext4`, `xfs`, `vfat`, `nfs`, `swap`… |
| Опции | `defaults`, `noatime`, `nofail`, `ro`, `noexec`, `nosuid` |
| dump | Устаревшее поле для утилиты dump, почти всегда `0` |
| pass | Порядок проверки `fsck` при загрузке: `1` — корень, `2` — остальные, `0` — не проверять (для XFS и btrfs ставят `0`) |

### Почему UUID, а не /dev/sdb1

Имена устройств назначаются при загрузке в порядке обнаружения. Добавили диск или сменили контроллер — и `/dev/sdb` стал `/dev/sdc`. Тогда система смонтирует не тот диск или не загрузится. UUID записан в самой файловой системе и не меняется.

### Полезные опции

- **`nofail`** — если диска нет, загрузка продолжится. Обязательна для съёмных и облачных дисков, которые могут подключиться позже.
- **`noatime`** — не обновлять время доступа при каждом чтении, меньше записей на диск.
- **`noexec`**, **`nosuid`** — запретить запуск программ и SUID-биты (например, для `/tmp`).

> [!warning] Ошибка в fstab = сервер не загрузится
> Опечатка в fstab может отправить систему в **emergency mode** при загрузке. На облачной ВМ без консоли это авария. Поэтому после правки **всегда** проверяйте:
> ```bash
> sudo findmnt --verify          # проверка синтаксиса и устройств
> sudo systemctl daemon-reload   # systemd генерирует mount-юниты из fstab
> sudo mount -a                  # смонтировать всё из fstab — ошибки всплывут сейчас, а не при перезагрузке
> ```

## Практика

- [ ] Добавить к виртуальной машине второй диск (в VirtualBox или облаке), найти его через `lsblk`
- [ ] Разметить диск, создать ext4, смонтировать в `/mnt/data`, записать туда файл
- [ ] Прописать диск в `/etc/fstab` по UUID с опцией `nofail`, проверить через `findmnt --verify` и `mount -a`, перезагрузиться и убедиться, что диск на месте
- [ ] Зайти в `/mnt/data` в одном терминале и попробовать `umount` в другом; найти виновника через `fuser` или `lsof`
- [ ] Сделать bind mount каталога и посмотреть его в `findmnt`

## Лаборатория

Диски здесь — файлы-образы, подключённые как loop-устройства. Для каждого задачи сделана ссылка вида `/dev/lab-имя`.

```bash setup
export LVM_SUPPRESS_FD_WARNINGS=1
DISKS=/var/lib/lab-disks
# Убрать всё, что могли оставить прошлые задачи с дисками: монтирования, массивы, тома, loop-устройства
lab_disks_reset() {
  for m in $(findmnt -rn -o TARGET | grep -E '^/mnt/(data|app|busy|raid|xfs-lab|ramcache|lab-[a-z]+)$|^/srv/overlay/merged$' | sort -r); do umount -l "$m"; done
  mdadm --stop --scan >/dev/null 2>&1
  for vg in data labvg; do vgremove -qq -ff "$vg" >/dev/null 2>&1; done
  for l in $(losetup -nO NAME,BACK-FILE 2>/dev/null | awk -v d="$DISKS" 'index($2, d) == 1 {print $1}'); do
    pvremove -qq -ff "$l" >/dev/null 2>&1; wipefs -qa "$l" >/dev/null 2>&1; losetup -d "$l"
  done
  rm -f /dev/lab-*; rm -rf "$DISKS"; mkdir -p "$DISKS"
  sed -i -E '\#[[:space:]]/mnt/(data|app|raid|xfs-lab|ramcache)[[:space:]]#d' /etc/fstab
  true
}
# lab_disk имя размер → пустой «диск» /dev/lab-имя (ссылка на loop-устройство)
lab_disk() {
  truncate -s "$2" "$DISKS/$1.img"
  ln -sf "$(losetup -f --show "$DISKS/$1.img")" "/dev/lab-$1"
}
lab_unit() { systemctl stop "$1" 2>/dev/null; systemctl reset-failed "$1" 2>/dev/null; true; }
```

### Подключить новый диск навсегда

К серверу подключили новый пустой диск `/dev/lab-data` (100 МБ). Создайте на нём файловую систему **ext4**, смонтируйте в `/mnt/data`, положите туда файл `hello.txt` и пропишите диск в `/etc/fstab` **по UUID** так, чтобы при отсутствии диска сервер всё равно загрузился.

```bash setup
lab_disks_reset
lab_disk data 100M
rmdir /mnt/data 2>/dev/null; true
```

```bash check
dev=$(readlink -f /dev/lab-data)
[ "$(blkid -s TYPE -o value "$dev" 2>/dev/null)" = ext4 ] || fail "На /dev/lab-data нет файловой системы ext4"
uuid=$(blkid -s UUID -o value "$dev")
[ "$(findmnt -no SOURCE /mnt/data 2>/dev/null)" = "$dev" ] || fail "Диск не смонтирован в /mnt/data"
[ -f /mnt/data/hello.txt ] || fail "На диске нет hello.txt"
line=$(awk -v u="UUID=$uuid" '$1 == u || $1 == "UUID=\""substr(u,6)"\""' /etc/fstab)
[ -n "$line" ] || fail "В /etc/fstab нет строки для этого диска по его UUID"
echo "$line" | awk '{exit !($2 == "/mnt/data" && $3 == "ext4")}' || fail "Строка в fstab не та: нужно монтирование в /mnt/data с типом ext4 — $line"
echo "$line" | awk '{print $4}' | tr ',' '\n' | grep -qx nofail || fail "Если диск пропадёт, загрузка остановится: в опциях нет нужного флага"
tmp=$(mktemp); echo "$line" > $tmp
findmnt --verify --tab-file $tmp >/dev/null 2>&1 || { rm -f $tmp; fail "findmnt --verify находит ошибки в строке fstab"; }
rm -f $tmp
ok "$line"
```

```text hint
1. Создать файловую систему на устройстве и каталог для монтирования, смонтировать, создать файл (каталог принадлежит root).
2. Узнать UUID файловой системы — утилита, которая показывает атрибуты блочных устройств, или lsblk с колонками.
3. Дописать в таблицу монтирования строку из шести полей: что, куда, тип, опции, dump, pass. В опциях кроме «по умолчанию» — флаг «не обязательно».
4. Проверить таблицу: размонтировать и смонтировать «всё из fstab», а также утилитой проверки findmnt.
```

```bash solution
sudo mkfs.ext4 -q /dev/lab-data
sudo mkdir -p /mnt/data
sudo mount /dev/lab-data /mnt/data
echo "hello" | sudo tee /mnt/data/hello.txt >/dev/null
uuid=$(sudo blkid -s UUID -o value "$(readlink -f /dev/lab-data)")
echo "UUID=$uuid /mnt/data ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab >/dev/null
sudo umount /mnt/data
sudo mount -a
findmnt /mnt/data
```

```text review
Эталон: `mkfs.ext4` → `mount` → строка `UUID=... /mnt/data ext4 defaults,nofail 0 2` → `umount` + `mount -a` для проверки.

- **UUID**, а не `/dev/sdb`: имена устройств меняются при добавлении дисков и перезагрузке, UUID файловой системы — нет.
- `nofail` — если диска нет, загрузка продолжится. Без него сломанная строка fstab отправляет сервер в emergency mode — а на облачной ВМ без консоли это часы простоя.
- Перед перезагрузкой всегда `sudo mount -a` (смонтирует всё, что ещё не смонтировано, и покажет ошибки) и `findmnt --verify`.
- Последние два поля: dump (0 — не бэкапить старой утилитой dump) и pass (порядок проверки fsck: 1 — корень, 2 — остальные, 0 — не проверять).
```

```text notes
^[^\n]*/dev/(lab-data|loop[0-9]+)\s+/mnt/data[^\n]*>>\s*/etc/fstab|tee\s+-a\s+/etc/fstab[^\n]*/dev/loop => В fstab вписывалось имя устройства. Имена /dev/sdX и /dev/loopN меняются — пишите UUID.
```

### Размонтировать занятый раздел

Раздел `/mnt/busy` нужно отключить для обслуживания, но `umount` отвечает «target is busy». Выясните, какой процесс держит раздел, завершите его (он не важен) и **размонтируйте** раздел.

```bash setup
lab_disks_reset
lab_unit lab-busy
lab_disk busy 50M
mkfs.ext4 -q -F /dev/lab-busy
mkdir -p /mnt/busy
mount /dev/lab-busy /mnt/busy
mkdir -p /mnt/busy/work && chown student:student /mnt/busy/work
systemd-run -q --unit=lab-busy -p User=student -p WorkingDirectory=/mnt/busy/work bash -c 'while true; do date > now.txt; sleep 5; done'
sleep 1
```

```bash check
findmnt /mnt/busy >/dev/null && fail "/mnt/busy всё ещё смонтирован"
grep -qs ' /mnt/busy ' /proc/mounts && fail "/mnt/busy всё ещё смонтирован"
ok "/mnt/busy размонтирован"
```

```text hint
1. Попробовать отмонтировать и прочитать ошибку.
2. Есть утилиты, которые показывают процессы, использующие файловую систему (в том числе как текущий каталог): одна — с ключом «смонтированная ФС», другая — список открытых файлов по пути.
3. Завершить найденный процесс и повторить отмонтирование.
```

```bash solution
sudo umount /mnt/busy || true
sudo fuser -vm /mnt/busy
sudo fuser -km /mnt/busy
sleep 1
sudo umount /mnt/busy
```

```text review
Эталон: `fuser -vm /mnt/busy` (или `lsof +f -- /mnt/busy`) → завершить процесс → `umount /mnt/busy`.

- «Занятым» раздел делает любой открытый на нём файл **и** любой процесс, у которого там текущий каталог (часто — ваша же оболочка после `cd /mnt/busy`).
- `fuser -km` убивает всех пользователей раздела разом — удобно, но опасно на разделах, где работают нужные службы. Сначала смотрите `-v`.
- `umount -l` (lazy) отключает раздел из дерева сразу, а реально — когда освободится. Помогает в тупиковых случаях, но процессы продолжают писать «в никуда» — для обслуживания диска это не годится.
```

```text notes
umount\s+(-l|--lazy) => Использовался ленивый umount -l: раздел исчез из дерева, но процесс продолжает с ним работать. Для обслуживания диска нужно найти и остановить процесс.
```

## Тест

### Какая команда покажет диски и разделы вместе с файловыми системами и UUID?
= lsblk -f
> Ещё вариант — `sudo blkid`.

### Как смонтировать раздел /dev/sdb1 в каталог /mnt/data?
- [ ] mount /mnt/data /dev/sdb1
- [x] sudo mount /dev/sdb1 /mnt/data
- [ ] mkfs /dev/sdb1 /mnt/data
- [ ] ln -s /dev/sdb1 /mnt/data
> Сначала устройство, потом точка монтирования. Каталог должен существовать.

### Какой командой создать файловую систему ext4 на разделе /dev/sdb1?
= sudo mkfs.ext4 /dev/sdb1
= mkfs.ext4 /dev/sdb1
= mkfs -t ext4 /dev/sdb1
> Все данные на разделе при этом будут потеряны.

### Почему в /etc/fstab лучше указывать UUID, а не /dev/sdb1?
- [ ] UUID короче
- [x] Имена устройств могут поменяться при добавлении дисков или смене контроллера, а UUID записан в самой файловой системе и неизменен
- [ ] /dev/sdb1 не поддерживается в fstab
- [ ] UUID ускоряет загрузку
> Альтернатива — метки `LABEL=`.

### Что означает шестое поле (pass) в строке fstab?
- [ ] Пароль для монтирования
- [x] Порядок проверки файловой системы fsck при загрузке: 1 — корень, 2 — остальные, 0 — не проверять
- [ ] Номер раздела
- [ ] Права на точку монтирования
> Для XFS и btrfs указывают 0: у них свои средства проверки.

### Зачем опция nofail в fstab?
- [ ] Запрещает ошибки записи
- [x] Чтобы система продолжила загрузку, даже если этого диска нет или он не смонтировался
- [ ] Включает журналирование
- [ ] Монтирует диск только для чтения
> Без неё отсутствующий диск может отправить систему в emergency mode.

### Вы отредактировали /etc/fstab. Как проверить изменения, не перезагружая сервер?
- [x] sudo findmnt --verify
- [x] sudo mount -a
- [ ] cat /etc/fstab
- [ ] sudo reboot
> `mount -a` монтирует всё, что ещё не смонтировано, и сразу показывает ошибки.

### Что может случиться, если ошибиться в /etc/fstab и перезагрузиться?
- [ ] Ничего, ошибочная строка просто игнорируется
- [x] Система может не загрузиться и уйти в emergency mode
- [ ] Удалятся данные на диске
- [ ] Сбросится пароль root
> Поэтому изменения в fstab проверяют до перезагрузки.

### umount выдаёт target is busy. Что делать?
- [x] Найти процессы, использующие ФС: lsof +D /mnt/data или fuser -vm /mnt/data
- [x] Выйти из этого каталога в своей оболочке (cd ~)
- [ ] Выполнить rm -rf /mnt/data
- [ ] Переформатировать диск
> Крайний случай — ленивое отмонтирование `umount -l`, но сначала разберитесь, кто держит файлы.

### Что делает опция noatime?
- [ ] Запрещает изменение файлов
- [x] Отключает обновление времени последнего доступа при каждом чтении, уменьшая число записей на диск
- [ ] Отключает журналирование
- [ ] Монтирует ФС без проверки
> Часто используется на серверах с большим количеством чтений.

### Как отмонтировать файловую систему в /mnt/data?
= sudo umount /mnt/data
= umount /mnt/data
> Команда называется umount — без буквы n.

### Что такое bind mount?
- [ ] Монтирование сетевого диска
- [x] Подключение уже существующего каталога ещё в одно место дерева файловой системы
- [ ] Объединение двух дисков в один
- [ ] Монтирование ISO-образа
> Docker использует bind mounts, чтобы пробросить каталоги хоста в контейнер.
