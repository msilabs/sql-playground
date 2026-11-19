---
title: "HAVING: দলের ওপর শর্ত"
order: 23
summary: WHERE ছাঁকে row, HAVING ছাঁকে দল; তাই count, sum-এর ওপর শর্ত HAVING-এ।
---

`GROUP BY` দিয়ে দল বানানোর পর কিছু দল বাদ দিতে চাইলে `HAVING`:

```syntax
SELECT column1, count(*)
FROM table_name
WHERE condition
GROUP BY column1
HAVING count(*) > 3;
```

যেসব গ্রাহক ৪টা বা তার বেশি অর্ডার দিয়েছেন:

```sql
SELECT customer_id, count(*) AS অর্ডার
FROM orders
GROUP BY customer_id
HAVING count(*) >= 4;
```

## WHERE আর HAVING-এর পার্থক্য

| | কখন চলে | কী ছাঁকে | count/sum লেখা যায়? |
| --- | --- | --- | --- |
| `WHERE` | দলে ভাগের **আগে** | row | না |
| `HAVING` | দলে ভাগের **পরে** | দল | হ্যাঁ |

`WHERE`-এ `count(*)` লিখলে SQLite ভুল দেখায়, কারণ তখনো দলই হয়নি:

```sql
SELECT customer_id, count(*) FROM orders WHERE count(*) >= 4 GROUP BY customer_id; -- ভুল হবে
```

## দুটো একসাথে

শুধু `paid` অর্ডার ধরে (`WHERE`), যাদের ৩টার বেশি এমন গ্রাহক (`HAVING`):

```sql
SELECT customer_id, count(*) AS paid_অর্ডার
FROM orders
WHERE status = 'paid'
GROUP BY customer_id
HAVING count(*) > 3
ORDER BY paid_অর্ডার DESC;
```

## যোগফলের ওপর শর্ত

যেসব অর্ডারের মোট টাকা ১০,০০০-এর বেশি:

```sql
SELECT order_id, sum(quantity * unit_price) AS টাকা
FROM order_items
GROUP BY order_id
HAVING sum(quantity * unit_price) > 10000
ORDER BY টাকা DESC;
```

SQLite-এ `HAVING টাকা > 10000`-ও চলে (SELECT-এর নাম ব্যবহার), তবে সব database-এ চলে না।

## ডুপ্লিকেট খোঁজা

`GROUP BY` + `HAVING count(*) > 1` হলো ডুপ্লিকেট খোঁজার পরিচিত কৌশল। একই ফোন নম্বর একাধিক গ্রাহকের নামে আছে কি না:

```sql
SELECT phone, count(*)
FROM customers
GROUP BY phone
HAVING count(*) > 1;
```

## নিজে চেষ্টা করুন

যেসব category-তে গড় দাম ১০০০ টাকার বেশি, সেগুলো আর তাদের গড় দাম দেখুন।

```sql
SELECT category, avg(price) FROM products GROUP BY category;
```
