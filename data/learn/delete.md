---
title: "DELETE: row মুছে ফেলা"
order: 16
summary: WHERE দিয়ে বেছে মোছা, আর অন্য table-এর সাথে যুক্ত row কেন মোছা যায় না।
---

row মুছতে `DELETE FROM`:

```syntax
DELETE FROM table_name WHERE condition;
```

বাতিল হওয়া অর্ডারের পণ্যগুলো `order_items` থেকে মুছে ফেলা যাক। আগে দেখি কয়টা আছে, তারপর মুছি, তারপর আবার গুনি:

```sql
SELECT count(*) FROM order_items;

DELETE FROM order_items
WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');

SELECT count(*) FROM order_items;
```

## WHERE ছাড়া DELETE

`DELETE FROM order_items;` লিখলে table থাকে, কিন্তু ভেতরের **সব row** মুছে যায়। `UPDATE`-এর মতোই নিয়ম: মোছার আগে একই `WHERE` দিয়ে `SELECT` চালিয়ে দেখুন কী মুছবে।

```sql
DELETE FROM order_items;

SELECT count(*) FROM order_items;
```

এখানে **শুরু থেকে** চাপলে সব ফিরে আসে। আসল database-এ আসে না।

## যে row-কে অন্য কেউ নির্দেশ করে

`orders` table-এর `customer_id` গ্রাহকের `id`-কে নির্দেশ করে (একে বলে **foreign key**)। কোনো গ্রাহকের অর্ডার থাকলে তাকে মুছতে গেলে SQLite আটকে দেয়, নাহলে অর্ডারগুলো এমন গ্রাহককে দেখাত যে আর নেই:

```sql
DELETE FROM customers WHERE id = 7; -- ভুল হবে
```

যে গ্রাহক কখনো অর্ডার দেননি, তাকে মোছা যায়:

```sql
DELETE FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);

SELECT count(*) FROM customers;
```

> অনেক আসল অ্যাপ row সত্যিই মোছে না; একটা `deleted_at` বা `is_active` column বদলে "মুছে ফেলা" চিহ্ন দেয়, যাতে দরকার হলে ফেরানো যায়।

## নিজে চেষ্টা করুন

যেসব পণ্যের স্টক শূন্য, সেগুলো মুছে দেখুন। কোনোটা মুছতে না পারলে কেন, ভুলের বার্তায় দেখুন।

```sql
SELECT name, stock FROM products WHERE stock = 0;
```
