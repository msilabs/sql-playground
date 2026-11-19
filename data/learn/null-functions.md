---
title: "IFNULL, COALESCE: NULL সামলানো"
order: 34
summary: NULL-এর জায়গায় বিকল্প মান বসানো, আর NULLIF দিয়ে শূন্য দিয়ে ভাগ এড়ানো।
---

NULL হিসাব নষ্ট করে আর ফলে ফাঁকা দেখায় ([NULL পাঠ](/learn/null/))। এর জায়গায় কোনো বিকল্প মান বসাতে কয়েকটা ফাংশন আছে।

| ফাংশন | কাজ |
| --- | --- |
| `ifnull(x, y)` | x NULL হলে y, নাহলে x |
| `coalesce(x, y, z, …)` | বাঁ থেকে প্রথম যেটা NULL নয় |
| `nullif(x, y)` | x আর y সমান হলে NULL, নাহলে x |

## IFNULL: একটা বিকল্প

জেলা না জানা থাকলে "অজানা" দেখাও:

```sql
SELECT c.name, ifnull(d.name, 'অজানা') AS জেলা
FROM customers c
LEFT JOIN districts d ON d.id = c.district_id;
```

## COALESCE: কয়েকটা বিকল্প, প্রথম যেটা আছে

`coalesce` যতগুলো খুশি মান নেয়। সব database-এ চলে (`ifnull` SQLite আর MySQL-এ; SQL Server-এ `ISNULL`, Oracle-এ `NVL`), তাই এটা মনে রাখাই সবচেয়ে কাজের।

```sql
SELECT coalesce(NULL, NULL, 'তৃতীয়টা', 'চতুর্থটা');
```

## LEFT JOIN-এর পরে শূন্য

প্রতিটা গ্রাহকের মোট কেনাকাটা; যার অর্ডার নেই তার পাশে NULL-এর বদলে ০:

```sql
SELECT c.name, coalesce(sum(oi.quantity * oi.unit_price), 0) AS মোট
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.id
ORDER BY মোট;
```

## NULLIF: শূন্য দিয়ে ভাগ এড়ানো

কোনো পণ্যের স্টক শূন্য হলে "দাম ÷ স্টক"-এ গোলমাল। `nullif(stock, 0)` শূন্যকে NULL বানায়, ফলে ভাগফল NULL হয়, ভুল সংখ্যা নয়:

```sql
SELECT name, price, stock, price / nullif(stock, 0) AS প্রতি_স্টকে
FROM products
ORDER BY stock;
```

SQLite শূন্য দিয়ে ভাগে ভুল দেখায় না, চুপচাপ NULL দেয়; অনেক database ভুল দেখায়। তাই `nullif` অভ্যাস করা ভালো।

## নিজে চেষ্টা করুন

স্কুলের শিক্ষার্থীদের নাম আর রোল দেখুন; রোল না থাকলে 'রোল নেই' দেখান।

```sql-school
SELECT name, roll FROM students;
```
