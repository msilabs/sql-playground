---
title: "LEFT JOIN: বাঁয়ের সবাই থাকবে"
order: 26
summary: মিল না পেলেও বাঁয়ের table-এর row রাখা; ডান দিকে NULL বসে।
---

`LEFT JOIN` বাঁয়ের (FROM-এর) table-এর **প্রতিটা** row রাখে। ডান দিকে মিল পেলে সেই তথ্য বসে, না পেলে বসে NULL।

```syntax
SELECT t1.column, t2.column
FROM table1 t1
LEFT JOIN table2 t2 ON t2.id = t1.table2_id;
```

সব গ্রাহক, জেলা থাক বা না থাক:

```sql
SELECT c.name, d.name AS জেলা
FROM customers c
LEFT JOIN districts d ON d.id = c.district_id;
```

এবার ৩০ জনই এসেছেন। যার জেলা জানা নেই, তার `জেলা` ঘরে NULL।

## কারা কখনো অর্ডার দেননি

`LEFT JOIN`-এর সবচেয়ে কাজের ব্যবহার: "যাদের কিছু **নেই**" খোঁজা। গ্রাহক থেকে অর্ডারে LEFT JOIN করলে যার অর্ডার নেই, তার অর্ডারের ঘরগুলো NULL। তারপর শুধু সেগুলো রাখুন:

```sql
SELECT c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;
```

## কোন table বাঁয়ে, তা গুরুত্বপূর্ণ

এবার জেলা বাঁয়ে, গ্রাহক ডানে। কোন জেলায় একজন গ্রাহকও নেই:

```sql
SELECT d.name
FROM districts d
LEFT JOIN customers c ON c.district_id = d.id
WHERE c.id IS NULL;
```

## প্রতিটা জেলায় কয়জন, শূন্যসহ

`INNER JOIN` দিয়ে গুনলে শূন্য গ্রাহকের জেলাগুলো হারিয়ে যায়। `LEFT JOIN` আর `count(c.id)` দিলে সেগুলোও ০ নিয়ে আসে (`count(*)` দিলে ১ আসত, কারণ NULL-ওয়ালা row-টাও একটা row):

```sql
SELECT d.name, count(c.id) AS গ্রাহক
FROM districts d
LEFT JOIN customers c ON c.district_id = d.id
GROUP BY d.id
ORDER BY গ্রাহক DESC;
```

## ON আর WHERE-এর ফাঁদ

ডান table-এর ওপর শর্ত `WHERE`-এ দিলে NULL-ওয়ালা row-গুলো বাদ পড়ে, LEFT JOIN কার্যত INNER JOIN হয়ে যায়। নিচের প্রথম query-তে শুধু `paid` অর্ডার আছে এমন গ্রাহক আসে; দ্বিতীয়টায় সব গ্রাহক আসে, যার `paid` অর্ডার নেই তার পাশে NULL:

```sql
SELECT c.name, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid';
```

```sql
SELECT c.name, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid';
```

## নিজে চেষ্টা করুন

কোন পণ্য কখনো বিক্রি হয়নি (`order_items`-এ নেই)? পণ্যের নাম দেখুন।

```sql
SELECT p.name
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id;
```
