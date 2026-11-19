---
title: "INSERT INTO … SELECT: query-র ফল ঢোকানো"
order: 17
summary: VALUES হাতে না লিখে আরেকটা SELECT-এর ফল দিয়ে অনেক row একবারে যোগ করা।
---

`VALUES`-এর জায়গায় একটা `SELECT` বসালে তার ফলের প্রতিটা row নতুন row হয়ে ঢোকে:

```syntax
INSERT INTO table2 (column1, column2)
SELECT column1, column2
FROM table1
WHERE condition;
```

`SELECT`-এর column-এর সংখ্যা আর ক্রম `INSERT`-এর বন্ধনীর সাথে মিলতে হবে। নামের মিল লাগে না, শুধু ক্রম।

## উদাহরণ: সব বইয়ের নতুন সংস্করণ

প্রতিটা বইয়ের একটা "নতুন সংস্করণ" যোগ করি, দাম ৫০ টাকা বেশি, স্টক শূন্য:

```sql
INSERT INTO products (name, category, price, stock)
SELECT name || ' (নতুন সংস্করণ)', category, price + 50, 0
FROM products
WHERE category = 'বই';

SELECT * FROM products WHERE category = 'বই';
```

`SELECT`-এর ভেতরে হিসাব, লেখা জোড়া, সবই চলে; যা আসে তাই ঢোকে।

## উদাহরণ: অর্ডার নকল করা

একজন গ্রাহক আগের অর্ডারটাই আবার দিতে চান। নতুন অর্ডার বানিয়ে, পুরোনো অর্ডারের পণ্যগুলো নতুন অর্ডারে কপি:

```sql
INSERT INTO orders (customer_id, order_date, status, payment)
VALUES (7, '2025-11-01', 'pending', 'bkash');

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT last_insert_rowid(), product_id, quantity, unit_price
FROM order_items
WHERE order_id = 1;

SELECT * FROM order_items ORDER BY id DESC LIMIT 5;
```

`last_insert_rowid()` দেয় এইমাত্র ঢোকানো row-এর id, এখানে নতুন অর্ডারের id।

## SELECT INTO কোথায়?

SQL Server আর কিছু database-এ `SELECT … INTO new_table` দিয়ে query-র ফল থেকে নতুন table বানানো যায়। SQLite-এ এটা নেই; একই কাজ হয় `CREATE TABLE new_table AS SELECT …` দিয়ে:

```sql
CREATE TABLE expensive_products AS
SELECT name, price FROM products WHERE price > 2000;

SELECT * FROM expensive_products;
```

table বানানো নিয়ে বিস্তারিত থাকবে database-এর পাঠে।

## নিজে চেষ্টা করুন

যেসব পণ্যের স্টক ১০-এর কম, সেগুলোর একটা করে নকল যোগ করুন, নামের শেষে " (রিস্টক)" আর স্টক ১০০।

```sql
SELECT name, stock FROM products WHERE stock < 10;
```
