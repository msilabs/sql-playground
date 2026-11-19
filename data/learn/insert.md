---
title: "INSERT: নতুন row যোগ করা"
order: 14
summary: table-এ এক বা একাধিক নতুন row ঢোকানো, id নিজে থেকে পাওয়া।
---

নতুন ডেটা ঢোকাতে `INSERT INTO`। কোন column-এ মান দিচ্ছেন, বন্ধনীতে বলে দিন, তারপর `VALUES`-এ একই ক্রমে মানগুলো:

```syntax
INSERT INTO table_name (column1, column2, column3)
VALUES (value1, value2, value3);
```

এখানের বাক্সগুলোয় দুইটা statement একসাথে: আগে `INSERT`, তারপর `SELECT` দিয়ে দেখা যে row-টা সত্যিই ঢুকেছে। ফলের উপরে দুই statement-এর আলাদা বোতাম আসবে।

```sql
INSERT INTO products (name, category, price, stock)
VALUES ('গামছা', 'পোশাক', 200, 50);

SELECT * FROM products WHERE category = 'পোশাক';
```

`id` দিইনি, তবু নতুন row-এ id এসেছে। `id INTEGER PRIMARY KEY` column খালি রাখলে SQLite নিজেই পরের নম্বরটা বসায়।

> এই বাক্সের বদল শুধু এই বাক্সেই থাকে। আবার চালালে আরেকটা গামছা যোগ হবে; **শুরু থেকে** চাপলে আবার আগের ডেটা।

## একসাথে কয়েকটা row

`VALUES`-এর পরে কমা দিয়ে কয়েকটা বন্ধনী:

```sql
INSERT INTO districts (name, division)
VALUES ('ফেনী', 'চট্টগ্রাম'),
       ('নোয়াখালী', 'চট্টগ্রাম'),
       ('টাঙ্গাইল', 'ঢাকা');

SELECT * FROM districts;
```

## column বাদ দিলে কী হয়

যে column-এর মান দেননি, সেখানে বসে তার `DEFAULT` মান, না থাকলে NULL। `products`-এর `stock`-এর default শূন্য:

```sql
INSERT INTO products (name, category, price)
VALUES ('খাতা', 'বই', 60);

SELECT * FROM products WHERE name = 'খাতা';
```

কিন্তু `NOT NULL` column (যেমন `price`) বাদ দিলে SQLite মানা করে দেয়। ভুলের বার্তাটা দেখুন:

```sql
INSERT INTO products (name, category) VALUES ('কলম', 'বই'); -- ভুল হবে
```

## column-এর নাম না লিখলে

`INSERT INTO products VALUES (…)` লিখলে table-এর **সব** column-এর মান, ঠিক table-এর ক্রমে দিতে হয়। পরে table-এ নতুন column যোগ হলে এমন query ভেঙে যায়, তাই column-এর নাম লিখে রাখাই ভালো অভ্যাস।

## নিজে চেষ্টা করুন

নিজের নামে একজন গ্রাহক যোগ করুন (ফোন `01712345678`, জেলা ১, আজকের তারিখ), তারপর দেখুন।

```sql
INSERT INTO customers (name, phone, district_id, joined_at)
VALUES ('আপনার নাম', '01712345678', 1, '2025-11-19');

SELECT * FROM customers ORDER BY id DESC LIMIT 3;
```
