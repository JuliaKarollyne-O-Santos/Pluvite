import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = "https://qhughmeaxbyupuglpvud.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodWdobWVheGJ5dXB1Z2xwdnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjc4MzAsImV4cCI6MjA5NDYwMzgzMH0.lrvg087MamSPfBkhfwt0bkFuBtdZOVWO7lOq1OKrQg8";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});