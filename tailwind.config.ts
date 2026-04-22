import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Neutral "ink" scale — slate-leaning but a touch warmer.
        ink: {
          50:  "#f7f8fa",
          100: "#eef0f4",
          200: "#dde1e9",
          300: "#bec4d2",
          400: "#8d94a7",
          500: "#636b82",
          600: "#4b5268",
          700: "#3b4154",
          800: "#2e3344",
          900: "#232736",
          950: "#15182233",
        },
        // Single accent for primary affordances.
        accent: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        status: {
          draft:        "#6b7280",
          experimental: "#3b82f6",
          candidate:    "#8b5cf6",
          approved:     "#10b981",
          deprecated:   "#f59e0b",
          archived:     "#64748b",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03)",
        pop:  "0 8px 24px -12px rgba(15, 23, 42, 0.18), 0 2px 6px -2px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
