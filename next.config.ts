import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Контент (Markdown из Obsidian) читается с диска во время работы — добавляем его в сборку.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
