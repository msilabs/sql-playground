---
title: "ORDER BY: ফল সাজানো"
order: 7
summary: ছোট থেকে বড় (ASC) বা বড় থেকে ছোট (DESC), এক বা একাধিক column দিয়ে।
---

`ORDER BY` না দিলে row কোন ক্রমে আসবে তার কোনো নিশ্চয়তা নেই। নির্দিষ্ট ক্রম চাইলে বলে দিতে হয়।

```syntax
SELECT column1, column2
FROM table_name
ORDER BY column1 ASC, column2 DESC;
```

## ছোট থেকে বড়: ASC

কম দাম থেকে বেশি দাম। `ASC` না লিখলেও এটাই ধরা হয়:

```sql
SELECT name, price
FROM products
ORDER BY price;
```

## বড় থেকে ছোট: DESC

```sql
SELECT name, price
FROM products
ORDER BY price DESC;
```

## কয়েকটা column দিয়ে

প্রথম column সমান হলে দ্বিতীয়টা দেখে সাজায়। আগে category অনুযায়ী, একই category-র ভেতরে দামি আগে:

```sql
SELECT category, name, price
FROM products
ORDER BY category, price DESC;
```

প্রতিটা column-এর পাশে আলাদা করে `ASC`/`DESC` বসে। এখানে `category` ছোট থেকে বড়, `price` বড় থেকে ছোট।

## লেখা আর তারিখ সাজানো

লেখা সাজায় অক্ষরের ক্রমে। তারিখ `'2025-03-15'` আকারে (বছর-মাস-দিন) রাখা থাকলে লেখা হিসেবে সাজালেও ঠিক ক্রম আসে, তাই এভাবে রাখাই নিয়ম।

```sql
SELECT name, joined_at
FROM customers
ORDER BY joined_at DESC;
```

## WHERE-এর সাথে

ক্রম মনে রাখুন: আগে `WHERE`, তারপর `ORDER BY`।

```sql
SELECT name, price
FROM products
WHERE category = 'খাবার'
ORDER BY price DESC;
```

## হিসাব দিয়ে সাজানো

column-এর নাম ছাড়াও হিসাব দিয়ে সাজানো যায়। স্টকের মোট দাম অনুযায়ী:

```sql
SELECT name, price * stock
FROM products
ORDER BY price * stock DESC;
```

> `ORDER BY 2` মানে SELECT-এর দ্বিতীয় column দিয়ে সাজাও। ছোট query-তে কাজ চলে, কিন্তু পরে column বদলালে ক্রম চুপচাপ ভুল হয়ে যায়। নাম লেখাই নিরাপদ।

## নিজে চেষ্টা করুন

সব গ্রাহকের নাম আর জেলা নম্বর (`district_id`) দেখুন, জেলা নম্বর অনুযায়ী সাজিয়ে, একই জেলার ভেতরে নামের ক্রমে।

```sql
SELECT name, district_id FROM customers;
```
