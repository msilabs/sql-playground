---
title: "Self JOIN: table নিজের সাথে"
order: 29
summary: একই table-কে দুই নামে ডেকে row-গুলো নিজেদের মধ্যে মেলানো।
---

কখনো একই table-এর row-গুলোকে নিজেদের মধ্যে তুলনা করতে হয়: একই জেলার দুই গ্রাহক, একই ফোনের দুই অ্যাকাউন্ট, কর্মী আর তার ম্যানেজার (দুজনেই একই `employees` table-এ)। তখন table-টাকে দুইটা আলাদা নাম দিয়ে নিজের সাথেই JOIN করা হয়। আলাদা কোনো শব্দ নেই, সাধারণ JOIN-ই।

```syntax
SELECT a.column, b.column
FROM table1 a
JOIN table1 b ON a.column = b.column AND a.id < b.id;
```

## একই জেলার গ্রাহক জোড়া

`a` আর `b` দুইটাই `customers`। জেলা একই হলে জোড়া:

```sql
SELECT a.name, b.name, a.district_id
FROM customers a
JOIN customers b ON a.district_id = b.district_id AND a.id < b.id
ORDER BY a.district_id;
```

`a.id < b.id` কেন? এটা না দিলে প্রত্যেকে নিজের সাথেও জোড়া হতো (রহিম-রহিম), আর প্রতিটা জোড়া দুইবার আসত (রহিম-করিম, করিম-রহিম)। `<` দিলে প্রতিটা জোড়া একবার।

## একই ফোন নম্বর

একই নম্বর দুইজনের নামে থাকলে, সন্দেহজনক অ্যাকাউন্ট ধরতে:

```sql
SELECT a.id, a.name, b.id, b.name, a.phone
FROM customers a
JOIN customers b ON a.phone = b.phone AND a.id < b.id;
```

## একই গ্রাহকের পরপর অর্ডার

একজন গ্রাহকের কোন অর্ডারের পরে কোন অর্ডার, দুই তারিখ পাশাপাশি। `b` হলো `a`-র পরের যেকোনো অর্ডার:

```sql
SELECT a.customer_id, a.order_date AS আগে, b.order_date AS পরে
FROM orders a
JOIN orders b ON b.customer_id = a.customer_id AND b.order_date > a.order_date
WHERE a.customer_id = 21
ORDER BY a.order_date, b.order_date;
```

## স্কুলে: একই শাখার একই এলাকার সহপাঠী

```sql-school
SELECT a.name, b.name, a.hometown
FROM students a
JOIN students b ON a.class_id = b.class_id AND a.hometown = b.hometown AND a.id < b.id;
```

## নিজে চেষ্টা করুন

একই category-র দুই পণ্যের জোড়া, যেখানে প্রথমটার দাম দ্বিতীয়টার দ্বিগুণের বেশি।

```sql
SELECT a.name, a.price, b.name, b.price
FROM products a
JOIN products b ON a.category = b.category;
```
