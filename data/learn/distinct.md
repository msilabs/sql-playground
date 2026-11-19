---
title: "DISTINCT: একই জিনিস একবার"
order: 3
summary: ফলে একই রকম row বারবার না দেখিয়ে একবার করে দেখানো।
---

`products` table-এ কোন কোন ধরনের (`category`) পণ্য আছে জানতে চাইলে শুধু `category` দেখলে একই নাম বারবার আসে:

```sql
SELECT category FROM products;
```

`SELECT`-এর ঠিক পরে `DISTINCT` লিখলে প্রতিটা আলাদা মান একবারই আসে:

```syntax
SELECT DISTINCT column1, column2
FROM table_name;
```

```sql
SELECT DISTINCT category FROM products;
```

## কয়েকটা column হলে

`DISTINCT` পুরো row দেখে বিচার করে, একটা column নয়। নিচে `division` আর `name` দুটো মিলে একই হলে তবেই বাদ পড়বে, তাই এখানে কিছুই বাদ পড়ে না (প্রতিটা জেলার নাম আলাদা):

```sql
SELECT DISTINCT division, name FROM districts;
```

শুধু `division` রাখলে আলাদা বিভাগগুলো পাবেন:

```sql
SELECT DISTINCT division FROM districts;
```

## কয়টা আলাদা মান: `COUNT(DISTINCT …)`

আলাদা মান কয়টা, শুধু সংখ্যাটা লাগলে:

```sql
SELECT count(DISTINCT payment) FROM orders;
```

`count` নিয়ে বিস্তারিত আছে [COUNT পাঠে](/learn/count/)।

> `DISTINCT` সব row তুলনা করে, তাই বড় table-এ ধীর হতে পারে। দরকার হলেই লিখুন, অভ্যাসবশে নয়।

## নিজে চেষ্টা করুন

অর্ডারে কোন কোন অবস্থা (`status`) আছে, প্রতিটা একবার করে দেখুন।

```sql
SELECT status FROM orders;
```
