---
title: ORDER BY, DISTINCT и LIMIT
slug: order-by-distinct-limit
description: Сортировка по одному и нескольким столбцам, где окажутся NULL, уникальные значения через DISTINCT, первые N строк и постраничный вывод через LIMIT и OFFSET.
duration: 40
level: Основы
quizSize: 10
materials:
  - title: PostgreSQL — ORDER BY
    url: https://www.postgresql.org/docs/current/queries-order.html
    type: документация
  - title: PostgreSQL — LIMIT и OFFSET
    url: https://www.postgresql.org/docs/current/queries-limit.html
    type: документация
---

# ORDER BY, DISTINCT и LIMIT

«Топ-10 самых продаваемых товаров», «последние 50 записей лога», «список городов без повторов» — такие запросы пишутся каждый день, и все они собираются из трёх конструкций этой темы.

## ORDER BY — сортировка

```sql
SELECT name, price FROM products ORDER BY price;        -- по возрастанию (ASC — по умолчанию)
SELECT name, price FROM products ORDER BY price DESC;   -- по убыванию
```

Сортировка по нескольким столбцам — сначала по первому, при равенстве — по второму:

```sql
SELECT category, name, price
FROM products
ORDER BY category, price DESC;   -- категории по алфавиту, внутри — от дорогих к дешёвым
```

`DESC` относится только к столбцу, после которого стоит. В примере выше `category` сортируется по возрастанию.

Сортировать можно по выражению и по псевдониму из `SELECT` — `ORDER BY` выполняется после `SELECT`:

```sql
SELECT name, price * qty AS stock_value
FROM products
ORDER BY stock_value DESC;
```

Можно и по номеру столбца в списке (`ORDER BY 2 DESC`), но такой запрос легко сломать, переставив столбцы, поэтому в коде так лучше не писать.

> [!warning] Без ORDER BY порядок не гарантирован
> Даже если сегодня строки приходят «по порядку», завтра после обновления или на другом сервере порядок будет другим. Нужен порядок — пишите `ORDER BY`.

### Где окажутся NULL

В PostgreSQL `NULL` считается **больше** любого значения: при `ASC` он в конце, при `DESC` — в начале. Это можно поменять:

```sql
ORDER BY brand NULLS FIRST
ORDER BY brand DESC NULLS LAST
```

В MySQL поведение обратное: `NULL` там меньше всех. Это частая причина различий в отчётах при переезде между СУБД.

## DISTINCT — без повторов

```sql
SELECT DISTINCT category FROM products;                 -- каждая категория один раз
SELECT DISTINCT category, brand FROM products;          -- уникальные пары
```

`DISTINCT` убирает повторяющиеся **строки результата** целиком — по всем перечисленным столбцам, а не по первому. Все `NULL` считаются одинаковыми, поэтому `NULL` в результате будет один раз.

В PostgreSQL есть ещё `DISTINCT ON (столбец)` — первая строка из каждой группы:

```sql
-- самый дешёвый товар в каждой категории
SELECT DISTINCT ON (category) category, name, price
FROM products
ORDER BY category, price;
```

## LIMIT и OFFSET

```sql
SELECT name, price FROM products ORDER BY price DESC LIMIT 3;   -- три самых дорогих

-- постраничный вывод: 2-я страница по 5 товаров
SELECT id, name FROM products ORDER BY id LIMIT 5 OFFSET 5;
```

- `LIMIT n` — не больше n строк.
- `OFFSET k` — пропустить первые k строк.
- `LIMIT` без `ORDER BY` возвращает «какие-то» n строк — почти всегда это ошибка.
- В стандарте SQL то же самое пишется как `FETCH FIRST 3 ROWS ONLY`, в SQL Server — `SELECT TOP 3`.

> [!tip] Большой OFFSET — медленно
> `OFFSET 100000` заставляет базу прочитать и выбросить 100 000 строк. Для глубокой пагинации используют «курсор по ключу»: `WHERE id > последний_id ORDER BY id LIMIT 20`.

## Практика

- [ ] Решить задачи тренажёра
- [ ] Отсортировать любую таблицу по столбцу с `NULL` с `NULLS FIRST` и без
- [ ] Написать постраничный вывод через `WHERE id > ...` вместо `OFFSET`

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

### От дорогих к дешёвым

Выведите название и цену всех товаров, от самого дорогого к самому дешёвому.

```sql check ordered
SELECT name, price FROM products ORDER BY price DESC;
```

```sql solution
SELECT name, price FROM products ORDER BY price DESC;
```

### Сортировка по двум столбцам

Выведите категорию, название и цену. Отсортируйте по категории в алфавитном порядке, а внутри категории — по цене от большей к меньшей.

```sql check ordered
SELECT category, name, price FROM products ORDER BY category, price DESC;
```

```text hint
Сортировать сначала по категории от А до Я, внутри категории — по цене от большей к меньшей.
Направление сортировки задаётся отдельно для каждого столбца.
```

```sql solution
SELECT category, name, price FROM products ORDER BY category, price DESC;
```

### Список категорий

Выведите список категорий без повторов в алфавитном порядке.

```sql check ordered
SELECT DISTINCT category FROM products ORDER BY category;
```

```sql solution
SELECT DISTINCT category FROM products ORDER BY category;
```

### Тройка самых дорогих

Выведите название и цену трёх самых дорогих товаров — от самого дорогого.

```sql check ordered
SELECT name, price FROM products ORDER BY price DESC LIMIT 3;
```

```sql solution
SELECT name, price FROM products ORDER BY price DESC LIMIT 3;
```

### Вторая страница каталога

Каталог показывает по 5 товаров на странице, сортировка по `id`. Выведите `id` и название товаров **второй** страницы.

```sql check ordered
SELECT id, name FROM products ORDER BY id LIMIT 5 OFFSET 5;
```

```text hint
Отсортировать по номеру → пропустить первые 5 строк → взять следующие 5.
```

```sql solution
SELECT id, name FROM products ORDER BY id LIMIT 5 OFFSET 5;
```

### Бренды, начиная с пустого

Выведите список брендов без повторов по алфавиту. Строка с `NULL` (товары без бренда) должна быть **первой**.

```sql check ordered
SELECT DISTINCT brand FROM products ORDER BY brand NULLS FIRST;
```

```text hint
Бренды без повторов → по алфавиту → пустой бренд в самом начале.
По умолчанию PostgreSQL ставит пустые значения в конец; как это поменять — в конспекте.
```

```sql solution
SELECT DISTINCT brand FROM products ORDER BY brand NULLS FIRST;
```

### Новинки

Выведите название и дату поступления пяти самых новых товаров — от самого нового.

```sql check ordered
SELECT name, added_at FROM products ORDER BY added_at DESC LIMIT 5;
```

```sql solution
SELECT name, added_at FROM products ORDER BY added_at DESC LIMIT 5;
```

### Самые ценные остатки

Выведите название и стоимость остатка (цена × количество) трёх товаров с самой большой стоимостью остатка — от большей к меньшей.

```sql check ordered
SELECT name, price * qty FROM products ORDER BY price * qty DESC LIMIT 3;
```

```text hint
Стоимость остатка = цена × остаток → отсортировать по ней от большей → оставить первые три.
Сортировать можно по имени, которое вы дали вычисленному столбцу.
```

```sql solution
SELECT name, price * qty AS stock_value
FROM products
ORDER BY stock_value DESC
LIMIT 3;
```

## Тест

### Какой порядок сортировки используется, если не указать ни ASC, ни DESC?
- [x] По возрастанию
- [ ] По убыванию
- [ ] В порядке вставки
- [ ] Случайный
> ASC — значение по умолчанию.

### Как отсортируется результат `ORDER BY category, price DESC`?
- [ ] Оба столбца по убыванию
- [x] Категория по возрастанию, внутри категории цена по убыванию
- [ ] Цена по убыванию, затем категория
- [ ] Ошибка: нужно указать направление для каждого столбца
> DESC относится только к price.

### Где окажутся NULL при `ORDER BY brand` в PostgreSQL?
- [ ] В начале
- [x] В конце
- [ ] Будут исключены из результата
- [ ] Порядок не определён
> PostgreSQL считает NULL больше любого значения: при ASC они в конце, при DESC — в начале.

### Что делает `SELECT DISTINCT category, brand`?
- [ ] Убирает повторы только по category
- [x] Оставляет уникальные пары (category, brand)
- [ ] Выдаёт ошибку: DISTINCT работает с одним столбцом
- [ ] Сортирует по двум столбцам
> DISTINCT сравнивает строки результата целиком.

### Какой запрос выведет строки с 21-й по 30-ю?
- [x] ... ORDER BY id LIMIT 10 OFFSET 20
- [ ] ... ORDER BY id LIMIT 20 OFFSET 10
- [ ] ... ORDER BY id LIMIT 30 OFFSET 20
- [ ] ... ORDER BY id OFFSET 21 LIMIT 30
> Пропустить 20, взять 10.

### Почему `SELECT * FROM logs LIMIT 10` без ORDER BY — плохая идея для «последних 10 записей»?
- [ ] LIMIT без ORDER BY не работает
- [x] Без сортировки вернутся какие-то 10 строк, не обязательно последние
- [ ] Запрос вернёт первые 10 строк по времени
- [ ] Запрос медленнее, чем с ORDER BY
> «Последние» — это ORDER BY created_at DESC LIMIT 10.

### Можно ли в ORDER BY использовать псевдоним, заданный в SELECT?
- [x] Да
- [ ] Нет
> ORDER BY выполняется после SELECT, поэтому псевдонимы уже известны. В WHERE — нельзя.

### Как сделать так, чтобы при сортировке по убыванию NULL оказались в конце?
= NULLS LAST
= ORDER BY brand DESC NULLS LAST
> При DESC PostgreSQL по умолчанию ставит NULL в начало.

### Чем плох большой OFFSET на больших таблицах?
- [x] База читает и отбрасывает все пропущенные строки
- [ ] OFFSET больше 1000 запрещён
- [ ] Результат может содержать дубликаты при параллельных вставках
- [ ] OFFSET игнорирует ORDER BY
> Поэтому для глубокой пагинации используют условие по ключу: WHERE id > последний_id. Третий вариант тоже бывает в жизни (страницы «съезжают», когда добавляются строки), но причина медленной работы — первая.

### Что вернёт `SELECT DISTINCT ON (category) category, name, price FROM products ORDER BY category, price`?
- [x] Самый дешёвый товар в каждой категории
- [ ] Самый дорогой товар в каждой категории
- [ ] Все товары без повторов названий
- [ ] Ошибку: DISTINCT ON не существует
> DISTINCT ON берёт первую строку каждой группы в порядке ORDER BY. Это особенность PostgreSQL.

### Как вывести три самых дорогих товара в стандартном SQL (работает и в PostgreSQL)?
- [x] ORDER BY price DESC FETCH FIRST 3 ROWS ONLY
- [x] ORDER BY price DESC LIMIT 3
- [ ] SELECT TOP 3 ... ORDER BY price DESC
- [ ] ORDER BY price DESC ROWNUM 3
> TOP — синтаксис SQL Server, ROWNUM — Oracle.
