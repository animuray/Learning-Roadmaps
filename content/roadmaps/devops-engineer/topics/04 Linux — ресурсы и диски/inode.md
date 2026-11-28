---
title: inode
slug: inode
description: Что хранит inode и чего в нём нет, df -i, и почему место на диске есть, а файлы не создаются.
duration: 45
level: Средний
quizSize: 10
materials:
  - title: ctrl.blog — How to handle running out of inodes
    url: https://ctrl.blog/entry/how-to-all-out-of-inodes
    type: статья
  - title: Cloudways — «No space left on device» из-за inode
    url: https://www.cloudways.com/blog/fix-no-space-left-on-device/
    type: статья
  - title: Gentoo Wiki — ext4 (на русском)
    url: https://wiki.gentoo.org/wiki/Ext4/ru
    type: документация
---

# inode

**inode** (index node) — служебная запись файловой системы, которая описывает один файл или каталог. Данные файла лежат в блоках, а inode хранит всё **о** файле.

## Что хранит inode

- тип объекта (файл, каталог, ссылка, устройство, сокет);
- права доступа, владельца и группу;
- размер;
- времена: atime, mtime, ctime;
- число жёстких ссылок;
- указатели на блоки с данными (в ext4 — экстенты).

**Чего в inode нет — имени файла.** Имя хранится в **каталоге**: каталог — это таблица «имя → номер inode». Отсюда следует:

- **жёсткая ссылка** — ещё одна запись «имя → тот же inode»;
- **mv** внутри одной файловой системы меняет только запись в каталоге, данные и inode остаются на месте — поэтому переименование мгновенное даже для огромного файла;
- файл реально удаляется, когда счётчик ссылок равен нулю **и** его никто не держит открытым.

```bash
ls -i file.txt          # номер inode
stat file.txt           # Inode, Links, права, времена
ls -li                  # номера inode для всех файлов каталога
```

## Количество inode ограничено

```bash
df -i
# Filesystem      Inodes   IUsed   IFree IUse% Mounted on
# /dev/sda1      6553600 6553600       0  100% /
```

- В **ext4** таблица inode создаётся при форматировании (`mkfs.ext4`) — обычно один inode на 16 КиБ места. Без переформатирования увеличить их число нельзя. Задать больше при создании ФС: `mkfs.ext4 -i 4096` или `-N <число>`.
- **XFS** и **btrfs** выделяют inode динамически, поэтому с ними проблема встречается гораздо реже.

## Место есть, а файлы не создаются

Если `df -h` показывает свободное место, а система пишет **No space left on device** — почти наверняка закончились inode. Причина — **миллионы мелких файлов**:

- файлы сессий (PHP-сессии в `/var/lib/php/sessions`);
- кэш приложения или фреймворка;
- очередь почты (`/var/spool/postfix`);
- временные файлы, которые никто не удаляет;
- мелкие файлы, которые пишет cron-задача каждую минуту.

### Как найти каталог с огромным числом файлов

```bash
df -i                                          # на каком разделе кончились inode
sudo du --inodes -x -d1 / | sort -n | tail     # число inode по каталогам (coreutils 8.22+)
sudo find /var -xdev -type f | cut -d/ -f2-3 | sort | uniq -c | sort -n | tail
```

Спускайтесь в каталог с наибольшим числом и повторяйте.

### Как исправить

1. Удалить ненужные мелкие файлы. Если файлов миллионы, `rm *` упадёт с ошибкой «Argument list too long». Используйте `find`:
   ```bash
   find /var/lib/php/sessions -type f -mtime +2 -delete
   ```
2. Устранить причину: настроить очистку кэша и сессий, logrotate, исправить скрипт.
3. Если мелких файлов действительно должно быть много — пересоздать ФС с большим числом inode или выбрать XFS.

## Эксперимент: закончить inode

Создадим крошечную файловую систему в файле всего с 1000 inode и попробуем создать в ней 2000 пустых файлов:

```bash
truncate -s 50M /tmp/fs.img && mkfs.ext4 -N 1000 /tmp/fs.img
sudo mkdir -p /mnt/tiny && sudo mount /tmp/fs.img /mnt/tiny
cd /mnt/tiny && sudo bash -c 'for i in $(seq 1 2000); do touch f$i; done'
df -h /mnt/tiny; df -i /mnt/tiny
```

Место почти не занято, но после тысячи файлов появится `No space left on device`, а `df -i` покажет 100%. Убрать за собой: `cd ~ && sudo umount /mnt/tiny && rm /tmp/fs.img`.

## Практика

- [ ] Выполнить `df -i` и `df -h` для всех разделов и сравнить заполнение по месту и по inode
- [ ] Сделать `ls -li` в каталоге с жёсткой ссылкой (из темы про файловую систему) и убедиться, что номера inode совпадают
- [ ] Переименовать большой файл через `mv` и проверить, что номер inode не изменился; затем переместить его на другой раздел и проверить снова
- [ ] Повторить эксперимент из раздела выше: исчерпать inode на маленькой ФС и получить ошибку при свободном месте
- [ ] Найти каталог с наибольшим числом файлов на своей системе через `du --inodes`

## Лаборатория

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

### Место есть, а файл не создаётся

Приложение пишет в `/mnt/lab-cache` и падает с ошибкой «No space left on device», хотя `df -h` показывает свободное место. Разберитесь в причине и освободите раздел для новых файлов: удалите **накопившиеся файлы сессий** (их тысячи в одном каталоге). Настройки приложения (`config/`) трогать нельзя. После уборки раздел должен быть заполнен по inode **меньше чем на 50%**.

```bash setup
lab_disks_reset
lab_disk cache 64M
mkfs.ext4 -q -F -N 1024 /dev/lab-cache
mkdir -p /mnt/lab-cache
mount /dev/lab-cache /mnt/lab-cache
mkdir -p /mnt/lab-cache/config /mnt/lab-cache/sessions
echo "listen=8080" > /mnt/lab-cache/config/app.conf
cd /mnt/lab-cache/sessions && i=0; while : > sess_$i 2>/dev/null; do i=$((i + 1)); done
chown -R student:student /mnt/lab-cache
```

```bash check
findmnt /mnt/lab-cache >/dev/null || fail "/mnt/lab-cache не смонтирован"
[ -f /mnt/lab-cache/config/app.conf ] && grep -q listen=8080 /mnt/lab-cache/config/app.conf || fail "Пропали или изменились настройки в config/"
u=$(df --output=ipcent /mnt/lab-cache | tail -1 | tr -d ' %')
[ "$u" -lt 50 ] || fail "Раздел заполнен по inode на $u%"
ok "inode заняты на $u%, место: $(df -h --output=pcent /mnt/lab-cache | tail -1 | tr -d ' ')"
```

```text hint
1. Сравнить заполнение раздела по месту и по количеству файлов — у df есть ключ для второго.
2. Найти, в каком каталоге больше всего файлов: у du есть режим подсчёта inode вместо байт, либо посчитать find по каталогам.
3. Удалить файлы сессий. Когда их десятки тысяч, «rm *» может не сработать — подстановка раскроется в слишком длинную строку; надёжнее удалять самим find.
```

```bash solution
df -h /mnt/lab-cache
df -i /mnt/lab-cache
du --inodes -d1 /mnt/lab-cache | sort -n
find /mnt/lab-cache/sessions -type f -name 'sess_*' -delete
df -i /mnt/lab-cache
```

```text review
Эталон: `df -i` → `du --inodes -d1` → `find /mnt/lab-cache/sessions -type f -delete`.

- Каждому файлу нужен inode, а их число задаётся при создании ext4 и не растёт. Миллионы крошечных файлов (сессии PHP, кэш, очереди почты, `node_modules`) исчерпывают inode при пустом диске.
- `rm sessions/*` на десятках тысяч файлов падает с «Argument list too long» — `find -delete` или `find ... -print0 | xargs -0 rm` работают с любым количеством.
- Профилактика: очищать сессии по cron/таймеру (`find -mmin +1440 -delete`), выносить кэш в Redis, для таких данных создавать ФС с большим числом inode (`mkfs.ext4 -i 4096`) или использовать xfs — у неё inode выделяются динамически.
```

```text notes
rm\s+-rf?\s+/mnt/lab-cache/?(\s|$) => Удалялся весь раздел /mnt/lab-cache целиком — так легко снести и настройки. Чистят только каталог, где копятся файлы.
```

### Все имена одного файла

Отчёт `/srv/lab-links/reports/q3.pdf` занимает много места, но удалить его не получается: место не освобождается. У файла есть **жёсткие ссылки** — другие имена в других каталогах `/srv/lab-links`. Найдите **все** пути к этому файлу внутри `/srv/lab-links` (включая исходный) и запишите их в `~/links.txt` — по одному на строку.

```bash setup
rm -rf /srv/lab-links /home/student/links.txt
mkdir -p /srv/lab-links/reports /srv/lab-links/archive/2025 /srv/lab-links/tmp/.cache /srv/lab-links/share
head -c 3000000 /dev/urandom > /srv/lab-links/reports/q3.pdf
ln /srv/lab-links/reports/q3.pdf /srv/lab-links/archive/2025/old-report.pdf
ln /srv/lab-links/reports/q3.pdf /srv/lab-links/tmp/.cache/blob.bin
cp /srv/lab-links/reports/q3.pdf /srv/lab-links/share/q3-copy.pdf
ln -s /srv/lab-links/reports/q3.pdf /srv/lab-links/share/q3-link.pdf
```

```bash check
[ -f /home/student/links.txt ] || fail "Нет ~/links.txt"
want=$(find /srv/lab-links -samefile /srv/lab-links/reports/q3.pdf | sort)
got=$(sed 's/[[:space:]]*$//' /home/student/links.txt | grep -v '^$' | sort -u)
[ "$got" = "$want" ] || fail "Список не совпал: найдено путей $(echo "$got" | grep -c .), у файла имён $(stat -c %h /srv/lab-links/reports/q3.pdf). Копия и символическая ссылка — не жёсткие ссылки"
ok "у файла $(stat -c %h /srv/lab-links/reports/q3.pdf) имени: $(echo $want)"
```

```text hint
1. Узнать номер inode файла и сколько у него имён (счётчик ссылок) — подробный вывод ls с ключом для inode или stat.
2. Найти в каталоге все файлы с тем же inode: у find есть проверка «тот же файл, что указанный» (или поиск по номеру inode).
3. Копия — отдельный файл со своим inode, символическая ссылка — тоже отдельный файл. Их в списке быть не должно.
```

```bash solution
ls -li /srv/lab-links/reports/q3.pdf
find /srv/lab-links -samefile /srv/lab-links/reports/q3.pdf > ~/links.txt
cat ~/links.txt
```

```text review
Эталон: `find /srv/lab-links -samefile /srv/lab-links/reports/q3.pdf` (или `find -inum <номер>`).

- Имя файла — запись в каталоге, указывающая на inode. Жёсткая ссылка — ещё одна такая запись. Данные освобождаются, только когда исчезнет **последнее** имя (и закроются открытые дескрипторы).
- Счётчик ссылок — вторая колонка `ls -l` и `%h` в `stat`. У каталога он всегда ≥ 2 (`.` и запись в родителе).
- Жёсткие ссылки работают только в пределах одной файловой системы и не делаются на каталоги. Символические — любые, но ломаются при удалении цели.
- Где встречаются: снапшоты rsync `--link-dest`, `cp -al`, хранилища бэкапов — одинаковые файлы хранятся один раз.
```

## Тест

### Что хранится в inode?
- [x] Права доступа, владелец и группа
- [x] Размер, времена изменения и число жёстких ссылок
- [x] Указатели на блоки с данными файла
- [ ] Имя файла
> Имя хранится в каталоге: каталог сопоставляет имена номерам inode.

### Где хранится имя файла?
- [ ] В inode
- [x] В записи каталога, которая связывает имя с номером inode
- [ ] В суперблоке
- [ ] В первом блоке данных файла
> Поэтому у одного inode может быть несколько имён — жёстких ссылок.

### Какой командой посмотреть использование inode на разделах?
= df -i
> IUse% = 100% — inode закончились.

### Как узнать номер inode файла?
- [x] ls -i file
- [x] stat file
- [ ] df -i file
- [ ] file file
> `stat` покажет ещё и число ссылок, права и времена.

### Место на разделе есть, но при создании файла появляется No space left on device. Наиболее вероятная причина?
- [ ] Нет прав на запись
- [x] Закончились inode из-за огромного количества мелких файлов
- [ ] Закончилась оперативная память
- [ ] Повреждён диск
> Проверка — `df -i`.

### Можно ли увеличить число inode на существующей файловой системе ext4 без переформатирования?
- [ ] Да, командой tune2fs -i
- [x] Нет, число inode в ext4 задаётся при создании файловой системы
- [ ] Да, после перезагрузки
- [ ] Да, удалив журнал
> При создании можно задать больше inode через `mkfs.ext4 -i` или `-N`. XFS выделяет inode динамически.

### Почему mv огромного файла в пределах одного раздела выполняется мгновенно?
- [ ] mv сжимает файл
- [x] Меняется только запись в каталоге, а inode и блоки данных остаются на месте
- [ ] mv копирует файл в фоне
- [ ] Это кэш файловой системы
> Между разными файловыми системами mv уже копирует данные и удаляет оригинал.

### rm * в каталоге с миллионом файлов завершается ошибкой Argument list too long. Как удалить файлы?
- [ ] rm -rf *
- [x] find каталог -type f -delete (с нужными условиями, например -mtime +2)
- [ ] rm --all *
- [ ] Отформатировать раздел
> Оболочка раскрывает `*` в список аргументов, а он ограничен по размеру. find удаляет файлы сам, без длинной командной строки.

### Какие источники чаще всего исчерпывают inode?
- [x] Файлы сессий и кэша веб-приложения
- [x] Очередь почтового сервера
- [x] Мелкие временные файлы, которые никто не удаляет
- [ ] Один большой файл базы данных
> Один большой файл занимает один inode, но много блоков.

### Как найти каталог, в котором больше всего файлов?
- [ ] df -i /
- [x] du --inodes -x -d1 / | sort -n
- [ ] ls -la / | wc -l
- [ ] stat /
> Спускайтесь в самый «населённый» каталог и повторяйте.

### Когда данные удалённого файла действительно освобождаются?
- [ ] Сразу после rm
- [x] Когда счётчик жёстких ссылок равен нулю и ни один процесс не держит файл открытым
- [ ] После перезагрузки
- [ ] После fsck
> Поэтому удалённый, но открытый лог продолжает занимать место.

### В какой файловой системе inode выделяются динамически и проблема их исчерпания встречается гораздо реже?
- [ ] ext4
- [x] XFS
- [ ] FAT32
- [ ] ext3
> btrfs тоже выделяет inode динамически.
