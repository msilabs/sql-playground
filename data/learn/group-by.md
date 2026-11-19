---
title: "GROUP BY: দলে ভাগ করে হিসাব"
order: 22
summary: একই মানের row এক দলে, তারপর প্রতিটা দলের জন্য count, sum, avg।
---

`count(*)` পুরো table-এর একটা উত্তর দেয়। "**প্রতিটা** category-তে কয়টা?" জানতে row-গুলো আগে দলে ভাগ করতে হয়: একই `category`-র row এক দলে। তারপর প্রতিটা দল থেকে একটা row আসে।

```syntax
SELECT column1, count(*)
FROM table_name
WHERE condition
GROUP BY column1;
```

```sql
SELECT category, count(*) AS পণ্য
FROM products
GROUP BY category;
```

> [Playground](/)-এ এই query চালিয়ে ডানে "ধাপে ধাপে" দেখুন: GROUP BY ধাপে একই দলের row-গুলো একই রঙে দেখায়।

## যেকোনো aggregate চলে

প্রতিটা category-র পণ্য সংখ্যা, মোট স্টক আর গড় দাম একসাথে:

```sql
SELECT category, count(*), sum(stock), round(avg(price))
FROM products
GROUP BY category;
```

## WHERE আগে, GROUP BY পরে

`WHERE` দলে ভাগের আগেই row ছাঁকে। শুধু `paid` অর্ডার, পরিশোধের পদ্ধতি অনুযায়ী:

```sql
SELECT payment, count(*)
FROM orders
WHERE status = 'paid'
GROUP BY payment
ORDER BY count(*) DESC;
```

## কয়েকটা column দিয়ে দল

দুইটা column মিলে একই হলে তবেই এক দল। প্রতিটা status আর payment-এর জোড়ায় কয়টা অর্ডার:

```sql
SELECT status, payment, count(*)
FROM orders
GROUP BY status, payment
ORDER BY status, payment;
```

## SELECT-এ কী রাখা যায়

GROUP BY থাকলে `SELECT`-এ রাখুন শুধু (১) যে column দিয়ে দল করেছেন, আর (২) aggregate (`count`, `sum`…)। নিচের query-তে `name` কোনোটাই নয়। প্রতিটা category-তে অনেক নাম, তবু একটা row-এ একটাই নাম আসবে। SQLite ভুল না দেখিয়ে দলের যেকোনো একটা নাম বসিয়ে দেয়, যা প্রায় সবসময় বিভ্রান্তিকর (অনেক database এখানে সরাসরি ভুল দেখায়):

```sql
SELECT category, name, count(*)
FROM products
GROUP BY category;
```

## দলের ওপর শর্ত

"যেসব category-তে ৪টার বেশি পণ্য" ধরনের শর্ত `WHERE`-এ চলে না, লাগে `HAVING`: দেখুন [HAVING পাঠ](/learn/having/)।

## নিজে চেষ্টা করুন

প্রতিটা গ্রাহক (`customer_id`) কয়টা করে অর্ডার দিয়েছেন? বেশি থেকে কম সাজান।

```sql
SELECT customer_id FROM orders;
```
