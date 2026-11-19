---
title: "NULL: ফাঁকা ঘর চেনা"
order: 9
summary: মান জানা নেই মানে NULL; একে = দিয়ে নয়, IS NULL দিয়ে খুঁজতে হয়।
---

কোনো ঘরে মান না থাকলে সেখানে থাকে **NULL**। NULL মানে শূন্য নয়, ফাঁকা লেখাও (`''`) নয়; মানে "জানা নেই"।

দোকানের একজন গ্রাহকের জেলা জানা নেই। ফলের table-এ তার `district_id` ঘরে NULL দেখাবে:

```sql
SELECT id, name, district_id FROM customers;
```

## `= NULL` কখনো কাজ করে না

"জানা নেই"-এর সাথে কোনো কিছুর তুলনা করলে উত্তরও "জানা নেই", সত্য নয়। তাই এই query কোনো row দেয় না:

```sql
SELECT name FROM customers WHERE district_id = NULL;
```

ঠিক উপায় `IS NULL`:

```syntax
SELECT column1 FROM table_name WHERE column1 IS NULL;
SELECT column1 FROM table_name WHERE column1 IS NOT NULL;
```

```sql
SELECT name FROM customers WHERE district_id IS NULL;
```

আর যাদের জেলা জানা আছে:

```sql
SELECT count(*) FROM customers WHERE district_id IS NOT NULL;
```

## NULL ছড়িয়ে পড়ে

হিসাবের ভেতরে একটা NULL থাকলে পুরো ফল NULL হয়ে যায়:

```sql
SELECT 5 + NULL, NULL * 0, 'ক' || NULL, NULL = NULL;
```

`NULL = NULL`-ও সত্য নয়, NULL! দুটো অজানা মান সমান কি না, তাও অজানা।

## কোথায় এটা মনে রাখতে হয়

- `WHERE x <> 5` লিখলে যেসব row-এ `x` NULL, সেগুলোও বাদ যায়। দরকার হলে লিখুন `WHERE x <> 5 OR x IS NULL`।
- `count(column)`, `sum`, `avg` NULL-গুলো বাদ দিয়ে হিসাব করে, দেখুন [COUNT](/learn/count/)।
- `LEFT JOIN`-এ মিল না পেলে অন্য দিকের ঘরে NULL বসে, দেখুন [LEFT JOIN](/learn/left-join/)।
- NULL-এর জায়গায় অন্য কিছু দেখাতে `IFNULL` আর `COALESCE`, দেখুন [NULL সামলানো](/learn/null-functions/)।

## নিজে চেষ্টা করুন

স্কুলের ডেটায় একজন শিক্ষার্থীর রোল (`roll`) নেই। তার নাম বের করুন।

```sql-school
SELECT name, roll FROM students;
```
