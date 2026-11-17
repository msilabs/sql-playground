/** সাইটের পরিচয়: SEO, Open Graph আর structured data এখান থেকে নেয় */
export const SITE = {
  name: "SQL Playground",
  origin: "https://msilabs.github.io",
  url: "https://msilabs.github.io/sql-playground/",
  /** Open Graph আর GitHub social preview একই ছবি (১২৮০×৬৪০); বানাতে `npm run og` */
  image: "https://msilabs.github.io/sql-playground/og.png",
  imageAlt: "SQL Playground: বাংলায় SQL শেখার জায়গা। query-র GROUP BY ধাপে row-গুলো রঙে রঙে দলে ভাগ হয়েছে।",
} as const;

export const SITE_TITLE = "SQL Playground: বাংলায় SQL শেখার জায়গা · msilabs";

export const SITE_DESCRIPTION =
  "ব্রাউজারেই আসল SQLite দিয়ে SQL শিখুন, কোনো install বা লগইন ছাড়া। বাংলায় ব্যাখ্যা, query ধাপে ধাপে কীভাবে চলে তার ছবি, JOIN-এর ছবি আর ১১টা মিশন।";

/** Google-কে জানায় এটা একটা বিনামূল্যের শেখার অ্যাপ (schema.org) */
export const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE.name,
  url: SITE.url,
  description: SITE_DESCRIPTION,
  image: SITE.image,
  inLanguage: "bn",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any (web browser)",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "BDT" },
  teaches: "SQL",
  author: { "@type": "Organization", name: "msilabs", url: "https://msilabs.github.io" },
  license: "https://opensource.org/licenses/MIT",
  codeRepository: "https://github.com/msilabs/sql-playground",
} as const;
