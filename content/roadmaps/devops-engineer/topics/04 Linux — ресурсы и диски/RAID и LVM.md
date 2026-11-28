---
title: RAID и LVM
slug: raid-i-lvm
description: Уровни RAID 0, 1, 5, 10, программный RAID mdadm, а также LVM — PV, VG и LV — и как расширить диск без остановки сервера.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Debian Handbook — RAID и LVM (на русском)
    url: https://www.debian.org/doc/manuals/debian-handbook/advanced-administration.ru.html
    type: книга
  - title: ArchWiki — LVM (на русском)
    url: https://wiki.archlinux.org/title/LVM_(%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9)
    type: документация
---

# RAID и LVM

Обе технологии отделяют то, что видит система (тома), от физических дисков. **RAID** нужен для надёжности и скорости: данные переживают отказ диска. **LVM** нужен для гибкости: тома можно увеличивать, переносить и снимать с них снапшоты без переразметки дисков.

## RAID

**RAID** объединяет несколько дисков в один массив.

| Уровень | Как устроен | Полезный объём из N дисков | Переживает отказ | Применение |
| --- | --- | --- | --- | --- |
| **RAID 0** | Чередование (striping): данные «нарезаются» по дискам | N × диск | **Ни одного** диска | Скорость, временные данные |
| **RAID 1** | Зеркало: одинаковые данные на всех дисках | 1 диск | Всех дисков, кроме одного | Системные диски, надёжность |
| **RAID 5** | Чередование с распределённой чётностью, минимум 3 диска | (N − 1) × диск | 1 диска | Хранилища, где важен объём; медленная запись и долгое восстановление |
| RAID 6 | Двойная чётность, минимум 4 диска | (N − 2) × диск | 2 дисков | Большие массивы |
| **RAID 10** | Зеркала, объединённые чередованием (1 + 0), минимум 4 диска | N / 2 × диск | 1 диска в каждой зеркальной паре | Базы данных: скорость и надёжность |

> [!warning] RAID — не бэкап
> RAID защищает от отказа диска, но не от `rm -rf`, шифровальщика, ошибки в приложении или пожара в дата-центре. Удалённый файл мгновенно удалится со всех дисков массива. Бэкапы нужны всегда.

**Аппаратный RAID** — отдельный контроллер. **Программный** — средствами ядра Linux, утилита `mdadm`:

```bash
sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdb /dev/sdc
cat /proc/mdstat                       # состояние массивов и синхронизации
sudo mdadm --detail /dev/md0
sudo mdadm --manage /dev/md0 --fail /dev/sdc --remove /dev/sdc   # вывести сбойный диск
sudo mdadm --manage /dev/md0 --add /dev/sdd                     # добавить новый — начнётся восстановление
```

В облаках RAID обычно не настраивают: надёжность дисков обеспечивает провайдер.

## LVM

**LVM** (Logical Volume Manager) добавляет слой между дисками и файловыми системами:

```
Диски/разделы:    /dev/sdb      /dev/sdc
                     │              │
PV (Physical Volume) pv            pv        ← pvcreate
                     └──────┬───────┘
VG (Volume Group)        vg_data             ← vgcreate: общий «пул» места
                    ┌───────┴────────┐
LV (Logical Volume)  lv_db       lv_logs      ← lvcreate: «разделы» из пула
                     │              │
ФС                  ext4           xfs        ← mkfs, mount
```

### Создание

```bash
sudo pvcreate /dev/sdb /dev/sdc
sudo vgcreate vg_data /dev/sdb /dev/sdc
sudo lvcreate -L 50G -n lv_db vg_data          # том на 50 ГБ
sudo lvcreate -l 100%FREE -n lv_logs vg_data   # всё оставшееся место
sudo mkfs.ext4 /dev/vg_data/lv_db
sudo mount /dev/vg_data/lv_db /var/lib/postgresql
pvs; vgs; lvs                                  # краткая сводка
```

Том доступен как `/dev/vg_data/lv_db`, он же `/dev/mapper/vg_data-lv_db`.

### Расширение тома — главная причина использовать LVM

```bash
# В группе есть свободное место:
sudo lvextend -r -L +20G /dev/vg_data/lv_db    # -r сразу расширит и файловую систему

# Места в группе нет — добавляем диск:
sudo pvcreate /dev/sdd
sudo vgextend vg_data /dev/sdd
sudo lvextend -r -l +100%FREE /dev/vg_data/lv_db
```

Без `-r` файловую систему расширяют отдельно: `resize2fs` для ext4, `xfs_growfs` для xfs. Расширение работает «на лету», без отмонтирования.

### Частая задача: увеличили диск виртуальной машины

1. В облаке или гипервизоре увеличили диск, например с 50 до 100 ГБ.
2. `sudo growpart /dev/sda 3` — расширить раздел, на котором лежит PV (пакет `cloud-guest-utils`).
3. `sudo pvresize /dev/sda3` — PV увидит новое место.
4. `sudo lvextend -r -l +100%FREE /dev/ubuntu-vg/ubuntu-lv` — расширить том и ФС.

### Снапшоты

```bash
sudo lvcreate -s -L 5G -n lv_db_snap /dev/vg_data/lv_db
```

Снапшот фиксирует состояние тома на момент создания — удобно перед рискованным обновлением. Место под снапшот должно вмещать все изменения, которые произойдут, пока он существует.

## Практика

- [ ] Подключить к ВМ два-три дополнительных диска (или создать loop-устройства из файлов через `losetup`)
- [ ] Собрать RAID 1 через mdadm, посмотреть `/proc/mdstat`, «сломать» один диск через `--fail` и добавить новый
- [ ] Создать PV, VG и два LV, отформатировать их и смонтировать
- [ ] Расширить LV на лету с `-r`, затем добавить в группу ещё один диск и снова расширить
- [ ] Создать снапшот тома, изменить файлы, смонтировать снапшот и убедиться, что в нём старые версии

## Лаборатория

Диски — файлы-образы на loop-устройствах, ссылки `/dev/lab-*`. Все команды LVM и mdadm — через `sudo`.

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
```

### Том LVM на двух дисках

Подключены два пустых диска: `/dev/lab-sdb` и `/dev/lab-sdc` (по 200 МБ). Объедините их в группу томов **`data`**, создайте в ней логический том **`app`** размером **300 МБ** — больше, чем любой из дисков, — с файловой системой ext4 и смонтируйте в `/mnt/app`.

```bash setup
lab_disks_reset
lab_disk sdb 200M
lab_disk sdc 200M
```

```bash check
vgs data >/dev/null 2>&1 || fail "Группы томов data нет"
n=$(vgs --noheadings -o pv_count data | tr -d ' ')
[ "$n" = 2 ] || fail "В группе data физических томов: $n"
lvs data/app >/dev/null 2>&1 || fail "Логического тома app в группе data нет"
sz=$(lvs --noheadings --units m --nosuffix -o lv_size data/app | tr -d ' ' | cut -d. -f1)
[ "$sz" -ge 296 ] || fail "Размер тома app — $sz МБ"
[ "$(findmnt -no FSTYPE /mnt/app 2>/dev/null)" = ext4 ] || fail "В /mnt/app не смонтирована ext4 с тома app"
[ "$(readlink -f "$(findmnt -no SOURCE /mnt/app)")" = "$(readlink -f /dev/data/app)" ] || fail "В /mnt/app смонтирован не том data/app"
ok "$(lvs --noheadings -o vg_name,lv_name,lv_size,devices data | tr -s ' ' | tr '\n' ';')"
```

```text hint
1. Каждый диск пометить как физический том LVM.
2. Создать группу томов с нужным именем из обоих физических томов — её объём будет суммой дисков.
3. Создать в группе логический том нужного размера и имени, отформатировать его (путь вида /dev/группа/том) и смонтировать.
4. Посмотреть результат короткими командами отчёта по физическим томам, группам и логическим томам.
```

```bash solution
sudo pvcreate /dev/lab-sdb /dev/lab-sdc
sudo vgcreate data /dev/lab-sdb /dev/lab-sdc
sudo lvcreate -y -L 300M -n app data
sudo mkfs.ext4 -q /dev/data/app
sudo mkdir -p /mnt/app
sudo mount /dev/data/app /mnt/app
sudo pvs; sudo vgs; sudo lvs
```

```text review
Эталон: `pvcreate` → `vgcreate data` → `lvcreate -L 300M -n app data` → `mkfs.ext4 /dev/data/app` → `mount`.

- Слои LVM: **PV** (диск или раздел) → **VG** (общий пул) → **LV** (том нужного размера). Том может быть больше любого из дисков и растёт на лету.
- Обзор: `pvs`, `vgs`, `lvs` (кратко) и `pvdisplay`, `vgdisplay`, `lvdisplay` (подробно); `lsblk` — как тома легли на диски.
- Важно: такой том **без избыточности** — умрёт любой диск, пропадут данные всего тома. Для надёжности LVM ставят поверх RAID или используют `lvcreate --type raid1`.
- `-l 100%FREE` — занять всё свободное место группы.
```

### Расширить том на лету

Раздел `/mnt/app` (том `data/app`, 100 МБ) почти заполнен. В группе `data` места больше нет, но к серверу подключили ещё один диск `/dev/lab-sdc` (200 МБ). Расширьте `/mnt/app` так, чтобы файловая система была **не меньше 260 МБ**, **не отмонтируя** раздел и не теряя данные.

```bash setup
lab_disks_reset
lab_disk sdb 104M
lab_disk sdc 200M
pvcreate -qq /dev/lab-sdb
vgcreate -qq data /dev/lab-sdb
lvcreate -qq -y -l 100%FREE -n app data
mkfs.ext4 -q /dev/data/app
mkdir -p /mnt/app
mount /dev/data/app /mnt/app
head -c 60000000 /dev/urandom > /mnt/app/data.bin
md5sum /mnt/app/data.bin > /var/lib/lab/app-data.md5
```

```bash check
findmnt /mnt/app >/dev/null || fail "/mnt/app не смонтирован"
md5sum -c --quiet /var/lib/lab/app-data.md5 >/dev/null 2>&1 || fail "Данные на /mnt/app повреждены или пропали"
fs=$(df -BM --output=size /mnt/app | tail -1 | tr -dc 0-9)
[ "$fs" -ge 260 ] || fail "Файловая система в /mnt/app — $fs МБ (сам том: $(lvs --noheadings --units m -o lv_size data/app | tr -d ' '))"
ok "/mnt/app: $fs МБ, данные целы; PV в группе: $(vgs --noheadings -o pv_count data | tr -d ' ')"
```

```text hint
1. Новый диск пометить как физический том и добавить в существующую группу томов.
2. Увеличить логический том на всё свободное место группы. У команды расширения есть ключ, который сразу расширит и файловую систему на нём — иначе том вырастет, а df покажет старый размер.
3. Проверить df.
```

```bash solution
sudo pvcreate /dev/lab-sdc
sudo vgextend data /dev/lab-sdc
sudo lvextend -r -l +100%FREE data/app
df -h /mnt/app
```

```text review
Эталон: `pvcreate /dev/lab-sdc` → `vgextend data /dev/lab-sdc` → `lvextend -r -l +100%FREE data/app`.

- `-r` (`--resizefs`) после расширения тома вызывает `resize2fs` (ext4) или `xfs_growfs` (xfs). Забыли — расширьте ФС отдельно, том уже большой.
- ext4 и xfs растут **на лету**, без отмонтирования. Уменьшение ext4 — только отмонтированной, xfs — никогда.
- В облаке обычно наоборот: увеличивают сам диск в консоли, затем `growpart` (раздел) → `pvresize` → `lvextend -r`.
```

```text notes
umount\s+/mnt/app => Раздел отмонтировали — по условию это не нужно: ext4 растёт на смонтированном разделе.
lvextend(?![^\n]*(-r|--resizefs)) => Том расширяли без -r — файловую систему пришлось растягивать отдельной командой. lvextend -r делает обе операции разом.
```

### Заменить диск в RAID 1

Зеркало `/dev/md/labraid` (RAID 1, смонтировано в `/mnt/raid`) работает в аварийном режиме: один из дисков помечен как неисправный. Уберите сломанный диск из массива и добавьте вместо него новый — `/dev/lab-r3`. Массив должен **восстановиться** до двух рабочих дисков, данные — сохраниться.

```bash setup
lab_disks_reset
lab_disk r1 80M
lab_disk r2 80M
lab_disk r3 80M
mdadm --create /dev/md/labraid --run --quiet --level=1 --raid-devices=2 --metadata=1.2 /dev/lab-r1 /dev/lab-r2 2>/dev/null
mdadm --wait /dev/md/labraid 2>/dev/null; true
mkfs.ext4 -q -F /dev/md/labraid
mkdir -p /mnt/raid
mount /dev/md/labraid /mnt/raid
echo "клиентская база" > /mnt/raid/clients.txt
sync
mdadm --manage /dev/md/labraid --fail /dev/lab-r2 >/dev/null 2>&1
readlink -f /dev/lab-r2 > /var/lib/lab/raid-failed
```

```bash check
md=/dev/md/labraid
mdadm --detail $md >/dev/null 2>&1 || fail "Массива $md нет"
d=$(mdadm --detail $md)
echo "$d" | grep -qE 'State : .*degraded' && fail "Массив всё ещё в аварийном режиме (degraded)"
echo "$d" | grep -qE 'State : .*(recovering|resyncing)' && fail "Массив ещё восстанавливается — подождите и проверьте снова"
[ "$(echo "$d" | awk -F: '/Active Devices/ {gsub(/ /,"",$2); print $2}')" = 2 ] || fail "Рабочих дисков в массиве: $(echo "$d" | awk -F: '/Active Devices/ {print $2}')"
echo "$d" | grep -q "$(readlink -f /dev/lab-r3)" || fail "Нового диска /dev/lab-r3 в массиве нет"
echo "$d" | grep -q "$(cat /var/lib/lab/raid-failed)" && fail "Неисправный диск всё ещё числится в массиве"
grep -q "клиентская база" /mnt/raid/clients.txt 2>/dev/null || fail "Данные на /mnt/raid пропали"
ok "$(grep -A1 '^md' /proc/mdstat | tr -s ' ' | tr '\n' ' ')"
```

```text hint
1. Посмотреть состояние массивов в файле ядра и подробности конкретного массива — там видно, какой диск неисправен.
2. Управляющая утилита RAID умеет удалить диск из массива и добавить новый (режим управления массивом).
3. После добавления начнётся восстановление — дождаться окончания (у утилиты есть ключ ожидания) и проверить состояние.
```

```bash solution
cat /proc/mdstat
sudo mdadm --detail /dev/md/labraid
sudo mdadm --manage /dev/md/labraid --remove /dev/lab-r2
sudo mdadm --manage /dev/md/labraid --add /dev/lab-r3
sudo mdadm --wait /dev/md/labraid || true
cat /proc/mdstat
```

```text review
Эталон: `mdadm --detail` → `mdadm --manage /dev/md/labraid --remove <старый>` → `--add /dev/lab-r3` → дождаться rebuild (`watch cat /proc/mdstat`).

- В `/proc/mdstat`: `[2/1] [U_]` — нужно 2 диска, работает 1. После восстановления — `[2/2] [UU]`.
- Порядок замены на живом сервере: `--fail` (если ядро ещё не пометило) → `--remove` → физически заменить → разметить новый диск так же → `--add`.
- RAID — **не бэкап**: удалённый по ошибке файл исчезнет с обоих дисков. Защищает только от отказа диска.
- Уровни: 0 — скорость без защиты, 1 — зеркало, 5/6 — чётность (переживает 1/2 диска), 10 — зеркала + чередование, для баз.
- Мониторинг: `mdadm --monitor` с почтой или алерт по `node_md_disks{state="failed"}` в Prometheus.
```

## Тест

### Какой уровень RAID не переживает отказ ни одного диска?
= RAID 0
= 0
> RAID 0 только ускоряет работу: отказ любого диска уничтожает весь массив.

### Сколько полезного места даст RAID 1 из двух дисков по 2 ТБ?
- [ ] 4 ТБ
- [x] 2 ТБ
- [ ] 1 ТБ
- [ ] 3 ТБ
> Зеркало хранит одинаковые копии на обоих дисках.

### Сколько полезного места даст RAID 5 из четырёх дисков по 1 ТБ?
- [ ] 4 ТБ
- [x] 3 ТБ
- [ ] 2 ТБ
- [ ] 1 ТБ
> Объём одного диска уходит на чётность: (N − 1) × размер.

### Чем хорош RAID 10?
- [ ] Максимальным полезным объёмом
- [x] Сочетает скорость чередования и надёжность зеркал; переживает отказ одного диска в каждой паре
- [ ] Работает с одним диском
- [ ] Не требует дополнительных дисков
> Цена — половина объёма уходит на зеркала. Часто используется под базы данных.

### Почему RAID не заменяет бэкапы?
- [x] Удаление файла или порча данных приложением мгновенно отразится на всех дисках массива
- [x] RAID не защищает от шифровальщиков, ошибок людей и потери всего сервера
- [ ] RAID работает медленнее бэкапов
- [ ] RAID нельзя использовать на серверах
> RAID защищает только от отказа диска.

### Где посмотреть состояние программных RAID-массивов mdadm?
= cat /proc/mdstat
> Подробности — `mdadm --detail /dev/md0`.

### Как называются три уровня абстракции LVM, начиная с дисков?
- [ ] Disk, Partition, Mount
- [x] PV (физический том), VG (группа томов), LV (логический том)
- [ ] RAID, LVM, FS
- [ ] Block, Inode, File
> pvcreate → vgcreate → lvcreate.

### Какое главное преимущество LVM перед обычными разделами?
- [ ] LVM работает быстрее
- [x] Тома можно расширять на лету, добавлять диски в группу и делать снапшоты без переразметки
- [ ] LVM заменяет бэкапы
- [ ] LVM не требует файловой системы
> Особенно удобно, когда место кончается на работающем сервере.

### Как увеличить логический том lv_db на 20 ГБ и сразу расширить его файловую систему?
= sudo lvextend -r -L +20G /dev/vg_data/lv_db
= lvextend -r -L +20G /dev/vg_data/lv_db
> Без `-r` нужно отдельно выполнить resize2fs или xfs_growfs.

### В группе томов закончилось место. Как добавить новый диск /dev/sdd?
- [ ] lvcreate /dev/sdd
- [x] pvcreate /dev/sdd, затем vgextend vg_data /dev/sdd
- [ ] mkfs.ext4 /dev/sdd и mount в /var
- [ ] vgcreate vg_data /dev/sdd
> После этого свободное место можно отдать томам через lvextend.

### Диск ВМ увеличили в облаке со 50 до 100 ГБ, а система всё ещё видит 50. Какой правильный порядок действий на LVM?
- [ ] Перезагрузить сервер, больше ничего не нужно
- [x] growpart для раздела → pvresize → lvextend -r
- [ ] mkfs на новом месте
- [ ] vgcreate → lvcreate → mount
> Каждый уровень нужно «сообщить» о новом размере по очереди.

### Зачем нужен снапшот LVM?
- [ ] Чтобы ускорить том
- [x] Чтобы зафиксировать состояние тома на момент создания, например перед рискованным обновлением
- [ ] Чтобы объединить два тома
- [ ] Чтобы зашифровать том
> Место под снапшот должно вмещать все изменения, накопившиеся за время его жизни.
