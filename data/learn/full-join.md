---
title: "FULL JOIN: দুই দিকের সবাই"
order: 28
summary: দুই table-এর সব row; যার মিল নেই তার অন্য দিকে NULL।
---

`FULL JOIN` (বা `FULL OUTER JOIN`) হলো LEFT আর RIGHT JOIN একসাথে: দুই দিকের প্রতিটা row থাকে। মিল পেলে পাশাপাশি, না পেলে অন্য দিকে NULL।

```syntax
SELECT t1.column, t2.column
FROM table1 t1
FULL JOIN table2 t2 ON t1.table2_id = t2.id;
```

গ্রাহক আর জেলা: জেলাহীন গ্রাহকও আসবেন, গ্রাহকহীন জেলাও আসবে।

```sql
SELECT c.name AS গ্রাহক, d.name AS জেলা
FROM customers c
FULL JOIN districts d ON d.id = c.district_id
ORDER BY d.name, c.name;
```

ফলে তিন রকম row:

| গ্রাহক | জেলা | মানে |
| --- | --- | --- |
| নাম আছে | নাম আছে | দুই দিকেই মিল |
| নাম আছে | NULL | গ্রাহকের জেলা জানা নেই |
| NULL | নাম আছে | এই জেলায় কোনো গ্রাহক নেই |

## শুধু যাদের মিল নেই

দুই দিকের "একা" row-গুলো একসাথে খুঁজতে কাজে লাগে, যেমন দুই তালিকা মিলিয়ে কোথায় গরমিল:

```sql
SELECT c.name AS গ্রাহক, d.name AS জেলা
FROM customers c
FULL JOIN districts d ON d.id = c.district_id
WHERE c.id IS NULL OR d.id IS NULL;
```

## কয়টা row আসে

INNER JOIN-এর জোড়াগুলো, তার সাথে বাঁয়ের মিলহীন row, তার সাথে ডানের মিলহীন row:

```sql
SELECT
  (SELECT count(*) FROM customers c JOIN districts d ON d.id = c.district_id) AS মিল,
  (SELECT count(*) FROM customers c FULL JOIN districts d ON d.id = c.district_id) AS FULL_JOIN;
```

> FULL JOIN প্রতিদিনের কাজে কম লাগে। বেশি লাগে ডেটা মেলানোর কাজে: দুই উৎসের তালিকায় কোনটা এক জায়গায় আছে কিন্তু অন্য জায়গায় নেই।

## নিজে চেষ্টা করুন

পণ্য আর বিক্রির লাইন (`order_items`) FULL JOIN করে যেসব পণ্য কখনো বিক্রি হয়নি সেগুলো বের করুন।

```sql
SELECT p.name, oi.id
FROM products p
FULL JOIN order_items oi ON oi.product_id = p.id;
```
