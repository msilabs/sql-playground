---
title: "UNION: দুই query-র ফল এক তালিকায়"
order: 30
summary: UNION ডুপ্লিকেট বাদ দেয়, UNION ALL দেয় না; দুই পাশে column সমান লাগে।
---

JOIN জোড়ে পাশাপাশি (column বাড়ে)। `UNION` জোড়ে নিচে নিচে (row বাড়ে): প্রথম query-র ফলের নিচে দ্বিতীয়টার ফল।

```syntax
SELECT column1, column2 FROM table1
UNION
SELECT column1, column2 FROM table2;
```

দোকানের সব জায়গার নাম, জেলা আর বিভাগ মিলিয়ে এক তালিকায়:

```sql
SELECT name FROM districts
UNION
SELECT division FROM districts;
```

"ঢাকা" জেলাও, বিভাগও; কিন্তু তালিকায় একবারই এসেছে। `UNION` একই রকম row একবার রাখে।

## UNION ALL: সব রাখে

ডুপ্লিকেটসহ সব চাইলে `UNION ALL`। ডুপ্লিকেট খুঁজতে হয় না বলে এটা দ্রুতও:

```sql
SELECT name FROM districts
UNION ALL
SELECT division FROM districts;
```

## নিয়ম

- দুই পাশের `SELECT`-এ column-এর **সংখ্যা** সমান হতে হবে।
- ফলের column-এর নাম আসে প্রথম `SELECT` থেকে।
- `ORDER BY` একবারই, একদম শেষে; পুরো ফল সাজায়।

```sql
SELECT name, 'পণ্য' AS ধরন FROM products WHERE price > 2500
UNION ALL
SELECT name, 'গ্রাহক' FROM customers WHERE name LIKE '%ইসলাম'
ORDER BY ধরন, name;
```

column-এর সংখ্যা না মিললে:

```sql
SELECT name, price FROM products UNION SELECT name FROM customers; -- ভুল হবে
```

## কাজের উদাহরণ: সারাংশের শেষে মোট

প্রতিটা category-র স্টক, তারপর শেষে মোট:

```sql
SELECT category, sum(stock) AS স্টক FROM products GROUP BY category
UNION ALL
SELECT 'সব মিলিয়ে', sum(stock) FROM products;
```

## INTERSECT আর EXCEPT

একই ধাঁচে আরও দুইটা: `INTERSECT` দেয় দুই ফলেই আছে এমন row, `EXCEPT` দেয় প্রথমটায় আছে কিন্তু দ্বিতীয়টায় নেই এমন row। যে জেলার নাম আর বিভাগের নাম এক:

```sql
SELECT name FROM districts
INTERSECT
SELECT division FROM districts;
```

## নিজে চেষ্টা করুন

যেসব গ্রাহকের জেলা ঢাকা (`district_id = 1`) আর যারা ২০২৫-এ যোগ দিয়েছেন, দুই দলের নাম এক তালিকায়, কেউ যেন দুইবার না আসে।

```sql
SELECT name FROM customers WHERE district_id = 1;
```
