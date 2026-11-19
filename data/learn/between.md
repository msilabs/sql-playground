---
title: "BETWEEN: একটা সীমার ভেতরে"
order: 12
summary: দুই মানের মাঝে (দুই প্রান্তসহ): দাম, তারিখ বা যেকোনো ক্রম।
---

"৫০০ থেকে ১৫০০ টাকার মধ্যে" ধরনের শর্তে `BETWEEN`:

```syntax
SELECT column1 FROM table_name WHERE column1 BETWEEN value1 AND value2;
```

```sql
SELECT name, price
FROM products
WHERE price BETWEEN 500 AND 1500
ORDER BY price;
```

## দুই প্রান্তও ধরা হয়

`BETWEEN 500 AND 1500` আর `price >= 500 AND price <= 1500` হুবহু একই। ঠিক ৫০০ বা ঠিক ১৫০০ দামের পণ্যও আসবে।

```sql
SELECT name, price
FROM products
WHERE price >= 500 AND price <= 1500
ORDER BY price;
```

ছোট মানটা আগে লিখতে হয়। `BETWEEN 1500 AND 500` কোনো row দেয় না।

## তারিখের সীমা

তারিখ `'YYYY-MM-DD'` আকারে থাকলে লেখার ক্রম আর সময়ের ক্রম একই, তাই `BETWEEN` সরাসরি চলে। ২০২৫-এর মার্চ আর এপ্রিলের অর্ডার:

```sql
SELECT id, order_date, status
FROM orders
WHERE order_date BETWEEN '2025-03-01' AND '2025-04-30'
ORDER BY order_date;
```

> তারিখের সাথে সময়ও থাকলে (`'2025-04-30 18:20'`) শেষ দিনের অংশ বাদ পড়তে পারে, কারণ `'2025-04-30 18:20'` লেখাটা `'2025-04-30'`-এর চেয়ে বড়। তখন লিখুন `order_date < '2025-05-01'`।

## NOT BETWEEN

সীমার বাইরে, মানে খুব সস্তা বা খুব দামি:

```sql
SELECT name, price
FROM products
WHERE price NOT BETWEEN 300 AND 2500;
```

## নিজে চেষ্টা করুন

২০২৪ সালে (জানুয়ারি থেকে ডিসেম্বর) যোগ দেওয়া গ্রাহকদের নাম আর তারিখ দেখুন।

```sql
SELECT name, joined_at FROM customers;
```
