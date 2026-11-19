---
title: "AND, OR, NOT: কয়েকটা শর্ত একসাথে"
order: 6
summary: দুই শর্তই, যেকোনো একটা, বা উল্টোটা: শর্ত জোড়া আর বন্ধনীর নিয়ম।
---

একটা শর্তে না কুলালে জোড়া লাগান:

| লিখুন | কখন সত্য |
| --- | --- |
| `A AND B` | দুটোই সত্য হলে |
| `A OR B` | অন্তত একটা সত্য হলে |
| `NOT A` | A মিথ্যা হলে |

```syntax
SELECT column1
FROM table_name
WHERE condition1 AND condition2 OR NOT condition3;
```

## AND: দুটোই মানতে হবে

`bkash`-এ টাকা দেওয়া হয়েছে **এবং** অর্ডার `paid`:

```sql
SELECT id, status, payment
FROM orders
WHERE status = 'paid' AND payment = 'bkash';
```

## OR: যেকোনো একটা

পোশাক **অথবা** বই:

```sql
SELECT name, category
FROM products
WHERE category = 'পোশাক' OR category = 'বই';
```

একই column-এ অনেকগুলো `OR` লাগলে `IN` লেখা ছোট আর পরিষ্কার: `category IN ('পোশাক', 'বই')`, দেখুন [IN পাঠ](/learn/in/)।

## NOT: উল্টো

যেসব অর্ডার বাতিল হয়নি:

```sql
SELECT id, status
FROM orders
WHERE NOT status = 'cancelled';
```

`status <> 'cancelled'` লিখলেও একই ফল। `NOT` বেশি কাজে লাগে `NOT IN`, `NOT LIKE`, `NOT BETWEEN`, `NOT EXISTS`-এর সাথে।

## বন্ধনী: কোনটা আগে

`AND` আগে হিসাব হয়, তারপর `OR`, ঠিক যেমন অঙ্কে গুণ আগে, যোগ পরে। তাই নিচের query-টা "পোশাক, অথবা (৫০০ টাকার কম দামের বই)" বোঝায়, যা হয়তো আপনি চাননি:

```sql
SELECT name, category, price
FROM products
WHERE category = 'পোশাক' OR category = 'বই' AND price < 500;
```

"৫০০ টাকার কম দামের পোশাক বা বই" চাইলে বন্ধনী দিন:

```sql
SELECT name, category, price
FROM products
WHERE (category = 'পোশাক' OR category = 'বই') AND price < 500;
```

> `AND` আর `OR` একসাথে লিখলে বন্ধনী দিন, নিয়ম মনে থাকলেও। পরে যে পড়বে (ভবিষ্যতের আপনিও) তার ভুল বোঝার সুযোগ থাকবে না।

## নিজে চেষ্টা করুন

ইলেকট্রনিক্স পণ্যের মধ্যে যেগুলো স্টকে আছে (`stock > 0`), সেগুলোর নাম আর স্টক দেখুন।

```sql
SELECT name, stock FROM products WHERE category = 'ইলেকট্রনিক্স';
```
