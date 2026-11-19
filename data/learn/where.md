---
title: "WHERE: শর্ত দিয়ে row ছাঁকা"
order: 4
summary: সব row নয়, শুধু যেগুলো শর্ত মানে সেগুলো রাখা।
---

`WHERE`-এর পরে একটা শর্ত লিখুন। SQLite প্রতিটা row-এ শর্তটা যাচাই করে, যেগুলোয় সত্য শুধু সেগুলো রাখে।

```syntax
SELECT column1, column2
FROM table_name
WHERE condition;
```

১০০০ টাকার বেশি দামের পণ্য:

```sql
SELECT name, price
FROM products
WHERE price > 1000;
```

## লেখা দিয়ে মেলানো

লেখা (text) সবসময় একক উদ্ধৃতিতে: `'ঢাকা'`। সমান বোঝাতে SQL-এ একটা `=`, প্রোগ্রামিং ভাষার মতো `==` নয় (SQLite অবশ্য `==`-ও বোঝে)।

```sql
SELECT name, division
FROM districts
WHERE division = 'চট্টগ্রাম';
```

> দ্বৈত উদ্ধৃতি (`"ঢাকা"`) দিলে SQL সেটাকে column-এর নাম ভাবে। `no such column` ভুল এলে প্রথমে উদ্ধৃতিচিহ্ন দেখুন।

## সংখ্যা দিয়ে মেলানো

সংখ্যার চারপাশে উদ্ধৃতি লাগে না। স্টকে নেই এমন পণ্য:

```sql
SELECT name, stock
FROM products
WHERE stock = 0;
```

## যেসব তুলনা লেখা যায়

| লিখুন | মানে |
| --- | --- |
| `=` | সমান |
| `<>` বা `!=` | সমান নয় |
| `>` / `<` | বড় / ছোট |
| `>=` / `<=` | বড় বা সমান / ছোট বা সমান |
| `BETWEEN … AND …` | একটা সীমার ভেতরে ([পাঠ](/learn/between/)) |
| `LIKE` | লেখার ধাঁচ মেলানো ([পাঠ](/learn/like/)) |
| `IN (…)` | তালিকার যেকোনোটা ([পাঠ](/learn/in/)) |

কয়েকটা শর্ত একসাথে লাগলে `AND`, `OR`, `NOT`, সেগুলো [আলাদা পাঠে](/learn/and-or-not/)।

## WHERE শুধু SELECT-এ নয়

`UPDATE` আর `DELETE`-এও `WHERE` দিয়ে বলা হয় কোন row বদলাবে বা মুছবে। সেখানে `WHERE` ভুলে গেলে পুরো table বদলে যায়, তাই অভ্যাসটা এখান থেকেই পাকা করুন।

## নিজে চেষ্টা করুন

যেসব অর্ডারের টাকা দেওয়া হয়নি (`status` হলো `'pending'`), সেগুলোর সব column দেখুন।

```sql
SELECT * FROM orders WHERE status = 'paid';
```
