import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Контент (Markdown из Obsidian) читается с диска во время работы — добавляем его в сборку.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
  // ssh2 (лаборатории) подгружает необязательные нативные модули — не собираем его в бандл.
  serverExternalPackages: ["ssh2"],
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
