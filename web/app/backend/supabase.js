import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Cliente único do backend (server.js e rotas/ocorrencias.js). Configure SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY no .env do backend; o fallback com a URL e a chave anon públicas é a
// dívida técnica já listada no ROADMAP (Fase 0) e deve sair quando o .env estiver configurado.
const supabaseUrl = process.env.SUPABASE_URL || "https://khjvlfzripxczosigtms.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "sb_publishable_2Klnd7SVpa55AqwwES6WCQ_6O294FjU";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
