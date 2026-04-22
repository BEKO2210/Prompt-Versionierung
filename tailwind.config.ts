import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5d9e2",
          300: "#b0b7c6",
          400: "#848ea5",
          500: "#616c87",
          600: "#4c556c",
          700: "#3e4658",
          800: "#353b4a",
          900: "#2f3440",
          950: "#1d2028",
        },
        status: {
          draft: "#6b7280",
          experimental: "#3b82f6",
          candidate: "#8b5cf6",
          approved: "#10b981",
          deprecated: "#f59e0b",
          archived: "#64748b",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
