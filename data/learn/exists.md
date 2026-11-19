---
title: "EXISTS: আছে কি না"
order: 32
summary: অন্য table-এ অন্তত একটা মিল আছে কি না; NOT EXISTS দিয়ে যার নেই।
---

`EXISTS (subquery)` সত্য হয়, যদি ভেতরের query অন্তত একটা row দেয়। কী দিল তা দেখে না, শুধু কিছু এল কি না।

```syntax
SELECT column1
FROM table1 t
WHERE EXISTS (SELECT 1 FROM table2 WHERE table2.t_id = t.id);
```

যেসব গ্রাহক অন্তত একটা অর্ডার দিয়েছেন:

```sql
SELECT c.name
FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```

ভেতরের query প্রতিটা গ্রাহকের জন্য আলাদা করে চলে (`c.id` বাইরের row থেকে আসে)। ভেতরে `SELECT 1` লেখা রীতি; কী select করছেন তাতে কিছু যায় আসে না।

## NOT EXISTS: যার নেই

যেসব গ্রাহক কখনো অর্ডার দেননি:

```sql
SELECT c.name
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```

একই কাজ `LEFT JOIN … WHERE o.id IS NULL` বা `NOT IN` দিয়েও হয়। `NOT IN`-এর তালিকায় NULL থাকলে সেটা চুপচাপ খালি ফল দেয় ([IN পাঠ](/learn/in/) দেখুন), `NOT EXISTS`-এ এই ফাঁদ নেই।

## শর্তসহ খোঁজা

যেসব পণ্য অন্তত একটা বাতিল অর্ডারে ছিল:

```sql
SELECT p.name
FROM products p
WHERE EXISTS (
  SELECT 1
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p.id AND o.status = 'cancelled'
);
```

## ANY আর ALL কোথায়?

কিছু database-এ `price > ALL (SELECT …)` (সবগুলোর চেয়ে বড়) আর `price > ANY (SELECT …)` (অন্তত একটার চেয়ে বড়) লেখা যায়। SQLite-এ এগুলো নেই, কিন্তু একই কাজ সহজে হয়:

| অন্য database | SQLite-এ |
| --- | --- |
| `x > ALL (SELECT v …)` | `x > (SELECT max(v) …)` |
| `x > ANY (SELECT v …)` | `x > (SELECT min(v) …)` |
| `x = ANY (SELECT v …)` | `x IN (SELECT v …)` |

বইয়ের সব দামের চেয়ে বেশি দামি পণ্য:

```sql
SELECT name, price
FROM products
WHERE price > (SELECT max(price) FROM products WHERE category = 'বই')
  AND category <> 'বই';
```

## নিজে চেষ্টা করুন

যেসব জেলায় অন্তত একজন গ্রাহক আছেন, `EXISTS` দিয়ে সেই জেলাগুলোর নাম দেখুন।

```sql
SELECT d.name FROM districts d;
```
