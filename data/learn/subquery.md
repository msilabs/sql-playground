---
title: "Subquery: query-র ভেতরে query"
order: 31
summary: ভেতরেরটা আগে চলে, তার ফল দিয়ে বাইরেরটা: একটা মান, একটা তালিকা বা একটা table।
---

বন্ধনীর ভেতরে লেখা `SELECT`-কে বলে subquery। ভেতরেরটা আগে চলে, বাইরের query তার ফল ব্যবহার করে। ফলের আকার অনুযায়ী তিন জায়গায় বসে।

## একটা মান: তুলনায়

ভেতরের query একটাই মান দিলে সেটা সাধারণ সংখ্যার মতো ব্যবহার করা যায়। গড় দামের চেয়ে দামি পণ্য:

```sql
SELECT name, price
FROM products
WHERE price > (SELECT avg(price) FROM products)
ORDER BY price DESC;
```

আগে `(SELECT avg(price) FROM products)` একটা সংখ্যা দিল, তারপর বাইরের query সেটার সাথে প্রতিটা দাম তুলনা করল।

## একটা তালিকা: IN-এর সাথে

ভেতরের query এক column, অনেক row দিলে `IN` দিয়ে ব্যবহার। ঢাকা জেলার গ্রাহকদের সব অর্ডার:

```sql
SELECT *
FROM orders
WHERE customer_id IN (SELECT id FROM customers WHERE district_id = 1);
```

## একটা table: FROM-এ

ভেতরের query-র পুরো ফলকে table ধরে তার ওপর আবার query। তখন একটা নাম দিতে হয়। প্রতিটা অর্ডারের মোট টাকা বের করে, তারপর সেই মোটগুলোর গড়:

```sql
SELECT round(avg(টাকা)) AS গড়_অর্ডার
FROM (
  SELECT order_id, sum(quantity * unit_price) AS টাকা
  FROM order_items
  GROUP BY order_id
) AS t;
```

aggregate-এর ওপর আবার aggregate (গড়ের গড়, সর্বোচ্চ যোগফল) লাগলে এই ধাঁচ।

## SELECT-এর ভেতরে

প্রতিটা পণ্যের পাশে সবচেয়ে দামি পণ্যের দাম থেকে কত কম:

```sql
SELECT name, price, (SELECT max(price) FROM products) - price AS পার্থক্য
FROM products;
```

## বাইরের row দেখে ভেতরেরটা (correlated)

ভেতরের query বাইরের row-এর মান ব্যবহার করলে প্রতিটা row-এর জন্য আবার চলে। প্রতিটা category-র মধ্যে নিজের category-র গড়ের চেয়ে দামি পণ্য:

```sql
SELECT p.name, p.category, p.price
FROM products p
WHERE p.price > (SELECT avg(price) FROM products WHERE category = p.category);
```

ভেতরের `p.category` বাইরের row-এর category। এই ধাঁচ বেশি লাগে [EXISTS](/learn/exists/)-এর সাথে।

## দ্বিতীয় সর্বোচ্চ

interview-তে প্রায়ই আসে। সবচেয়ে বেশিটার চেয়ে কম দামগুলোর মধ্যে সবচেয়ে বেশি:

```sql
SELECT max(price)
FROM products
WHERE price < (SELECT max(price) FROM products);
```

## নিজে চেষ্টা করুন

সবচেয়ে সস্তা পণ্যের নাম আর দাম, subquery দিয়ে (`ORDER BY … LIMIT 1` ছাড়া)।

```sql
SELECT name, price FROM products WHERE price = 0;
```
