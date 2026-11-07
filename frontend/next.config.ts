import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@paypal/paypal-server-sdk"],
  // Shared contracts live at the repo root (../shared); make that the
  // Turbopack project root so they can be imported from the frontend.
  turbopack: {
    root: "../",
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
