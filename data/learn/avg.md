---
title: "AVG: গড়"
order: 20
summary: গড় দাম, গড় নম্বর; round() দিয়ে দশমিক ছোট করা।
---

`avg` একটা column-এর মানগুলোর গড় দেয়: যোগফল ÷ কয়টা।

```syntax
SELECT avg(column1) FROM table_name WHERE condition;
```

সব পণ্যের গড় দাম:

```sql
SELECT avg(price) FROM products;
```

## দশমিক ছোট করা: round

গড়ে প্রায়ই লম্বা দশমিক আসে। `round(মান, কয়ঘর)`:

```sql
SELECT avg(price), round(avg(price), 2), round(avg(price))
FROM products;
```

## category অনুযায়ী গড়

```sql
SELECT category, round(avg(price)) AS গড়_দাম
FROM products
GROUP BY category
ORDER BY গড়_দাম DESC;
```

`GROUP BY` নিয়ে বিস্তারিত [GROUP BY পাঠে](/learn/group-by/)।

## স্কুলের রেজাল্টে গড়

বার্ষিক পরীক্ষায় প্রতিটা বিষয়ের গড় নম্বর (`subject_id` দিয়ে):

```sql-school
SELECT subject_id, round(avg(marks), 1) AS গড়
FROM results
WHERE exam = 'বার্ষিক'
GROUP BY subject_id;
```

## NULL বাদ যায়

`avg` NULL ঘরগুলো গোনেই না। তিনটা মান ১০, ২০ আর NULL হলে গড় ১৫, ১০ নয়:

```sql
SELECT avg(x) FROM (SELECT 10 AS x UNION ALL SELECT 20 UNION ALL SELECT NULL);
```

NULL-কে শূন্য ধরে গড় চাইলে `avg(coalesce(x, 0))`।

## গড়ের চেয়ে বেশি?

"গড়ের চেয়ে দামি পণ্য" খুঁজতে `WHERE price > avg(price)` লেখা যায় না, কারণ `WHERE` চলে row ধরে ধরে, তখনো গড় হিসাব হয়নি। এখানে লাগে subquery:

```sql
SELECT name, price
FROM products
WHERE price > (SELECT avg(price) FROM products);
```

বিস্তারিত [subquery পাঠে](/learn/subquery/)।

## নিজে চেষ্টা করুন

প্রতিটা অর্ডারে গড়ে কয়টা করে জিনিস (`quantity`) কেনা হয়েছে?

```sql
SELECT quantity FROM order_items;
```
