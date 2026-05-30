# Unlock Flag Football

> A coaching toolkit for flag football — playbook diagrams, drills, and practice plans — built for a sport heading to the **2028 Olympics** with almost no training infrastructure.

Flag football is exploding, but coaches still run practices off paper and group texts. Unlock gives them a roster, a drill library, a drag-and-build **play diagram editor**, and structured practice plans in one place — built by someone who plays and coaches in the league.

📱 **React Native (Expo)** · coach MVP · shared Supabase backend with the web app

## Tech stack

- **Framework:** Expo SDK 54 · React Native 0.81 · React 19 · TypeScript (strict)
- **Routing:** Expo Router 6 (file-based, typed routes)
- **Styling:** NativeWind 4 (Tailwind for React Native) + design tokens
- **Backend:** Supabase — PostgreSQL, Auth, Row-Level Security
- **Auth/storage:** `expo-secure-store` (tokens), AsyncStorage (preferences)
- **Diagrams:** `react-native-svg`

## Features

- Email auth (login / signup)
- Team setup + roster management
- Drill library — create, edit, and browse drills
- **Play diagram editor** + renderer for drawing routes and formations
- Practice plan builder
- Benchmarks

## Project structure

```
app/              Expo Router routes
  (auth)/           login, signup
  (tabs)/           drills, practice, roster, home
  team-setup.tsx, settings.tsx, benchmarks/
components/        DiagramEditor, DiagramRenderer, DrillForm,
                  PlayerForm, PracticePlanForm, ui/
lib/              Supabase client + data access
constants/        Design tokens
docs/             Design, specs, handoffs
```

## Run it locally

```bash
npm install
# create a .env with your Supabase credentials:
#   EXPO_PUBLIC_SUPABASE_URL=...
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
npm run ios                # or: npm run android / npm run web
```

Requires the [Expo](https://expo.dev) toolchain.

---

Built by [Taylor Pangilinan](https://taylorp.me) — founder, PM, and IC.
