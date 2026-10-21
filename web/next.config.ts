import type { NextConfig } from "next";
import path from "path";

// Teste em campo pelo celular (npm run dev:celular, ver GUIA-TESTE-CAMPO-ROTAS.md): o celular não
// alcança o localhost:3001 do computador, então /api/rotas passa pelo próprio Next (mesma origem e
// HTTPS do túnel) até o Express, e o servidor de desenvolvimento aceita os endereços do túnel e da
// rede local. Fora desse modo nada muda.
const modoCelular = process.env.PLUVITE_CELULAR === "1";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: {
    root: path.join(__dirname),
  },
  ...(modoCelular && {
    allowedDevOrigins: (process.env.PLUVITE_ORIGENS_DEV ?? "").split(",").filter(Boolean),
    rewrites: async () => [
      { source: "/api/rotas/:caminho*", destination: "http://localhost:3001/api/rotas/:caminho*" },
    ],
  }),
};

export default nextConfig;
