---
title: "AS: column আর table-এর নতুন নাম"
order: 13
summary: ফলের column-কে পড়ার মতো নাম দেওয়া, আর লম্বা table-এর নাম ছোট করা।
---

`AS` দিয়ে কোনো কিছুকে query-র ভেতরে নতুন নাম (alias) দেওয়া যায়। আসল table বা column-এর নাম বদলায় না, শুধু এই query-তে।

## column-এর নাম

হিসাব করা column-এর নাম না দিলে ফলে হিসাবটাই নাম হয়ে বসে থাকে। `AS` দিয়ে সুন্দর নাম দিন:

```syntax
SELECT column1 AS new_name FROM table_name;
```

```sql
SELECT name AS পণ্য, price * stock AS মোট_দাম
FROM products;
```

নামে ফাঁকা জায়গা বা বিশেষ চিহ্ন থাকলে দ্বৈত উদ্ধৃতিতে রাখুন:

```sql
SELECT name, price * 1.15 AS "ভ্যাটসহ দাম"
FROM products;
```

> column-এর নামে দ্বৈত উদ্ধৃতি (`"…"`), লেখার মানে একক উদ্ধৃতি (`'…'`)। দুটো গুলিয়ে ফেলা SQL-এর সবচেয়ে সাধারণ ভুলের একটা।

`AS` শব্দটা বাদ দিলেও চলে (`price * stock মোট_দাম`), তবে লিখে রাখলে পড়তে সহজ।

## ORDER BY-তে নতুন নাম

`SELECT`-এ দেওয়া নাম `ORDER BY`-তে ব্যবহার করা যায়:

```sql
SELECT name, price * stock AS মোট_দাম
FROM products
ORDER BY মোট_দাম DESC
LIMIT 5;
```

## table-এর নাম

table-কে ছোট নাম দিলে লম্বা query, বিশেষ করে JOIN, অনেক পরিষ্কার হয়। `p.name` মানে `p` নামের table-এর `name` column:

```syntax
SELECT t.column1 FROM table_name AS t;
```

```sql
SELECT p.name, p.price
FROM products AS p
WHERE p.price > 2000;
```

দুই table জোড়া লাগালে, দুই জায়গায়ই `name` থাকলে কোনটা কার তা বোঝাতে এই ছোট নাম লাগে:

```sql
SELECT c.name, d.name AS জেলা
FROM customers c
JOIN districts d ON d.id = c.district_id;
```

JOIN নিয়ে বিস্তারিত [JOIN পাঠে](/learn/joins/)।

## নিজে চেষ্টা করুন

প্রতিটা অর্ডারের পণ্যের মোট টাকা (`quantity * unit_price`) দেখুন, column-এর নাম দিন `টাকা`।

```sql
SELECT order_id, quantity * unit_price FROM order_items;
```
