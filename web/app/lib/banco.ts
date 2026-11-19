import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://khjvlfzripxczosigtms.supabase.co";
const supabaseKey = "sb_publishable_2Klnd7SVpa55AqwwES6WCQ_6O294FjU";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
  },
});

console.log("Supabase configurado com sucesso");