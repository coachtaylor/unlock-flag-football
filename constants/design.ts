export const colors = {
  surface: {
    base: "#08090B",
    raised: "#141417",
    overlay: "#1B1B20",
    elevated: "#2D3850",
    input: "#1B1B20",
    muted: "rgba(255, 255, 255, 0.04)",
    pressed: "rgba(255, 255, 255, 0.08)",
  },
  text: {
    primary: "#F4F4F2",
    label: "rgba(244, 244, 242, 0.82)",
    secondary: "#8A8A92",
    muted: "#5A5A62",
    subtle: "rgba(244, 244, 242, 0.55)",
    faint: "rgba(244, 244, 242, 0.14)",
    onBrand: "#0A0A0D",
  },
  border: {
    subtle: "rgba(255, 255, 255, 0.04)",
    default: "rgba(255, 255, 255, 0.08)",
    dashed: "rgba(255, 255, 255, 0.22)",
    card: "#1F1F25",
    strong: "#26262C",
  },
  orange: {
    400: "#FF8A4A",
    500: "#FF6A1A",
    600: "#B84200",
    tint: "rgba(255, 106, 26, 0.14)",
    tintBorder: "rgba(255, 106, 26, 0.30)",
    glow: "rgba(255, 106, 26, 0.35)",
  },
  lime: {
    400: "#C2FF3D",
    tint: "rgba(194, 255, 61, 0.12)",
  },
  green: {
    400: "#4ADE80",
    600: "#16A34A",
    800: "#14532D",
    tint: "rgba(74, 222, 128, 0.12)",
  },
  blue: {
    400: "#6EA8FF",
    600: "#2563EB",
    800: "#1E3A5F",
    // Tints match orange's 0.14 / 0.30 ratios so QB-vs-Non-QB blocks in the
    // benchmark step read at the same visual weight.
    tint: "rgba(110, 168, 255, 0.14)",
    tintBorder: "rgba(110, 168, 255, 0.30)",
  },
  indigo: {
    400: "#818CF8",
    800: "#312E81",
  },
  red: {
    semantic: "#FF4D4D",
  },
  amber: {
    400: "#FBBF24",
  },
  teal: {
    400: "#14B8A6",
  },
  fuchsia: {
    400: "#D946EF",
  },
  slate: {
    400: "#94A3B8",
  },
  category: {
    offense: "#FF6A1A",
    defense: "#FF4D4D",
    footwork: "#C2FF3D",
    routes: "#6EA8FF",
    neutral: "rgba(255, 255, 255, 0.08)",
  },
  team: {
    // 8-swatch palette for team identity (matches schema check constraint
    // and the Bold Create Team color picker). The first 4 alias the existing
    // brand/category colors so a team in those colors stays visually
    // consistent with the rest of the app.
    orange: "#FF6A1A",
    lime: "#C2FF3D",
    blue: "#6EA8FF",
    red: "#FF4D4D",
    violet: "#B89BFF",
    cyan: "#7DDFD2",
    pink: "#FF6A8B",
    gold: "#FFB347",
  },
  // 20-swatch palette for per-player identity avatars. Indexed by
  // `team_players.color_index` so every player on a team gets a unique
  // color (up to the palette size).
  //
  // Ordering is deliberate: consecutive slots are placed on opposite
  // sides of the color wheel so the first ~10 players (the common case)
  // land on maximally distinct hues. A naive warm→cool→warm sequence
  // gave us three near-yellows in a row (orange/amber/gold) which read
  // as duplicates at avatar size. The tier-2 swatches (slots 10–19)
  // fill in the gaps for larger rosters.
  //
  // Add more tokens here — DO NOT inline new hexes — if rosters ever
  // grow past 20.
  player: {
    palette: [
      // Tier 1 — maximally distinct hues for the first 10 players.
      "#FF6A1A", // 0 orange
      "#6EA8FF", // 1 blue
      "#C2FF3D", // 2 lime
      "#E85AC4", // 3 magenta
      "#7DDFD2", // 4 cyan
      "#FFC94A", // 5 gold
      "#B89BFF", // 6 violet
      "#FF4D4D", // 7 red
      "#7BFFB5", // 8 mint
      "#58C5FF", // 9 sky
      // Tier 2 — fill-ins for rosters past 10. Still spaced around the
      // wheel but lands adjacent to a tier-1 hue, so noticeably distinct
      // is harder once the team gets this big.
      "#FFB347", // 10 amber
      "#FF6A8B", // 11 pink
      "#5FE0A5", // 12 emerald
      "#9D8FFF", // 13 indigo
      "#FF8F66", // 14 coral
      "#5FE0C5", // 15 teal
      "#D7B3FF", // 16 lavender
      "#FFB39A", // 17 peach
      "#FF8FA8", // 18 rose
      "#E6CB99", // 19 sand
    ] as readonly string[],
  },
  scrim: "rgba(0, 0, 0, 0.5)",
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
  card: 18,
  input: 10,
  hero: 24,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

export const fontFamily = {
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemibold: "Inter_600SemiBold",
  sansBold: "Inter_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
  // Brand display face — used only by the logo wordmark (Anton).
  display: "Anton_400Regular",
} as const;

export const tracking = {
  tight: -0.4,
  loose: 1.5,
} as const;
