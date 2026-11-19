---
title: "CASE: শর্ত অনুযায়ী মান"
order: 33
summary: যদি এটা তাহলে ওটা: দামের শ্রেণি, বাংলা লেবেল, শর্তসহ গোনা।
---

`CASE` হলো SQL-এর "যদি-নাহলে"। প্রতিটা row-এ উপর থেকে শর্তগুলো দেখে, প্রথম যেটা সত্য তার মান দেয়; কোনোটাই না মিললে `ELSE`-এর মান (না দিলে NULL)।

```syntax
CASE
  WHEN condition1 THEN result1
  WHEN condition2 THEN result2
  ELSE result3
END
```

দাম দেখে পণ্যের শ্রেণি:

```sql
SELECT name, price,
  CASE
    WHEN price >= 2000 THEN 'দামি'
    WHEN price >= 500 THEN 'মাঝারি'
    ELSE 'সস্তা'
  END AS শ্রেণি
FROM products
ORDER BY price DESC;
```

৩০০০ টাকার পণ্য প্রথম শর্তেই মিলে যায়, তাই "মাঝারি" দেখা হয় না। ক্রমটা গুরুত্বপূর্ণ।

## একটা column-এর মান বদলে দেখানো

একটা column-কে কয়েকটা নির্দিষ্ট মানের সাথে মেলালে ছোট রূপ:

```sql
SELECT id,
  CASE status
    WHEN 'paid' THEN 'টাকা পেয়েছি'
    WHEN 'pending' THEN 'বাকি'
    WHEN 'cancelled' THEN 'বাতিল'
  END AS অবস্থা
FROM orders
LIMIT 10;
```

## শর্তসহ গোনা

`count`/`sum`-এর ভেতরে `CASE` দিয়ে এক query-তেই কয়েকটা আলাদা গোনা। প্রতিটা পরিশোধ পদ্ধতিতে কয়টা paid আর কয়টা বাকি:

```sql
SELECT payment,
  sum(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
  sum(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS বাকি
FROM orders
GROUP BY payment;
```

## ORDER BY-তে CASE

নিজের পছন্দের ক্রমে সাজানো: আগে বাকি, তারপর paid, শেষে বাতিল:

```sql
SELECT id, status
FROM orders
ORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'paid' THEN 2 ELSE 3 END, id
LIMIT 15;
```

## ছোট রূপ: IIF

দুই দিকের শর্ত হলে SQLite-এ `iif(শর্ত, হ্যাঁ হলে, না হলে)`:

```sql
SELECT name, stock, iif(stock = 0, 'শেষ', 'আছে') AS স্টক
FROM products;
```

## নিজে চেষ্টা করুন

স্কুলের বার্ষিক পরীক্ষার নম্বর দেখে গ্রেড দিন: ৮০+ হলে 'A+', ৭০+ 'A', ৬০+ 'A-', ৩৩+ 'পাস', নাহলে 'ফেল'।

```sql-school
SELECT student_id, subject_id, marks
FROM results
WHERE exam = 'বার্ষিক'
LIMIT 20;
```
