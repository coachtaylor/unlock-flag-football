import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 2000;
const chunkCountKey = (key: string) => `${key}__chunks`;

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    const countStr = await SecureStore.getItemAsync(chunkCountKey(key));
    if (countStr === null) {
      return SecureStore.getItemAsync(key);
    }
    const count = parseInt(countStr, 10);
    if (Number.isNaN(count) || count <= 0) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(`${key}__${i}`)
      )
    );
    if (chunks.some((c) => c === null)) return null;
    return chunks.join("");
  },
  setItem: async (key: string, value: string) => {
    const prevCountStr = await SecureStore.getItemAsync(chunkCountKey(key));
    if (prevCountStr !== null) {
      const prevCount = parseInt(prevCountStr, 10);
      if (!Number.isNaN(prevCount)) {
        await Promise.all(
          Array.from({ length: prevCount }, (_, i) =>
            SecureStore.deleteItemAsync(`${key}__${i}`)
          )
        );
      }
      await SecureStore.deleteItemAsync(chunkCountKey(key));
    }
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    await SecureStore.deleteItemAsync(key);
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.setItemAsync(
          `${key}__${i}`,
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        )
      )
    );
    await SecureStore.setItemAsync(chunkCountKey(key), String(count));
  },
  removeItem: async (key: string) => {
    const countStr = await SecureStore.getItemAsync(chunkCountKey(key));
    if (countStr !== null) {
      const count = parseInt(countStr, 10);
      if (!Number.isNaN(count)) {
        await Promise.all(
          Array.from({ length: count }, (_, i) =>
            SecureStore.deleteItemAsync(`${key}__${i}`)
          )
        );
      }
      await SecureStore.deleteItemAsync(chunkCountKey(key));
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
