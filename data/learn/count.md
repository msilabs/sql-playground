---
title: "COUNT: কয়টা আছে গোনা"
order: 18
summary: count(*), count(column) আর count(DISTINCT …): তিনটার পার্থক্য।
---

`count` অনেকগুলো row মিলিয়ে একটা উত্তর দেয়: কয়টা। এ ধরনের ফাংশনকে বলে **aggregate** ফাংশন (`count`, `sum`, `avg`, `min`, `max`)। এরা অনেক row থেকে একটা মান বানায়।

```syntax
SELECT count(*) FROM table_name WHERE condition;
```

মোট কয়টা অর্ডার:

```sql
SELECT count(*) FROM orders;
```

`WHERE` দিলে আগে ছাঁকা হয়, তারপর গোনা। কয়টা অর্ডারের টাকা দেওয়া হয়েছে:

```sql
SELECT count(*) FROM orders WHERE status = 'paid';
```

## তিন রকম count

| লিখুন | কী গোনে |
| --- | --- |
| `count(*)` | সব row |
| `count(column)` | যেসব row-এ ওই column NULL নয় |
| `count(DISTINCT column)` | ওই column-এর আলাদা আলাদা মান (NULL বাদে) |

একই table-এ তিনটা একসাথে:

```sql
SELECT count(*), count(district_id), count(DISTINCT district_id)
FROM customers;
```

প্রথমটা সব গ্রাহক; দ্বিতীয়টা একজন কম, কারণ একজনের জেলা NULL; তৃতীয়টা গ্রাহকেরা মোট কয়টা আলাদা জেলার।

## ফলের নাম দিন

`count(*)` নামটা ফলে সুন্দর দেখায় না, `AS` দিয়ে নাম দিন:

```sql
SELECT count(*) AS পণ্য_সংখ্যা FROM products WHERE stock > 0;
```

## প্রতিটা দলের জন্য আলাদা গোনা

"প্রতিটা category-তে কয়টা পণ্য" ধরনের প্রশ্নে `count`-এর সাথে `GROUP BY` লাগে:

```sql
SELECT category, count(*)
FROM products
GROUP BY category;
```

এটা বিস্তারিত আছে [GROUP BY পাঠে](/learn/group-by/)।

## নিজে চেষ্টা করুন

কয়টা অর্ডার `bkash`-এ পরিশোধ করা হয়েছে?

```sql
SELECT count(*) FROM orders;
```
