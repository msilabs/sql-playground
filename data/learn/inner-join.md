---
title: "INNER JOIN: দুই দিকেই মিল"
order: 25
summary: শুধু যেসব row-এর দুই table-এই জোড়া আছে, সেগুলো আসে।
---

`INNER JOIN` (শুধু `JOIN` লিখলেও একই) দুই table থেকে সেই জোড়াগুলো রাখে, যেখানে `ON`-এর শর্ত সত্য। কোনো দিকে মিল না পেলে row-টা ফলে আসে না।

```syntax
SELECT t1.column, t2.column
FROM table1 t1
INNER JOIN table2 t2 ON t2.id = t1.table2_id;
```

প্রতিটা গ্রাহক আর তার জেলা:

```sql
SELECT c.name, d.name AS জেলা
FROM customers c
INNER JOIN districts d ON d.id = c.district_id;
```

গ্রাহক ৩০ জন, কিন্তু ফলে একজন কম। যার জেলা NULL, তার কোনো মিল নেই, তাই সে বাদ। আবার যেসব জেলায় কোনো গ্রাহক নেই, সেগুলোও আসেনি। মিল না পেলেও রাখতে চাইলে [LEFT JOIN](/learn/left-join/)।

## ছোট নাম দিন

`customers c` মানে `customers`-কে এই query-তে `c` নামে ডাকব। দুই table-এ একই নামের column (যেমন `name`, `id`) থাকলে `c.name`, `d.name` না লিখলে SQLite বুঝতে পারে না কোনটা:

```sql
SELECT name FROM customers c JOIN districts d ON d.id = c.district_id; -- ভুল হবে
```

## JOIN-এর পরে WHERE আর ORDER BY

জোড়া লাগানোর পরে বাকিটা সাধারণ query-র মতোই। চট্টগ্রাম বিভাগের গ্রাহক:

```sql
SELECT c.name, d.name AS জেলা
FROM customers c
JOIN districts d ON d.id = c.district_id
WHERE d.division = 'চট্টগ্রাম'
ORDER BY d.name;
```

## তিন table জোড়া

একটার পর একটা `JOIN` লিখুন। প্রতিটা অর্ডারে কোন পণ্য কয়টা, পণ্যের নামসহ:

```sql
SELECT o.id AS অর্ডার, p.name AS পণ্য, oi.quantity
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE o.id <= 3
ORDER BY o.id;
```

## JOIN আর GROUP BY

প্রতিটা গ্রাহক মোট কত টাকার কেনাকাটা করেছেন (শুধু `paid`), সবচেয়ে বেশি আগে:

```sql
SELECT c.name, sum(oi.quantity * oi.unit_price) AS মোট
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'paid'
GROUP BY c.id
ORDER BY মোট DESC
LIMIT 5;
```

## নিজে চেষ্টা করুন

প্রতিটা অর্ডারের id-এর পাশে গ্রাহকের নাম আর ফোন দেখুন।

```sql
SELECT o.id FROM orders o;
```
