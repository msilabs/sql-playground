---
title: "LIMIT: প্রথম কয়েকটা row"
order: 8
summary: সেরা ৫টা, সবচেয়ে সস্তা ৩টা, বা পাতায় পাতায় ভাগ (OFFSET)।
---

হাজার row-এর মধ্যে প্রথম কয়েকটা লাগলে `LIMIT`:

```syntax
SELECT column1
FROM table_name
ORDER BY column1
LIMIT number;
```

সবচেয়ে দামি ৩টা পণ্য:

```sql
SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 3;
```

## LIMIT-এর সাথে প্রায় সবসময় ORDER BY

`ORDER BY` ছাড়া `LIMIT 3` মানে "যেকোনো ৩টা"। আজ যেটা আসছে কাল অন্যটা আসতে পারে। "সেরা", "সবচেয়ে নতুন", "সবচেয়ে কম" ধরনের প্রশ্নে আগে সাজান, তারপর কাটুন।

```sql
SELECT name, joined_at
FROM customers
ORDER BY joined_at DESC
LIMIT 5;
```

উপরেরটা সবচেয়ে নতুন ৫ জন গ্রাহক।

## বাদ দিয়ে নেওয়া: OFFSET

`OFFSET n` মানে প্রথম n-টা বাদ দিয়ে শুরু। পাতায় পাতায় দেখানোর (pagination) সময় লাগে: প্রতি পাতায় ৫টা হলে দ্বিতীয় পাতা হলো "৫টা বাদ দিয়ে পরের ৫টা"।

```sql
SELECT id, name
FROM customers
ORDER BY id
LIMIT 5 OFFSET 5;
```

`LIMIT 5, 5` লেখাও চলে (আগে OFFSET, পরে LIMIT), তবে উল্টো ক্রমের কারণে গোলমাল হয়; `OFFSET` লেখা পরিষ্কার।

## অন্য database-এ

| database | প্রথম ৩টা |
| --- | --- |
| SQLite, MySQL, PostgreSQL | `LIMIT 3` |
| SQL Server | `SELECT TOP 3 …` |
| Oracle, নতুন SQL Server | `FETCH FIRST 3 ROWS ONLY` |

## নিজে চেষ্টা করুন

সবচেয়ে সস্তা ২টা বই (`category = 'বই'`) কোনগুলো?

```sql
SELECT name, price FROM products WHERE category = 'বই';
```
