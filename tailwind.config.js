/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        "surface-base": "#0D1117",
        "surface-raised": "#161C24",
        "surface-overlay": "#1E2530",

        "text-primary": "rgba(255, 255, 255, 0.92)",
        "text-secondary": "rgba(255, 255, 255, 0.60)",
        "text-muted": "rgba(255, 255, 255, 0.35)",

        "border-subtle": "rgba(255, 255, 255, 0.06)",
        "border-default": "rgba(255, 255, 255, 0.10)",
        "border-strong": "rgba(255, 255, 255, 0.20)",

        "orange-400": "#F0B870",
        "orange-500": "#D48A30",
        "orange-600": "#5C3308",

        "green-400": "#4ADE80",
        "green-600": "#16A34A",
        "green-800": "#14532D",

        "blue-400": "#60A5FA",
        "blue-600": "#2563EB",
        "blue-800": "#1E3A5F",

        "indigo-400": "#818CF8",
        "indigo-800": "#312E81",

        "error": "#EF4444",
        "error-light": "#FCA5A5",
      },
      spacing: {
        "xs": "4px",
        "sm": "8px",
        "md": "12px",
        "lg": "16px",
        "xl": "20px",
        "2xl": "24px",
        "3xl": "32px",
      },
      borderRadius: {
        "sm": "6px",
        "md": "8px",
        "lg": "12px",
        "xl": "14px",
        "pill": "20px",
      },
      fontSize: {
        "micro": ["11px", { lineHeight: "14px", letterSpacing: "0.5px" }],
        "caption": ["13px", { lineHeight: "18px" }],
        "body": ["15px", { lineHeight: "22px" }],
        "heading": ["17px", { lineHeight: "24px" }],
        "title": ["20px", { lineHeight: "28px" }],
        "stat": ["28px", { lineHeight: "34px" }],
        "display": ["24px", { lineHeight: "30px" }],
      },
    },
  },
  plugins: [],
};
