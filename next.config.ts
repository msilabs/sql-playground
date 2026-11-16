import type { NextConfig } from "next";

/**
 * সম্পূর্ণ স্ট্যাটিক সাইট (`out/` ফোল্ডারে)। GitHub Pages-এ সাইট থাকে
 * https://msilabs.github.io/sql-playground/-এ, তাই সেখানে BASE_PATH=/sql-playground দিয়ে build হয়।
 * worker আর WASM ফাইলের পথ বানাতে ব্রাউজারের কোডেও base লাগে, তাই NEXT_PUBLIC_BASE_PATH।
 */
const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
