---
title: "MIN আর MAX: সবচেয়ে কম আর বেশি"
order: 21
summary: সবচেয়ে কম দাম, সবচেয়ে নতুন তারিখ; সংখ্যা, লেখা আর তারিখ সবেই চলে।
---

`min` দেয় সবচেয়ে ছোট মান, `max` সবচেয়ে বড়।

```syntax
SELECT min(column1), max(column1) FROM table_name;
```

```sql
SELECT min(price) AS সবচেয়ে_কম, max(price) AS সবচেয়ে_বেশি
FROM products;
```

## তারিখ আর লেখাতেও চলে

তারিখ `'YYYY-MM-DD'` আকারে থাকলে `min` প্রথম তারিখ, `max` শেষ তারিখ। প্রথম আর শেষ অর্ডার কবে:

```sql
SELECT min(order_date), max(order_date) FROM orders;
```

## কোন পণ্যটা সবচেয়ে দামি?

`max(price)` শুধু দামটা দেয়, কোন পণ্য তা নয়। পণ্যের নামসহ পেতে দুইটা উপায়:

```sql
SELECT name, price FROM products ORDER BY price DESC LIMIT 1;
```

```sql
SELECT name, price
FROM products
WHERE price = (SELECT max(price) FROM products);
```

দ্বিতীয়টা সমান দামের একাধিক পণ্য থাকলে সবগুলোই দেয়, প্রথমটা একটাই।

## প্রতিটা দলের সবচেয়ে বেশি

প্রতিটা category-র সবচেয়ে দামি পণ্যের দাম:

```sql
SELECT category, max(price)
FROM products
GROUP BY category;
```

## দুই মানের মধ্যে ছোটটা

`min(a, b)` আর `max(a, b)`, মানে দুই বা তার বেশি মান দিলে, এরা aggregate নয়: প্রতিটা row-এ দেওয়া মানগুলোর মধ্যে ছোট বা বড়টা দেয়। স্টক ১০-এর বেশি হলে ১০ দেখাও:

```sql
SELECT name, stock, min(stock, 10) AS দেখানো_স্টক FROM products;
```

## নিজে চেষ্টা করুন

খাবার category-তে সবচেয়ে সস্তা পণ্যের দাম কত?

```sql
SELECT min(price) FROM products;
```
