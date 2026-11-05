// Sobe o site (Next) e o backend de rotas (Express) para o teste em campo pelo celular.
// Uso, na pasta web/:  npm run dev:celular            (HTTP; use com um túnel HTTPS — recomendado)
//                      npm run dev:celular -- --https (HTTPS com certificado autoassinado na rede Wi-Fi)
//                      npm run dev:celular -- --origem meu.tunel.dev   (outro serviço de túnel)
// Passo a passo completo em GUIA-TESTE-CAMPO-ROTAS.md (raiz do repositório).
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { networkInterfaces } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const PASTA_WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const comHttps = process.argv.includes('--https');

// Endereços IPv4 do computador na rede local (o celular precisa estar no mesmo Wi-Fi)
const ipsLocais = Object.values(networkInterfaces())
  .flat()
  .filter((rede) => rede && rede.family === 'IPv4' && !rede.internal)
  .map((rede) => rede.address);

// Domínios dos túneis gratuitos sugeridos no guia + IPs locais + os passados em --origem: o Next só
// serve os recursos de desenvolvimento para origens conhecidas (allowedDevOrigins em next.config.ts)
const origensExtras = process.argv.flatMap((arg, i) => (arg === '--origem' && process.argv[i + 1] ? [process.argv[i + 1]] : []));
const origensDev = ['*.lhr.life', '*.localhost.run', '*.trycloudflare.com', ...ipsLocais, ...origensExtras];

const ambiente = {
  ...process.env,
  PLUVITE_CELULAR: '1',
  PLUVITE_ORIGENS_DEV: origensDev.join(','),
  // Vazio = o front chama /api/rotas na mesma origem (repassado ao Express pelo next.config.ts)
  NEXT_PUBLIC_API_URL: '',
};

const binNext = createRequire(import.meta.url).resolve('next/dist/bin/next');
const argsNext = [binNext, 'dev', '--webpack', '-H', '0.0.0.0', ...(comHttps ? ['--experimental-https'] : [])];

const processos = [
  spawn(process.execPath, ['app/backend/server.js'], { cwd: PASTA_WEB, env: ambiente, stdio: 'inherit' }),
  spawn(process.execPath, argsNext, { cwd: PASTA_WEB, env: ambiente, stdio: 'inherit' }),
];

const encerrar = () => {
  for (const processo of processos) if (!processo.killed) processo.kill();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
for (const processo of processos) processo.on('exit', encerrar);

const protocolo = comHttps ? 'https' : 'http';
console.log(`
─────────────── TESTE EM CAMPO — PLUVITE ───────────────
Backend de rotas: http://localhost:3001   Site: ${protocolo}://localhost:3000
${comHttps
    ? `No celular (mesmo Wi-Fi), abra e aceite o aviso de certificado:
${ipsLocais.map((ip) => `  https://${ip}:3000/Rotas?registrar`).join('\n') || '  (nenhum IP de rede local encontrado)'}`
    : `O GPS do celular exige HTTPS. Em OUTRO terminal, abra um túnel (expõe o site enquanto estiver aberto):
  ssh -R 80:localhost:3000 nokey@localhost.run
e abra no celular o endereço https://… que ele mostrar, com /Rotas?registrar no final.`}
Para encerrar: Ctrl+C
────────────────────────────────────────────────────────`);
