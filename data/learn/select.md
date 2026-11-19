---
title: "SELECT: table থেকে ডেটা পড়া"
order: 2
summary: কোন table থেকে কোন কোন column দেখতে চান, তা বলা।
---

`SELECT` দিয়ে database থেকে ডেটা পড়া হয়। SQL-এ সবচেয়ে বেশি লেখা হয় এটাই। গঠন:

```syntax
SELECT column1, column2
FROM table_name;
```

`SELECT`-এর পরে বলুন **কোন column**, `FROM`-এর পরে **কোন table**।

## সব column: `*`

`*` মানে "সব column"। table-এ কী আছে, এক নজরে দেখতে কাজে লাগে।

```sql
SELECT * FROM products;
```

## শুধু দরকারি column

column-এর নামগুলো কমা দিয়ে লিখুন। যে ক্রমে লিখবেন, ফলে সেই ক্রমেই আসবে।

```sql
SELECT name, price FROM products;
```

ক্রম বদলে `price, name` লিখে চালিয়ে দেখুন।

> আসল কাজে `*` কম লেখাই ভালো। বড় table-এ অনেক column থাকে; যা লাগবে শুধু সেটুকু চাইলে query দ্রুত হয় আর ফল পড়তেও সহজ।

## হিসাব করা column

`SELECT`-এ শুধু column-এর নাম নয়, হিসাবও লেখা যায়। প্রতিটা row-এর জন্য আলাদা করে হিসাব হয়:

```sql
SELECT name, price, stock, price * stock
FROM products;
```

শেষ column-টা কোনো table-এ নেই, SQLite প্রতিটা পণ্যের দাম আর স্টক গুণ করে বানাল: ওই পণ্যের মোট মাল কত টাকার। column-টার নাম সুন্দর করতে `AS` লাগে, সেটা [AS পাঠে](/learn/alias/)।

## FROM ছাড়াও SELECT

কোনো table না লাগলে `FROM` ছাড়াই চলে, ছোট হিসাব যাচাই করতে কাজে লাগে:

```sql
SELECT 2 + 3, 'বাংলাদেশ';
```

## নিজে চেষ্টা করুন

`customers` table থেকে শুধু গ্রাহকের নাম (`name`) আর যোগ দেওয়ার তারিখ (`joined_at`) দেখুন।

```sql
SELECT name FROM customers;
```
