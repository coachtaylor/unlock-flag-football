export const colors = {
  surface: {
    base: "#0D1117",
    raised: "#161C24",
    overlay: "#1E2530",
    elevated: "#2D3850",
    input: "#232C3D",
    muted: "rgba(255, 255, 255, 0.04)",
    pressed: "rgba(255, 255, 255, 0.08)",
  },
  text: {
    primary: "rgba(255, 255, 255, 0.92)",
    label: "rgba(255, 255, 255, 0.82)",
    secondary: "rgba(255, 255, 255, 0.72)",
    muted: "rgba(255, 255, 255, 0.52)",
    subtle: "rgba(255, 255, 255, 0.55)",
  },
  border: {
    subtle: "rgba(255, 255, 255, 0.06)",
    default: "rgba(255, 255, 255, 0.10)",
    card: "rgba(255, 255, 255, 0.14)",
    strong: "rgba(255, 255, 255, 0.20)",
  },
  orange: {
    400: "#F0B870",
    500: "#D48A30",
    600: "#5C3308",
    tint: "rgba(212, 138, 48, 0.12)",
    tintBorder: "rgba(212, 138, 48, 0.30)",
  },
  green: {
    400: "#4ADE80",
    600: "#16A34A",
    800: "#14532D",
    tint: "rgba(74, 222, 128, 0.12)",
  },
  blue: {
    400: "#60A5FA",
    600: "#2563EB",
    800: "#1E3A5F",
  },
  indigo: {
    400: "#818CF8",
    800: "#312E81",
  },
  error: "#EF4444",
  errorLight: "#FCA5A5",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 14,
  pill: 20,
  full: 9999,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
};
