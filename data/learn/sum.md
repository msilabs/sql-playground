---
title: "SUM: যোগফল"
order: 19
summary: একটা column বা হিসাবের সব মান যোগ করা: মোট স্টক, মোট বিক্রি।
---

`sum` একটা column-এর সব মান যোগ করে একটা সংখ্যা দেয়।

```syntax
SELECT sum(column1) FROM table_name WHERE condition;
```

দোকানে মোট কয়টা জিনিস স্টকে আছে:

```sql
SELECT sum(stock) FROM products;
```

## হিসাবের যোগফল

`sum`-এর ভেতরে হিসাবও লেখা যায়; প্রতিটা row-এ আগে হিসাব হয়, তারপর সব যোগ। দোকানের পুরো স্টকের দাম কত টাকা:

```sql
SELECT sum(price * stock) AS মোট_মালের_দাম FROM products;
```

`order_items`-এ প্রতিটা লাইনের টাকা `quantity * unit_price`। সব অর্ডার মিলিয়ে মোট বিক্রি:

```sql
SELECT sum(quantity * unit_price) AS মোট_বিক্রি FROM order_items;
```

## WHERE দিয়ে বেছে যোগ

শুধু ১ নম্বর অর্ডারের মোট টাকা:

```sql
SELECT sum(quantity * unit_price) FROM order_items WHERE order_id = 1;
```

## কিছু না মিললে NULL

কোনো row না মিললে `sum` শূন্য নয়, NULL দেয়। শূন্য চাইলে `total()` (SQLite-এর নিজের) বা `coalesce(sum(…), 0)`:

```sql
SELECT sum(stock), total(stock), coalesce(sum(stock), 0)
FROM products
WHERE price > 100000;
```

NULL মানের ঘরগুলো `sum` বাদ দিয়ে হিসাব করে; একটা NULL থাকলে পুরো যোগফল NULL হয় না। `coalesce` নিয়ে আছে [NULL সামলানো](/learn/null-functions/) পাঠে।

## নিজে চেষ্টা করুন

ইলেকট্রনিক্স category-র পণ্যগুলোর মোট স্টক কত?

```sql
SELECT sum(stock) FROM products;
```
