---
title: "IN: তালিকার যেকোনোটা"
order: 11
summary: অনেকগুলো OR-এর বদলে একটা ছোট তালিকা, আর NOT IN-এর NULL ফাঁদ।
---

`payment = 'bkash' OR payment = 'nagad' OR payment = 'card'` লেখার বদলে:

```syntax
SELECT column1 FROM table_name WHERE column1 IN (value1, value2, ...);
```

```sql
SELECT id, payment
FROM orders
WHERE payment IN ('bkash', 'nagad');
```

সংখ্যার তালিকাও চলে:

```sql
SELECT id, name FROM customers WHERE id IN (3, 7, 11);
```

## NOT IN: তালিকার কোনোটাই নয়

ক্যাশ বা কার্ড ছাড়া অন্য পদ্ধতিতে পরিশোধ:

```sql
SELECT id, payment
FROM orders
WHERE payment NOT IN ('cash', 'card');
```

## তালিকা আসতে পারে আরেকটা query থেকে

তালিকাটা হাতে না লিখে আরেকটা `SELECT` দিয়েও বানানো যায়। ঢাকা বিভাগের জেলাগুলোর গ্রাহক:

```sql
SELECT name, district_id
FROM customers
WHERE district_id IN (SELECT id FROM districts WHERE division = 'ঢাকা');
```

বন্ধনীর ভেতরের query আগে চলে, জেলার id-গুলোর তালিকা দেয়, তারপর বাইরের query সেই তালিকা দিয়ে ছাঁকে। বিস্তারিত [subquery পাঠে](/learn/subquery/)।

## NOT IN আর NULL: সাবধান

তালিকায় একটা NULL থাকলে `NOT IN` কোনো row দেয় না, কারণ "x কি অজানা মানটার সমান নয়?" এর উত্তর অজানা:

```sql
SELECT name FROM districts WHERE id NOT IN (1, 2, NULL);
```

subquery দিয়ে `NOT IN` লিখলে আর সেই column-এ NULL থাকলে এটাই ঘটে। নিরাপদ থাকতে subquery-তে `WHERE … IS NOT NULL` দিন, বা [NOT EXISTS](/learn/exists/) ব্যবহার করুন।

## নিজে চেষ্টা করুন

বই আর খাবার category-র সব পণ্যের নাম আর category দেখুন, `IN` দিয়ে।

```sql
SELECT name, category FROM products;
```
