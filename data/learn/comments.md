---
title: "Comment: query-তে নোট লেখা"
order: 35
summary: -- আর /* */ দিয়ে ব্যাখ্যা লেখা, আর কোনো লাইন সাময়িক বন্ধ রাখা।
---

comment হলো query-র ভেতরের এমন লেখা যা SQLite পড়েই না। কেন এই শর্ত, কী খুঁজছেন, তা পরে নিজের বা অন্যের জন্য লিখে রাখতে।

## এক লাইন: `--`

`--`-এর পর থেকে লাইনের শেষ পর্যন্ত comment:

```sql
-- যেসব পণ্য শিগগির শেষ হবে
SELECT name, stock
FROM products
WHERE stock < 10 -- ১০-এর কম
ORDER BY stock;
```

## কয়েক লাইন: `/* … */`

`/*` থেকে `*/` পর্যন্ত সব comment, কয়েক লাইন হলেও:

```sql
/*
  মাসিক রিপোর্ট
  শুধু paid অর্ডার ধরা হয়েছে
*/
SELECT substr(order_date, 1, 7) AS মাস, count(*) AS অর্ডার
FROM orders
WHERE status = 'paid'
GROUP BY মাস;
```

লাইনের মাঝেও বসানো যায়: `SELECT name /* , price */ FROM products`।

## কোনো অংশ সাময়িক বন্ধ রাখা

query ঠিক করার সময় কোনো শর্ত মুছে না ফেলে `--` দিয়ে বন্ধ রাখা খুব কাজের। নিচে দ্বিতীয় শর্তটা বন্ধ; সামনের `--` মুছে চালিয়ে পার্থক্য দেখুন:

```sql
SELECT name, category, price
FROM products
WHERE price > 500
  -- AND category = 'ইলেকট্রনিক্স'
ORDER BY price;
```

> লেখার ভেতরের `--` comment নয়: `'a--b'` একটা সাধারণ লেখা। SQLite উদ্ধৃতিচিহ্নের ভেতরের কিছুকে comment ধরে না।

## ভালো comment কেমন

query কী করে তা query নিজেই বলে। comment-এ লিখুন **কেন**: "বাতিল অর্ডার বাদ, কারণ সেগুলোর টাকা ফেরত দেওয়া হয়েছে" এমন কিছু, যা query দেখে বোঝা যায় না।

## এরপর কী

সব পাঠ শেষ! এখন [Challenge](/challenge/)-এ নিজেকে যাচাই করুন, বা [Playground](/)-এ নিজের মতো query লিখে খেলুন। যে পাঠে ফিরতে চান, [পাঠের তালিকা](/learn/) থেকে সরাসরি খুলুন।

```sql
-- শেষ query: আপনার জন্য
SELECT 'অভিনন্দন! 🎉' AS বার্তা;
```
