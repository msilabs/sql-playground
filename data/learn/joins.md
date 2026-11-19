---
title: "JOIN কী, কেন লাগে"
order: 24
summary: ডেটা কেন কয়েকটা table-এ ভাগ থাকে, আর JOIN-এর রকমগুলো এক নজরে।
---

`orders` table-এ গ্রাহকের নাম নেই, আছে শুধু `customer_id`:

```sql
SELECT id, customer_id, order_date FROM orders LIMIT 5;
```

নাম আছে `customers` table-এ। কেন আলাদা? একজন গ্রাহক ৫টা অর্ডার দিলে প্রতিটা অর্ডারে নাম-ফোন আবার লিখলে একই তথ্য ৫ জায়গায় থাকত; ফোন বদলালে ৫ জায়গায় বদলাতে হতো, একটা ভুললেই গোলমাল। তাই তথ্য একবার এক জায়গায় রাখা হয়, আর অন্য table শুধু তার `id`-টা মনে রাখে।

- `customers.id` হলো **primary key**: প্রতিটা গ্রাহকের আলাদা পরিচয়।
- `orders.customer_id` হলো **foreign key**: অন্য table-এর একটা row-কে নির্দেশ করে।

উত্তর দেওয়ার সময় এই ভাগ করা টুকরোগুলো আবার জোড়া লাগাতে হয়। সেটাই **JOIN**।

```syntax
SELECT columns
FROM table1
JOIN table2 ON table1.column = table2.column;
```

`ON`-এর পরে বলুন কোন column-এ মিল খুঁজবে:

```sql
SELECT orders.id, customers.name, orders.order_date
FROM orders
JOIN customers ON customers.id = orders.customer_id
LIMIT 5;
```

> [Playground](/)-এ JOIN-ওয়ালা query চালিয়ে ডানের "JOIN" ট্যাবে দেখুন: দুই table পাশাপাশি, কোন row কোন row-এর সাথে মিলল তা লাইন টেনে দেখায়।

## JOIN-এর রকম

মিল না পাওয়া row নিয়ে কী করবে, তাতেই রকমের পার্থক্য:

| JOIN | কী রাখে | পাঠ |
| --- | --- | --- |
| `INNER JOIN` (বা শুধু `JOIN`) | শুধু যেসব row-এর দুই দিকেই মিল আছে | [INNER JOIN](/learn/inner-join/) |
| `LEFT JOIN` | বাঁয়ের সব row; মিল না পেলে ডান দিকে NULL | [LEFT JOIN](/learn/left-join/) |
| `RIGHT JOIN` | ডানের সব row; মিল না পেলে বাঁ দিকে NULL | [RIGHT JOIN](/learn/right-join/) |
| `FULL JOIN` | দুই দিকের সব row; মিল না পেলে অন্য দিকে NULL | [FULL JOIN](/learn/full-join/) |
| `CROSS JOIN` | প্রতিটা row প্রতিটা row-এর সাথে (শর্ত ছাড়া) | নিচে |

একই table নিজের সাথে জোড়া লাগালে তাকে বলে [self join](/learn/self-join/)।

## শর্ত ভুলে গেলে: CROSS JOIN

`ON` না দিলে প্রতিটা row প্রতিটা row-এর সাথে জোড়া লাগে। ১২টা জেলা আর ২০টা পণ্যে ১২ × ২০ = ২৪০টা row:

```sql
SELECT count(*) FROM districts CROSS JOIN products;
```

হাজার row-এর দুই table-এ এটা লাখ লাখ row হয়ে যায়। JOIN-এর ফলে হঠাৎ অনেক বেশি row এলে প্রথমে `ON` শর্ত দেখুন।

## নিজে চেষ্টা করুন

প্রতিটা গ্রাহকের নামের পাশে তার জেলার নাম দেখুন (`customers.district_id` = `districts.id`)।

```sql
SELECT customers.name, districts.name
FROM customers
JOIN districts ON districts.id = customers.district_id;
```
