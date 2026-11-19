---
title: "RIGHT JOIN: ডানের সবাই থাকবে"
order: 27
summary: LEFT JOIN-এর আয়না: ডানের table-এর সব row রাখে, বাঁ দিকে NULL।
---

`RIGHT JOIN` ঠিক `LEFT JOIN`-এর উল্টো: **ডানের** (JOIN-এর পরের) table-এর প্রতিটা row থাকে, বাঁ দিকে মিল না পেলে NULL।

```syntax
SELECT t1.column, t2.column
FROM table1 t1
RIGHT JOIN table2 t2 ON t1.table2_id = t2.id;
```

অর্ডার বাঁয়ে, গ্রাহক ডানে। সব গ্রাহক আসবেন, যার অর্ডার নেই তার অর্ডারের ঘর NULL:

```sql
SELECT c.name, o.id AS অর্ডার
FROM orders o
RIGHT JOIN customers c ON c.id = o.customer_id
ORDER BY o.id;
```

NULL-গুলো ক্রমে আগে আসে, তাই যাদের অর্ডার নেই তারা উপরে।

## RIGHT JOIN = উল্টো LEFT JOIN

table দুইটার জায়গা বদলে LEFT JOIN লিখলে হুবহু একই ফল:

```sql
SELECT c.name, o.id AS অর্ডার
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
ORDER BY o.id;
```

তাই বাস্তবে বেশিরভাগ মানুষ সবসময় `LEFT JOIN` লেখে: "যে table-এর সবাইকে চাই, সেটা আগে"। পড়তে সহজ। `RIGHT JOIN` দরকার হয় তখন, যখন অনেকগুলো JOIN-এর লম্বা query-র শেষে আরেকটা table-এর সব row রাখতে হয় আর আগের অংশ বদলাতে চান না।

> SQLite ৩.৩৯ (২০২২) থেকে `RIGHT JOIN` আর `FULL JOIN` চালায়। পুরোনো SQLite-এ এগুলো নেই, তখন table উল্টে LEFT JOIN লিখতে হয়।

## কারা কখনো অর্ডার দেননি, RIGHT JOIN দিয়ে

```sql
SELECT c.name
FROM orders o
RIGHT JOIN customers c ON c.id = o.customer_id
WHERE o.id IS NULL;
```

## নিজে চেষ্টা করুন

`customers` বাঁয়ে আর `districts` ডানে রেখে RIGHT JOIN দিয়ে সব জেলা দেখুন, গ্রাহক না থাকলেও। প্রতিটা জেলার পাশে গ্রাহকের নাম।

```sql
SELECT d.name AS জেলা, c.name
FROM customers c
JOIN districts d ON d.id = c.district_id;
```
