---
title: Агрегатные функции и GROUP BY
slug: agregatnye-funkcii-group-by
description: Считаем итоги — count, sum, avg, min, max. Группировка строк через GROUP BY, фильтр групп через HAVING и разница между WHERE и HAVING.
duration: 60
level: Основы
quizSize: 10
materials:
  - title: PostgreSQL — агрегатные функции
    url: https://www.postgresql.org/docs/current/functions-aggregate.html
    type: документация
  - title: PostgreSQL — GROUP BY и HAVING
    url: https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUP
    type: документация
---

# Агрегатные функции и GROUP BY

«Сколько заказов за вчера?», «Какая средняя зарплата по отделам?», «В каких городах выручка больше миллиона?» — на такие вопросы отвечают агрегатные функции. Это основа любой аналитики и половина задач на собеседованиях.

## Агрегатные функции

Агрегатная функция превращает **много строк в одно значение**:

```sql
SELECT count(*)          AS products,     -- число строк
       sum(qty)          AS total_units,  -- сумма
       round(avg(price)) AS avg_price,    -- среднее
       min(price)        AS cheapest,     -- минимум
       max(added_at)     AS newest        -- максимум (работает и для дат, и для строк)
FROM products;
```

Результат — одна строка.

### count(*) и count(столбец)

- `count(*)` — число **строк**.
- `count(brand)` — число строк, где `brand` **не NULL**.
- `count(DISTINCT brand)` — число **разных** не-NULL значений.

Все агрегатные функции, кроме `count(*)`, **пропускают NULL**. `avg(x)` делит сумму на число не-NULL значений, а не на число строк.

> [!warning] sum по пустому набору — NULL, а не 0
> Если ни одна строка не подошла под условие, `sum(...)` вернёт `NULL`. В отчётах оборачивайте: `COALESCE(sum(amount), 0)`. `count(...)` в этом случае вернёт 0.

## GROUP BY — итоги по группам

```sql
SELECT category, count(*) AS products, sum(qty) AS units
FROM products
GROUP BY category;
```

База раскладывает строки по группам с одинаковым значением `category` и для каждой группы считает агрегаты. Одна группа — одна строка результата.

Главное правило GROUP BY: в `SELECT` можно писать **только**:

- столбцы, перечисленные в `GROUP BY`;
- агрегатные функции;
- выражения из них.

```sql
SELECT category, name, count(*) FROM products GROUP BY category;
-- ERROR: column "products.name" must appear in the GROUP BY clause or be used in an aggregate function
```

Логично: в группе «Смартфоны» три товара — какое из трёх названий показать? (MySQL в старых настройках молча брал случайное — так делать нельзя.)

Группировать можно по нескольким столбцам и по выражениям:

```sql
SELECT category, brand, count(*) FROM products GROUP BY category, brand;
SELECT date_trunc('month', added_at) AS month, count(*) FROM products GROUP BY month ORDER BY month;
```

`NULL` образует **одну** отдельную группу.

## HAVING — фильтр групп

```sql
SELECT category, count(*) AS products
FROM products
GROUP BY category
HAVING count(*) > 2;
```

### WHERE против HAVING

| | WHERE | HAVING |
| --- | --- | --- |
| Когда работает | **до** группировки | **после** группировки |
| Что фильтрует | строки | группы |
| Агрегаты в условии | нельзя | можно |

```sql
-- стоимость остатков по категориям, только товары в наличии,
-- только категории, где эта стоимость больше 200 000
SELECT category, sum(price * qty) AS stock_value
FROM products
WHERE qty > 0                          -- отбрасываем строки
GROUP BY category
HAVING sum(price * qty) > 200000       -- отбрасываем группы
ORDER BY stock_value DESC;
```

Условие, которое не использует агрегат, пишите в `WHERE`: база отбросит лишние строки до группировки, и запрос будет быстрее.

## Условная агрегация

Несколько разных счётчиков в одном запросе:

```sql
SELECT category,
       count(*)                                 AS total,
       count(*) FILTER (WHERE qty = 0)          AS out_of_stock,   -- PostgreSQL
       sum(CASE WHEN qty = 0 THEN 1 ELSE 0 END) AS out_of_stock_2  -- работает везде
FROM products
GROUP BY category;
```

## Практика

- [ ] Решить задачи тренажёра
- [ ] Сравнить `count(*)`, `count(brand)` и `count(DISTINCT brand)` на одной таблице
- [ ] Специально вывести в `SELECT` столбец, которого нет в `GROUP BY`, и прочитать ошибку

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

### Сводка по складу

Одним запросом выведите: число товаров, общее количество единиц на складе, самую низкую и самую высокую цену.

```sql check
SELECT count(*), sum(qty), min(price), max(price) FROM products;
```

```sql solution
SELECT count(*) AS products, sum(qty) AS units, min(price) AS cheapest, max(price) AS priciest
FROM products;
```

### Товаров в категории

Выведите каждую категорию и число товаров в ней.

```sql check
SELECT category, count(*) FROM products GROUP BY category;
```

```sql solution
SELECT category, count(*) AS products FROM products GROUP BY category;
```

### Средняя цена по категориям

Выведите категорию и среднюю цену товаров в ней, округлённую до целых. Отсортируйте от самой дорогой категории.

```sql check ordered
SELECT category, round(avg(price)) FROM products GROUP BY category ORDER BY avg(price) DESC;
```

```sql solution
SELECT category, round(avg(price)) AS avg_price
FROM products
GROUP BY category
ORDER BY avg_price DESC;
```

### Единицы по брендам

Выведите бренд и общее количество единиц товаров этого бренда на складе. Товары без бренда — отдельной строкой.

```sql check
SELECT brand, sum(qty) FROM products GROUP BY brand;
```

```text hint
Разложить товары по брендам → в каждой группе сложить остатки.
Товары без бренда сами окажутся в одной общей группе — отдельно делать ничего не нужно.
```

```sql solution
SELECT brand, sum(qty) AS units FROM products GROUP BY brand;
```

### Большие категории

Выведите категории, в которых **больше двух** товаров, и число товаров в них.

```sql check
SELECT category, count(*) FROM products GROUP BY category HAVING count(*) > 2;
```

```text hint
Разложить товары по категориям → посчитать товары в каждой → оставить группы, где их больше двух.
Условие на посчитанное значение проверяется после группировки, а не до неё.
```

```sql solution
SELECT category, count(*) AS products
FROM products
GROUP BY category
HAVING count(*) > 2;
```

### Ценные категории

Посчитайте стоимость остатков (цена × количество) по категориям, учитывая **только товары в наличии**. Выведите категории, где эта стоимость больше 200 000, — категорию и стоимость, от большей к меньшей.

```sql check ordered
SELECT category, sum(price * qty) FROM products WHERE qty > 0
GROUP BY category HAVING sum(price * qty) > 200000 ORDER BY 2 DESC;
```

```sql solution
SELECT category, sum(price * qty) AS stock_value
FROM products
WHERE qty > 0
GROUP BY category
HAVING sum(price * qty) > 200000
ORDER BY stock_value DESC;
```

### Сколько брендов

Для каждой категории выведите: категорию, число товаров, число товаров с указанным брендом и число **разных** брендов.

```sql check
SELECT category, count(*), count(brand), count(DISTINCT brand) FROM products GROUP BY category;
```

```text hint
Для каждой категории три числа:
  сколько всего товаров;
  у скольких указан бренд;
  сколько разных брендов.
Всё это считает одна и та же функция — результат зависит от того, что передать ей внутрь.
```

```sql solution
SELECT category,
       count(*)              AS products,
       count(brand)          AS with_brand,
       count(DISTINCT brand) AS brands
FROM products
GROUP BY category;
```

### Нет в наличии по категориям

Для каждой категории выведите: категорию, общее число товаров и сколько из них **нет в наличии** (`qty = 0`). Категории без отсутствующих товаров тоже должны быть в результате — с нулём.

```sql check
SELECT category, count(*), count(*) FILTER (WHERE qty = 0) FROM products GROUP BY category;
```

```text hint
Если сначала оставить только товары с нулевым остатком, категории без таких товаров пропадут из результата.
Поэтому: разложить все товары по категориям → в каждой посчитать всё и отдельно — только с остатком 0. Способы условного подсчёта есть в конспекте.
```

```sql solution
SELECT category,
       count(*)                        AS total,
       count(*) FILTER (WHERE qty = 0) AS out_of_stock
FROM products
GROUP BY category;
```

### Поступления по месяцам

Выведите число товаров, поступивших в каждом месяце, в хронологическом порядке. Первый столбец — начало месяца (`date_trunc('month', added_at)`), второй — количество.

```sql check ordered
SELECT date_trunc('month', added_at), count(*) FROM products GROUP BY 1 ORDER BY 1;
```

```sql solution
SELECT date_trunc('month', added_at) AS month, count(*) AS products
FROM products
GROUP BY month
ORDER BY month;
```

## Тест

### Таблица из 10 строк, в столбце `bonus` 4 значения NULL. Что вернёт `count(bonus)`?
= 6
> count(столбец) не считает NULL. count(*) вернул бы 10.

### В столбце `score` значения 10, 20 и NULL. Чему равно `avg(score)`?
- [ ] 10
- [x] 15
- [ ] NULL
- [ ] 30
> avg пропускает NULL: (10 + 20) / 2 = 15.

### Что вернёт `SELECT sum(amount) FROM orders WHERE false`?
- [ ] 0
- [x] NULL
- [ ] Ноль строк
- [ ] Ошибку
> Агрегат без GROUP BY всегда возвращает одну строку. sum по пустому набору — NULL, поэтому в отчётах пишут COALESCE(sum(amount), 0).

### Почему запрос `SELECT category, name, count(*) FROM products GROUP BY category` выдаёт ошибку?
- [ ] count(*) нельзя использовать с GROUP BY
- [x] name не в GROUP BY и не внутри агрегатной функции
- [ ] Нужно писать GROUP BY 1
- [ ] Нельзя выбирать больше двух столбцов
> В группе несколько строк с разными name — база не знает, какое показать.

### Чем отличаются WHERE и HAVING?
- [x] WHERE фильтрует строки до группировки, HAVING — группы после
- [x] В HAVING можно использовать агрегатные функции, в WHERE — нет
- [ ] HAVING работает быстрее WHERE
- [ ] Это синонимы
> Условия без агрегатов лучше писать в WHERE — меньше строк попадёт в группировку.

### Как посчитать число разных брендов?
= count(DISTINCT brand)
= COUNT(DISTINCT brand)

### Как GROUP BY обращается с NULL?
- [ ] Отбрасывает строки с NULL
- [x] Собирает все NULL в одну группу
- [ ] Каждый NULL становится отдельной группой
- [ ] Выдаёт ошибку
> Для группировки NULL считаются одинаковыми, хотя в WHERE NULL = NULL не истинно.

### Какой запрос выведет отделы, где больше 5 сотрудников?
- [x] SELECT dept FROM emp GROUP BY dept HAVING count(*) > 5
- [ ] SELECT dept FROM emp WHERE count(*) > 5 GROUP BY dept
- [ ] SELECT dept FROM emp GROUP BY dept WHERE count(*) > 5
- [ ] SELECT dept, count(*) > 5 FROM emp GROUP BY dept
> Агрегат в условии — только в HAVING.

### Как в одном запросе посчитать и все заказы, и только оплаченные?
- [x] count(*), count(*) FILTER (WHERE paid)
- [x] count(*), sum(CASE WHEN paid THEN 1 ELSE 0 END)
- [ ] count(*), count(paid = true)
- [ ] count(*) WHERE paid
> count(paid = true) посчитает и false: count считает все не-NULL значения. Сработало бы count(CASE WHEN paid THEN 1 END) — там для неоплаченных получается NULL.

### В каком порядке выполняются части запроса?
- [ ] SELECT → FROM → WHERE → GROUP BY → HAVING
- [x] FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY
- [ ] FROM → GROUP BY → WHERE → HAVING → SELECT
- [ ] FROM → WHERE → HAVING → GROUP BY → SELECT
> Поэтому псевдонимы из SELECT недоступны в WHERE и HAVING, но доступны в ORDER BY. PostgreSQL дополнительно разрешает их в GROUP BY.

### Сколько строк вернёт `SELECT count(*) FROM products`?
= 1
> Агрегатная функция без GROUP BY сворачивает всю таблицу в одну строку.

### Что вернёт `max(name)` для текстового столбца?
- [ ] Самую длинную строку
- [x] Последнюю строку в алфавитном порядке
- [ ] Ошибку: max только для чисел
- [ ] Строку с наибольшим id
> min и max работают с любыми сравнимыми типами: числами, строками, датами.
