import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = "https://khjvlfzripxczosigtms.supabase.co";
const supabaseKey = "sb_publishable_2Klnd7SVpa55AqwwES6WCQ_6O294FjU";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});