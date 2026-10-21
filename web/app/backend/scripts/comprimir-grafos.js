// Gera as cópias comprimidas dos grafos para o deploy: Rotas/<cidade>_graph.json (fora do Git) →
// web/app/backend/grafos/<cidade>_graph.json.gz (versionadas). O Render só enxerga a pasta do backend
// (rootDir em render.yaml), e o gzip deixa os 38 grafos com ~14 MB em vez de ~80 MB.
// Rotas/gerar_grafos.py já grava a cópia comprimida; este script serve para refazer todas de uma vez.
//
// Uso (na pasta web/app/backend):  node scripts/comprimir-grafos.js
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { constants, gzipSync } from 'zlib';

const PASTA_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = process.env.ROTAS_DIR || path.resolve(PASTA_BACKEND, '../../../Rotas');
const DESTINO = path.join(PASTA_BACKEND, 'grafos');

const arquivos = readdirSync(ORIGEM).filter((nome) => nome.endsWith('_graph.json'));
if (arquivos.length === 0) {
  console.log(`Nenhum grafo *_graph.json em ${ORIGEM} — gere com: python Rotas/gerar_grafos.py`);
  process.exit(1);
}
mkdirSync(DESTINO, { recursive: true });

let bruto = 0;
let comprimido = 0;
for (const nome of arquivos) {
  const conteudo = readFileSync(path.join(ORIGEM, nome));
  // Sem data no cabeçalho (o Node grava 0): o mesmo grafo gera sempre o mesmo .gz, sem diff à toa no Git
  const gz = gzipSync(conteudo, { level: constants.Z_BEST_COMPRESSION });
  writeFileSync(path.join(DESTINO, `${nome}.gz`), gz);
  bruto += conteudo.length;
  comprimido += gz.length;
}
const mb = (bytes) => (bytes / 1048576).toFixed(1);
console.log(`${arquivos.length} grafos comprimidos em ${DESTINO}: ${mb(bruto)} MB → ${mb(comprimido)} MB`);
