import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Cliente único do backend (server.js e rotas/ocorrencias.js). Configure SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY no .env do backend; o fallback com a URL e a chave anon públicas é a
// dívida técnica já listada no ROADMAP (Fase 0) e deve sair quando o .env estiver configurado.
const supabaseUrl = process.env.SUPABASE_URL || "https://qhughmeaxbyupuglpvud.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodWdobWVheGJ5dXB1Z2xwdnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjc4MzAsImV4cCI6MjA5NDYwMzgzMH0.lrvg087MamSPfBkhfwt0bkFuBtdZOVWO7lOq1OKrQg8";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
