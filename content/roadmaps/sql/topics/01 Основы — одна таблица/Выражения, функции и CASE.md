---
title: Выражения, функции и CASE
slug: vyrazheniya-funkcii-case
description: Встроенные функции PostgreSQL для чисел, строк и дат, приведение типов, условные выражения CASE и замена NULL через COALESCE.
duration: 60
level: Основы
quizSize: 10
materials:
  - title: PostgreSQL — математические функции
    url: https://www.postgresql.org/docs/current/functions-math.html
    type: документация
  - title: PostgreSQL — строковые функции
    url: https://www.postgresql.org/docs/current/functions-string.html
    type: документация
  - title: PostgreSQL — функции даты и времени
    url: https://www.postgresql.org/docs/current/functions-datetime.html
    type: документация
  - title: PostgreSQL — CASE, COALESCE, NULLIF
    url: https://www.postgresql.org/docs/current/functions-conditional.html
    type: документация
---

# Выражения, функции и CASE

Данные в таблице почти никогда не лежат в том виде, который нужен в отчёте. Цены надо округлить, имена — привести к одному регистру, даты — разложить по месяцам, а товары — разбить на группы «дешёвые / средние / дорогие». Всё это делается выражениями прямо в запросе.

## Числа

| Функция | Пример | Результат |
| --- | --- | --- |
| `round(x, n)` | `round(2.567, 2)` | `2.57` |
| `ceil(x)`, `floor(x)` | `ceil(2.1)`, `floor(2.9)` | `3`, `2` |
| `trunc(x, n)` | `trunc(2.567, 1)` | `2.5` — отбросить, не округляя |
| `abs(x)` | `abs(-5)` | `5` |
| `x % y`, `mod(x, y)` | `17 % 5` | `2` |
| `power(x, y)` | `power(2, 10)` | `1024` |
| `greatest(...)`, `least(...)` | `greatest(3, 7, 5)` | `7` |

## Строки

| Функция | Пример | Результат |
| --- | --- | --- |
| `length(s)` | `length('Nova')` | `4` |
| `upper(s)`, `lower(s)` | `upper('nova')` | `NOVA` |
| `trim(s)` | `trim('  a  ')` | `a` |
| `left(s, n)`, `right(s, n)` | `left('Смартфон', 4)` | `Смар` |
| `substring(s from 2 for 3)` | `substring('Planet' from 2 for 3)` | `lan` |
| `replace(s, a, b)` | `replace('USB-C', '-', ' ')` | `USB C` |
| `split_part(s, разделитель, n)` | `split_part('a b c', ' ', 2)` | `b` |
| `position(a in s)` | `position('o' in 'Nova')` | `2` |
| `concat(...)` | `concat('a', NULL, 'b')` | `ab` — NULL пропускается |

## Даты

```sql
SELECT current_date;                          -- сегодня
SELECT now();                                 -- текущий момент с временем и поясом
SELECT extract(year FROM added_at);           -- год (также month, day, dow — день недели)
SELECT date_trunc('month', added_at);         -- начало месяца
SELECT added_at + 30;                         -- date + число = дата через 30 дней
SELECT added_at + interval '1 month';         -- через месяц
SELECT date '2026-05-01' - added_at;          -- разница дат в днях (целое число)
SELECT to_char(added_at, 'DD.MM.YYYY');       -- форматирование в строку
SELECT age(date '2026-05-01', added_at);      -- разница в годах/месяцах/днях
```

Подробнее о датах — в теме [[Даты, строки и NULL]].

## Приведение типов

```sql
SELECT '42'::integer;          -- строка → число (синтаксис PostgreSQL)
SELECT CAST('42' AS integer);  -- то же, стандарт SQL
SELECT price::text || ' руб.';
SELECT '2026-03-15'::date;
```

## CASE — условное выражение

`CASE` — это «если … то …» внутри запроса. Возвращает одно значение для каждой строки.

```sql
SELECT name, price,
       CASE
           WHEN price < 5000  THEN 'дешёвый'
           WHEN price < 30000 THEN 'средний'
           ELSE 'дорогой'
       END AS segment
FROM products;
```

- Условия проверяются **сверху вниз**, срабатывает первое истинное. Поэтому второе условие можно писать как `price < 30000`, не повторяя `price >= 5000`.
- Если ни одно условие не сработало и `ELSE` нет — результат `NULL`.
- Все ветки должны возвращать значения совместимого типа.

Короткая форма, когда сравниваем один столбец с конкретными значениями:

```sql
CASE category
    WHEN 'Смартфоны' THEN 'телефоны'
    WHEN 'Ноутбуки'  THEN 'компьютеры'
    ELSE 'прочее'
END
```

`CASE` работает везде, где допустимо выражение: в `SELECT`, `WHERE`, `ORDER BY`, внутри агрегатных функций.

## COALESCE и NULLIF

```sql
SELECT name, COALESCE(brand, 'без бренда') FROM products;   -- первый не-NULL аргумент
SELECT total / NULLIF(cnt, 0) FROM stats;                   -- NULLIF(a, b) = NULL, если a = b
```

- `COALESCE(a, b, c)` возвращает первое значение, которое не `NULL`. Типичный случай — подставить значение по умолчанию.
- `NULLIF(cnt, 0)` защищает от деления на ноль: вместо ошибки получится `NULL`.

## Практика

- [ ] Решить задачи тренажёра
- [ ] Выполнить `SELECT 1 / 0` и `SELECT 1 / NULLIF(0, 0)` — сравнить
- [ ] Вывести текущую дату через `to_char` в формате `ДД.ММ.ГГГГ` и в формате `ГГГГ-ММ`

## Тренажёр

```sql seed
CREATE TABLE products (
    id       integer PRIMARY KEY,
    name     text    NOT NULL,
    category text    NOT NULL,
    brand    text,
    price    integer NOT NULL,
    qty      integer NOT NULL,
    added_at date    NOT NULL
);
INSERT INTO products VALUES
    (1,  'Смартфон Nova 8',          'Смартфоны',  'Nova',  24990,  12, '2026-01-15'),
    (2,  'Смартфон Nova 9 Pro',      'Смартфоны',  'Nova',  45990,   5, '2026-03-02'),
    (3,  'Смартфон Orbit S',         'Смартфоны',  'Orbit', 18990,   0, '2025-11-20'),
    (4,  'Ноутбук Orbit Book 14',    'Ноутбуки',   'Orbit', 64990,   3, '2026-02-10'),
    (5,  'Ноутбук Kite 15',          'Ноутбуки',   'Kite',  52990,   7, '2025-12-05'),
    (6,  'Ноутбук Kite 13 Air',      'Ноутбуки',   'Kite',  79990,   2, '2026-04-01'),
    (7,  'Наушники Echo Buds',       'Аудио',      'Echo',   4990,  30, '2025-10-12'),
    (8,  'Наушники Echo Max',        'Аудио',      'Echo',  12990,   8, '2026-01-28'),
    (9,  'Колонка Echo Mini',        'Аудио',      'Echo',   3490,   0, '2025-09-01'),
    (10, 'Планшет Nova Tab',         'Планшеты',   'Nova',  29990,   4, '2026-02-20'),
    (11, 'Планшет Kite Pad',         'Планшеты',   'Kite',  21990,   9, '2025-12-18'),
    (12, 'Часы Orbit Watch',         'Гаджеты',    'Orbit', 15990,   6, '2026-03-15'),
    (13, 'Фитнес-браслет Nova Band', 'Гаджеты',    'Nova',   2990,  25, '2025-08-30'),
    (14, 'Кабель USB-C 1 м',         'Аксессуары', NULL,      490, 120, '2025-07-01'),
    (15, 'Чехол для Nova 9 Pro',     'Аксессуары', 'Nova',    990,  40, '2026-03-05'),
    (16, 'Зарядка 65 Вт',            'Аксессуары', NULL,     2490,  15, '2025-09-15');
```

### Сегменты цен

Выведите название, цену и сегмент товара:

- дешевле 5 000 — `дешёвый`;
- от 5 000 до 29 999 — `средний`;
- от 30 000 — `дорогой`.

```sql check
SELECT name, price,
       CASE WHEN price < 5000 THEN 'дешёвый' WHEN price < 30000 THEN 'средний' ELSE 'дорогой' END
FROM products;
```

```text hint
Для каждого товара:
  если цена меньше 5 000 → «дешёвый»;
  иначе если меньше 30 000 → «средний»;
  иначе → «дорогой».
Условия проверяются сверху вниз, срабатывает первое подходящее.
```

```sql solution
SELECT name, price,
       CASE
           WHEN price < 5000  THEN 'дешёвый'
           WHEN price < 30000 THEN 'средний'
           ELSE 'дорогой'
       END AS segment
FROM products;
```

### Бренд по умолчанию

Выведите название и бренд товара. Если бренд не указан, выведите `без бренда`.

```sql check
SELECT name, COALESCE(brand, 'без бренда') FROM products;
```

```sql solution
SELECT name, COALESCE(brand, 'без бренда') AS brand FROM products;
```

### Тип товара

Выведите название товара и его тип — **первое слово** названия (например, `Смартфон`, `Ноутбук`).

```sql check
SELECT name, split_part(name, ' ', 1) FROM products;
```

```text hint
Тип товара — часть названия до первого пробела.
В конспекте есть функция, которая делит строку по разделителю и возвращает часть с нужным номером.
```

```sql solution
SELECT name, split_part(name, ' ', 1) AS kind FROM products;
```

### Месяц поступления

Выведите название товара, год и номер месяца его поступления (два отдельных столбца) для товаров, поступивших в 2026 году.

```sql check
SELECT name, extract(year FROM added_at), extract(month FROM added_at)
FROM products WHERE added_at >= '2026-01-01';
```

```sql solution
SELECT name,
       extract(year FROM added_at)  AS year,
       extract(month FROM added_at) AS month
FROM products
WHERE added_at >= '2026-01-01';
```

### Сколько дней в продаже

Выведите название и количество дней, которое товар продаётся, на дату 1 мая 2026 года. Отсортируйте от самого «старого» товара к самому новому.

```sql check ordered
SELECT name, date '2026-05-01' - added_at FROM products ORDER BY added_at;
```

```text hint
Дней в продаже = 1 мая 2026 минус дата поступления.
В PostgreSQL разность двух дат — сразу число дней. Отсортировать от самого раннего поступления.
```

```sql solution
SELECT name, date '2026-05-01' - added_at AS days_on_sale
FROM products
ORDER BY added_at;
```

### Распродажа аксессуаров

На аксессуары объявлена скидка 20 %, на остальные товары цена не меняется. Выведите название, категорию и новую цену, округлённую до целых.

```sql check
SELECT name, category, CASE WHEN category = 'Аксессуары' THEN round(price * 0.8) ELSE price END
FROM products;
```

```sql solution
SELECT name, category,
       CASE WHEN category = 'Аксессуары' THEN round(price * 0.8) ELSE price END AS new_price
FROM products;
```

### Артикул

Сформируйте артикул товара: первые три буквы бренда **заглавными** (для товаров без бренда — `GEN`), дефис и `id`. Например, `NOV-1`. Выведите артикул и название.

```sql check
SELECT upper(left(COALESCE(brand, 'gen'), 3)) || '-' || id, name FROM products;
```

```text hint
Артикул по шагам:
  бренд, а если его нет — «GEN»;
  взять первые три буквы;
  сделать заглавными;
  приклеить «-» и номер товара.
Собирайте функции изнутри наружу.
```

```sql solution
SELECT upper(left(COALESCE(brand, 'GEN'), 3)) || '-' || id AS sku, name
FROM products;
```

### Сначала то, что кончается

Выведите название и остаток всех товаров. Сначала — товары, которых **нет в наличии**, затем остальные по возрастанию остатка. Внутри одинакового остатка — по названию.

```sql check ordered
SELECT name, qty FROM products ORDER BY qty, name;
```

```text hint
Сортировать по остатку по возрастанию, при одинаковом остатке — по названию.
Нулевой остаток и так меньше любого другого — ничего особенного делать не нужно.
```

```sql solution
SELECT name, qty FROM products ORDER BY qty, name;
```

## Тест

### Что вернёт `CASE WHEN 1 > 2 THEN 'да' END`?
- [ ] 'да'
- [ ] Пустую строку
- [x] NULL
- [ ] Ошибку: нет ELSE
> Если ни одно условие не сработало и ELSE нет, CASE возвращает NULL.

### Цена 3000. Что вернёт `CASE WHEN price < 5000 THEN 'A' WHEN price < 10000 THEN 'B' END`?
- [x] 'A'
- [ ] 'B'
- [ ] 'A' и 'B'
- [ ] NULL
> Условия проверяются сверху вниз, срабатывает первое истинное.

### Что вернёт `COALESCE(NULL, NULL, 'x', 'y')`?
= x
> COALESCE возвращает первый аргумент, который не NULL.

### Что вернёт `NULLIF(5, 5)`?
- [ ] 5
- [ ] 0
- [x] NULL
- [ ] true
> NULLIF(a, b) возвращает NULL, если a = b, иначе a. Удобно против деления на ноль.

### Как избежать ошибки деления на ноль в `total / cnt`?
- [x] total / NULLIF(cnt, 0)
- [x] CASE WHEN cnt = 0 THEN NULL ELSE total / cnt END
- [ ] total / COALESCE(cnt, 0)
- [ ] total / ABS(cnt)
> COALESCE заменяет NULL на 0 и деления на ноль не предотвращает.

### Чему равна разность `date '2026-03-10' - date '2026-03-01'`?
= 9
> Разность двух значений date — целое число дней.

### Что вернёт `concat('Nova', NULL, ' 8')`?
- [x] 'Nova 8'
- [ ] NULL
- [ ] 'NovaNULL 8'
- [ ] Ошибку
> concat пропускает NULL, а оператор || вернул бы NULL.

### Какие записи приводят строку '42' к целому числу?
- [x] '42'::integer
- [x] CAST('42' AS integer)
- [ ] integer('42')
- [ ] CONVERT('42', integer)
> `::` — краткая форма PostgreSQL, CAST — стандарт SQL.

### Какая функция вернёт начало месяца для даты?
- [ ] extract(month FROM d)
- [x] date_trunc('month', d)
- [ ] to_char(d, 'MM')
- [ ] month(d)
> extract вернёт номер месяца, to_char — строку, а date_trunc — дату начала месяца, по ней удобно группировать.

### Чему равно `split_part('2026-03-15', '-', 2)`?
= 03

### Где можно использовать CASE?
- [x] В SELECT
- [x] В WHERE
- [x] В ORDER BY
- [x] Внутри агрегатной функции, например sum(CASE ... END)
> CASE — обычное выражение, оно допустимо везде, где допустимо значение.

### Что вернёт `round(7 / 2)`?
- [ ] 4
- [x] 3
- [ ] 3.5
> 7 / 2 — целочисленное деление, получается 3, и округлять уже нечего. Нужно round(7 / 2.0) = 4.
