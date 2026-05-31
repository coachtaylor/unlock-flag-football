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
        "surface-base": "#08090B",
        "surface-raised": "#141417",
        "surface-overlay": "#1B1B20",

        "text-primary": "#F4F4F2",
        "text-secondary": "#8A8A92",
        "text-muted": "#5A5A62",

        "border-subtle": "rgba(255, 255, 255, 0.04)",
        "border-default": "rgba(255, 255, 255, 0.08)",
        "border-card": "#1F1F25",
        "border-strong": "#26262C",

        "orange-400": "#FF8A4A",
        "orange-500": "#FF6A1A",
        "orange-600": "#B84200",

        "lime-400": "#C2FF3D",

        "green-400": "#4ADE80",
        "green-600": "#16A34A",
        "green-800": "#14532D",

        "blue-400": "#6EA8FF",
        "blue-600": "#2563EB",
        "blue-800": "#1E3A5F",

        "indigo-400": "#818CF8",
        "indigo-800": "#312E81",

        "red-semantic": "#FF4D4D",

        "category-offense": "#FF6A1A",
        "category-defense": "#FF4D4D",
        "category-footwork": "#C2FF3D",
        "category-routes": "#6EA8FF",

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
        "card": "18px",
        "input": "10px",
        "hero": "24px",
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-semibold": ["Inter_600SemiBold"],
        "sans-bold": ["Inter_700Bold"],
        mono: ["JetBrainsMono_500Medium"],
        "mono-bold": ["JetBrainsMono_700Bold"],
      },
      fontSize: {
        "micro": ["11px", { lineHeight: "14px", letterSpacing: "0.5px" }],
        "caption": ["13px", { lineHeight: "18px" }],
        "body": ["15px", { lineHeight: "22px" }],
        "heading": ["17px", { lineHeight: "24px" }],
        "title": ["20px", { lineHeight: "28px" }],
        "stat": ["28px", { lineHeight: "34px" }],
        "display": ["38px", { lineHeight: "42px" }],
      },
    },
  },
  plugins: [],
};
