---
title: "UPDATE: আগের ডেটা বদলানো"
order: 15
summary: SET দিয়ে নতুন মান, WHERE দিয়ে কোন row; WHERE ভুললে সব বদলে যায়।
---

যা আছে তা বদলাতে `UPDATE`:

```syntax
UPDATE table_name
SET column1 = value1, column2 = value2
WHERE condition;
```

চা পাতার স্টক শেষ হয়ে গিয়েছিল, নতুন ৪০ প্যাকেট এসেছে:

```sql
UPDATE products SET stock = 40 WHERE name = 'চা পাতা';

SELECT name, stock FROM products WHERE category = 'খাবার';
```

ফলের প্রথম বোতামে দেখুন কয়টা row বদলেছে, দ্বিতীয়টায় নতুন অবস্থা।

## WHERE-ই সব

`WHERE` না দিলে **table-এর প্রতিটা row** বদলে যায়। আসল database-এ এটা ফেরানো যায় না:

```sql
UPDATE products SET price = 100;

SELECT name, price FROM products;
```

সব পণ্যের দাম এখন ১০০! এখানে ভয় নেই, **শুরু থেকে** চাপলেই আগের ডেটা। কিন্তু আসল কাজে `UPDATE` লেখার আগে একই `WHERE` দিয়ে একটা `SELECT` চালিয়ে দেখে নিন কোন row-গুলো বদলাবে।

## পুরোনো মান দিয়ে হিসাব

`SET`-এর ডান পাশে column-এর এখনকার মান ব্যবহার করা যায়। সব ইলেকট্রনিক্সের দাম ১০% বাড়ানো:

```sql
UPDATE products
SET price = price * 1.10
WHERE category = 'ইলেকট্রনিক্স';

SELECT name, price FROM products WHERE category = 'ইলেকট্রনিক্স';
```

দাম এখন দশমিকে চলে গেছে। গোল করতে `round(price * 1.10)`।

## একসাথে কয়েকটা column

```sql
UPDATE orders
SET status = 'paid', payment = 'bkash'
WHERE id = 2;

SELECT * FROM orders WHERE id = 2;
```

## নিজে চেষ্টা করুন

`pending` থাকা সব অর্ডারকে `cancelled` করে দিন, তারপর প্রতিটা status-এ কয়টা অর্ডার দেখুন।

```sql
UPDATE orders SET status = 'cancelled' WHERE status = '';

SELECT status, count(*) FROM orders GROUP BY status;
```
