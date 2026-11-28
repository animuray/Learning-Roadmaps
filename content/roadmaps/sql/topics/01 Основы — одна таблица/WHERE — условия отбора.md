---
title: WHERE — условия отбора
slug: where
description: Фильтруем строки — сравнения, AND/OR/NOT и скобки, IN, BETWEEN, поиск по шаблону LIKE и ILIKE, проверка на NULL.
duration: 50
level: Основы
quizSize: 10
materials:
  - title: PostgreSQL — операторы сравнения
    url: https://www.postgresql.org/docs/current/functions-comparison.html
    type: документация
  - title: PostgreSQL — LIKE и сопоставление с шаблоном
    url: https://www.postgresql.org/docs/current/functions-matching.html
    type: документация
---

# WHERE — условия отбора

В реальных таблицах миллионы строк, а нужны обычно единицы: заказы конкретного клиента, ошибки за последний час, товары, которых нет в наличии. Отбор строк — задача `WHERE`.

```sql
SELECT name, price
FROM products
WHERE price > 20000;
```

Условие проверяется для каждой строки. В результат попадают строки, для которых оно **истинно** (`true`). Строки, где условие ложно или неизвестно (`NULL`), отбрасываются.

## Сравнения

| Оператор | Значение |
| --- | --- |
| `=` | равно (одно `=`, не `==`) |
| `<>` или `!=` | не равно |
| `<`, `>`, `<=`, `>=` | меньше, больше… |

Сравнивать можно числа, строки и даты:

```sql
WHERE category = 'Аудио'
WHERE added_at >= '2026-01-01'
WHERE name <> 'Кабель USB-C 1 м'
```

Строки сравниваются с учётом регистра: `'аудио' = 'Аудио'` — ложь.

## AND, OR, NOT

```sql
-- смартфоны дешевле 30 000
WHERE category = 'Смартфоны' AND price < 30000

-- либо аудио, либо гаджеты
WHERE category = 'Аудио' OR category = 'Гаджеты'

WHERE NOT (qty > 0)
```

> [!danger] Приоритет: AND сильнее OR
> `WHERE brand = 'Nova' OR brand = 'Kite' AND qty > 5` выполняется как
> `brand = 'Nova' OR (brand = 'Kite' AND qty > 5)` — в результат попадут **все** товары Nova, даже с нулевым остатком.
> Когда смешиваете `AND` и `OR`, всегда ставьте скобки:
> `WHERE (brand = 'Nova' OR brand = 'Kite') AND qty > 5`.

## IN и BETWEEN

```sql
WHERE category IN ('Аудио', 'Гаджеты', 'Аксессуары')   -- одно из значений списка
WHERE category NOT IN ('Аксессуары')

WHERE price BETWEEN 3000 AND 15000                      -- включая обе границы
WHERE added_at BETWEEN '2026-01-01' AND '2026-03-31'
```

`IN` — короткая запись цепочки `OR`. `BETWEEN a AND b` — то же, что `>= a AND <= b`: **обе границы включаются**.

## LIKE и ILIKE — поиск по шаблону

```sql
WHERE name LIKE 'Ноутбук%'     -- начинается с «Ноутбук»
WHERE name LIKE '%Pro'         -- заканчивается на «Pro»
WHERE name LIKE '%Nova%'       -- содержит «Nova»
WHERE name LIKE 'Смартфон ____ %'  -- _ — ровно один любой символ
WHERE name ILIKE '%pro%'       -- без учёта регистра (особенность PostgreSQL)
```

- `%` — любое количество любых символов, в том числе ноль.
- `_` — ровно один символ.
- `LIKE` чувствителен к регистру, `ILIKE` — нет.

Шаблон `'%слово%'` не может использовать обычный индекс и на больших таблицах работает медленно — об этом в теме [[Индексы и EXPLAIN]].

## NULL — особый случай

Сравнение с `NULL` через `=` **никогда не бывает истинным** — результат тоже `NULL` («неизвестно»):

```sql
WHERE brand = NULL      -- не найдёт ничего, даже товары без бренда
WHERE brand IS NULL     -- правильно
WHERE brand IS NOT NULL
```

Ловушка: `WHERE brand <> 'Nova'` **не вернёт** товары без бренда — для них `NULL <> 'Nova'` даёт `NULL`, а не `true`. Если они нужны, допишите `OR brand IS NULL` или используйте `brand IS DISTINCT FROM 'Nova'`.

Логика с тремя значениями (`true`, `false`, `NULL`):

| a | b | a AND b | a OR b |
| --- | --- | --- | --- |
| true | NULL | NULL | true |
| false | NULL | false | NULL |
| NULL | NULL | NULL | NULL |

## Практика

- [ ] Решить задачи тренажёра
- [ ] Специально написать условие `brand = NULL` и убедиться, что оно ничего не находит
- [ ] Написать запрос с `AND` и `OR` без скобок и со скобками, сравнить результаты

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

### Дорогие товары

Выведите название и цену товаров дороже 20 000 рублей.

```sql check
SELECT name, price FROM products WHERE price > 20000;
```

```sql solution
SELECT name, price FROM products WHERE price > 20000;
```

### Недорогие смартфоны

Выведите название и цену смартфонов (категория «Смартфоны») дешевле 30 000 рублей.

```sql check
SELECT name, price FROM products WHERE category = 'Смартфоны' AND price < 30000;
```

```sql solution
SELECT name, price FROM products WHERE category = 'Смартфоны' AND price < 30000;
```

### Нет в наличии

Выведите названия товаров, которых нет на складе.

```sql check
SELECT name FROM products WHERE qty = 0;
```

```sql solution
SELECT name FROM products WHERE qty = 0;
```

### Несколько категорий

Выведите название и категорию товаров из категорий «Аудио» и «Гаджеты». Используйте `IN`.

```sql check
SELECT name, category FROM products WHERE category IN ('Аудио', 'Гаджеты');
```

```sql solution
SELECT name, category FROM products WHERE category IN ('Аудио', 'Гаджеты');
```

### Ценовой диапазон

Выведите название и цену товаров стоимостью от 3 000 до 15 000 рублей включительно.

```sql check
SELECT name, price FROM products WHERE price BETWEEN 3000 AND 15000;
```

```sql solution
SELECT name, price FROM products WHERE price BETWEEN 3000 AND 15000;
```

### Все ноутбуки по названию

Выведите название и цену товаров, у которых название начинается со слова «Ноутбук». Используйте `LIKE`, а не условие на категорию.

```sql check
SELECT name, price FROM products WHERE name LIKE 'Ноутбук%';
```

```sql solution
SELECT name, price FROM products WHERE name LIKE 'Ноутбук%';
```

### Всё про Pro

Выведите названия товаров, в которых встречается «pro» в любом регистре.

```sql check
SELECT name FROM products WHERE name ILIKE '%pro%';
```

```text hint
Оставить товары, где в названии где-то встречается «pro» — заглавными или строчными, неважно.
Нужен поиск по шаблону без учёта регистра; «где-то внутри» значит: любой текст до и любой текст после.
```

```sql solution
SELECT name FROM products WHERE name ILIKE '%pro%';
```

### Товары без бренда

Выведите названия товаров, у которых не указан бренд.

```sql check
SELECT name FROM products WHERE brand IS NULL;
```

```text hint
Оставить товары, где бренд не заполнен.
Обычное «равно» с пустым значением не работает — такое сравнение никогда не бывает истинным. Для пустых значений есть отдельная проверка.
```

```sql solution
SELECT name FROM products WHERE brand IS NULL;
```

### Скобки решают

Выведите название, бренд и остаток товаров брендов Nova **или** Kite, которых на складе **больше 5** штук.

```sql check
SELECT name, brand, qty FROM products WHERE brand IN ('Nova', 'Kite') AND qty > 5;
```

```text hint
Оставить товары, где (бренд — Nova или Kite) и при этом остаток больше 5.
«И» выполняется раньше «или» — без скобок получится совсем другое условие.
```

```sql solution
SELECT name, brand, qty FROM products WHERE (brand = 'Nova' OR brand = 'Kite') AND qty > 5;
```

### Всё, кроме Nova

Выведите названия всех товаров, кроме товаров бренда Nova. Товары **без бренда** тоже должны попасть в результат.

```sql check
SELECT name FROM products WHERE brand IS DISTINCT FROM 'Nova';
```

```text hint
Оставить товары, где бренд не Nova, а также товары, где бренда нет совсем.
Для пустого бренда «не равно Nova» даёт «неизвестно», и строка отбрасывается — пустой бренд разрешите отдельным условием.
```

```sql solution
SELECT name FROM products WHERE brand <> 'Nova' OR brand IS NULL;
```

## Тест

### Какие строки вернёт `WHERE` с условием?
- [x] Только те, где условие истинно
- [ ] Те, где условие истинно или NULL
- [ ] Те, где условие ложно
- [ ] Все строки, но с отметкой результата
> Строки с результатом false и NULL отбрасываются.

### Что вернёт `WHERE brand = NULL`?
- [ ] Товары без бренда
- [x] Ни одной строки
- [ ] Все строки
- [ ] Ошибку синтаксиса
> Сравнение с NULL даёт NULL, а не true. Нужно `brand IS NULL`.

### Как PostgreSQL выполнит `WHERE a = 1 OR b = 2 AND c = 3`?
- [ ] (a = 1 OR b = 2) AND c = 3
- [x] a = 1 OR (b = 2 AND c = 3)
- [ ] Выдаст ошибку без скобок
- [ ] Слева направо по очереди
> AND имеет приоритет выше OR, как умножение выше сложения.

### Какие строки найдёт `price BETWEEN 100 AND 200`?
- [x] 100
- [x] 150
- [x] 200
- [ ] 201
> Обе границы BETWEEN включаются.

### Что означает `_` в шаблоне LIKE?
- [ ] Любое число символов
- [x] Ровно один любой символ
- [ ] Пробел
- [ ] Ноль или один символ
> `%` — любое количество символов, `_` — ровно один.

### Какой оператор ищет по шаблону без учёта регистра в PostgreSQL?
= ILIKE

### Вернёт ли `WHERE brand <> 'Nova'` товары, у которых brand = NULL?
- [ ] Да
- [x] Нет
> NULL <> 'Nova' даёт NULL. Чтобы включить такие строки, добавляют `OR brand IS NULL` или пишут `brand IS DISTINCT FROM 'Nova'`.

### Чему равно `NULL OR true`?
- [ ] NULL
- [x] true
- [ ] false
- [ ] Ошибка
> Если хотя бы один операнд OR истинен, результат истинен независимо от второго.

### Чему равно `NULL AND false`?
- [ ] NULL
- [ ] true
- [x] false
> Если хотя бы один операнд AND ложен, результат ложен.

### Какие условия эквивалентны `category IN ('Аудио', 'Гаджеты')`?
- [x] category = 'Аудио' OR category = 'Гаджеты'
- [ ] category = 'Аудио' AND category = 'Гаджеты'
- [ ] category LIKE 'Аудио%Гаджеты'
- [ ] category BETWEEN 'Аудио' AND 'Гаджеты'
> IN — краткая запись цепочки OR.

### Какой шаблон найдёт названия, заканчивающиеся на «Pro»?
- [ ] 'Pro%'
- [x] '%Pro'
- [ ] '_Pro'
- [ ] '%Pro%'
> '%Pro%' найдёт и «Pro» в середине, например «Чехол Pro Max».

### Как найти товары, добавленные в 2026 году (столбец added_at типа date)?
- [x] WHERE added_at >= '2026-01-01' AND added_at < '2027-01-01'
- [x] WHERE added_at BETWEEN '2026-01-01' AND '2026-12-31'
- [ ] WHERE added_at = 2026
- [ ] WHERE added_at LIKE 2026
> Для date оба первых варианта верны. Для timestamp надёжнее первый: BETWEEN … '2026-12-31' потеряет события 31 декабря после полуночи.

### Как записать «не равно» в SQL?
- [x] <>
- [x] !=
- [ ] =!
- [ ] ><
> `<>` — стандарт SQL, `!=` PostgreSQL тоже понимает.
