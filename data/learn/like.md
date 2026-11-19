---
title: "LIKE: লেখার ভেতরে খোঁজা"
order: 10
summary: % আর _ দিয়ে লেখার শুরু, শেষ বা মাঝের অংশ মেলানো।
---

পুরো নাম না জেনে অংশ দিয়ে খুঁজতে `LIKE`। ধাঁচ (pattern) বানাতে দুইটা বিশেষ চিহ্ন:

| চিহ্ন | মানে |
| --- | --- |
| `%` | যেকোনো কিছু, যত অক্ষরই হোক (শূন্যও চলে) |
| `_` | ঠিক একটা যেকোনো অক্ষর |

```syntax
SELECT column1 FROM table_name WHERE column1 LIKE pattern;
```

## শেষে মেলানো

নামের শেষে "কুকার":

```sql
SELECT name FROM products WHERE name LIKE '%কুকার';
```

## শুরুতে মেলানো

যেসব নম্বর `017` দিয়ে শুরু:

```sql
SELECT name, phone FROM customers WHERE phone LIKE '017%';
```

## মাঝে কোথাও

নামের যেকোনো জায়গায় "ইসলাম":

```sql
SELECT name FROM customers WHERE name LIKE '%ইসলাম%';
```

## ঠিক কয়টা অক্ষর: `_`

`_` জায়গা ধরে রাখে, প্রতিটা `_` ঠিক একটা অক্ষর। মার্চ ২০২৫-এর অর্ডার, মানে তারিখ `2025-03-` দিয়ে শুরু আর তারপর ঠিক দুইটা অক্ষর:

```sql
SELECT id, order_date FROM orders WHERE order_date LIKE '2025-03-__';
```

## NOT LIKE

যেসব পণ্যের নামে "কুকার" নেই:

```sql
SELECT name FROM products WHERE name NOT LIKE '%কুকার%';
```

> SQLite-এ `LIKE` ইংরেজি অক্ষরের বড়-ছোট হাত আলাদা করে না: `'abc' LIKE 'ABC'` সত্য। বাংলায় বড়-ছোট হাত নেই, তাই সমস্যা নেই। বড়-ছোট হাত আলাদা করে খুঁজতে চাইলে `GLOB` আছে, তার চিহ্ন `*` আর `?`।

```sql
SELECT 'abc' LIKE 'ABC', 'abc' GLOB 'ABC', 'abc' GLOB 'a*';
```

## নিজে চেষ্টা করুন

যেসব গ্রাহকের নাম "আক্তার" দিয়ে শেষ, তাদের নাম দেখুন।

```sql
SELECT name FROM customers WHERE name LIKE '%';
```
