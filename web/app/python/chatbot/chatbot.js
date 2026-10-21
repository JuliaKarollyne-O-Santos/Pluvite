// =====================================
// IMPORTAÇÕES
// =====================================
const { existsSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const readline = require("node:readline");
const MUNICIPIOS = Object.keys(require("../municipios.json"));

// Usa o mesmo .env do backend de alertas (web/app/python/.env)
const arquivoEnv = path.join(__dirname, "..", ".env");
if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

// =====================================
// CANAL DESLIGADO OU DEPENDÊNCIAS AUSENTES
// No `npm run dev` o chatbot sobe junto com o site: aqui ele só avisa e sai
// com código 0, para não derrubar o Next, o Express e o Uvicorn.
// =====================================
const provedor = (process.env.WHATSAPP_PROVEDOR || "off").trim().toLowerCase();
if (provedor !== "qr") {
  console.log(`WhatsApp por QR desligado (WHATSAPP_PROVEDOR=${provedor}). Use "qr" no .env para ativar.`);
  process.exit(0);
}

let qrcode;
let Client;
let LocalAuth;
try {
  qrcode = require("qrcode-terminal");
  ({ Client, LocalAuth } = require("whatsapp-web.js"));
} catch {
  console.log("Dependências do chatbot ausentes. Rode: cd web/app/python/chatbot && npm install");
  process.exit(0);
}

// =====================================
// CONFIGURAÇÃO DO CLIENTE
// =====================================
const caminhosNavegador = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  process.env.ProgramW6432 &&
    path.join(process.env.ProgramW6432, "Google", "Chrome", "Application", "chrome.exe"),
  process.env.ProgramFiles &&
    path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
  process.env["ProgramFiles(x86)"] &&
    path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
  process.env.LOCALAPPDATA &&
    path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
].filter(Boolean);
const executavelNavegador = caminhosNavegador.find((caminho) => existsSync(caminho));

let encerrando = false;
let conectado = false;
let trocandoSessao = false;

// =====================================
// INSCRITOS NOS ALERTAS
// Quem manda "pluvite" no privado passa a receber os alertas.
// A lista sobrevive a reinícios (Ctrl+C) e é apagada no logout.
// =====================================
const ARQUIVO_INSCRITOS = path.join(__dirname, "inscritos.json");

function carregarInscritos() {
  try {
    if (!existsSync(ARQUIVO_INSCRITOS)) return new Map();
    const dados = JSON.parse(readFileSync(ARQUIVO_INSCRITOS, "utf-8"));
    if (Array.isArray(dados)) return new Map(dados.map((id) => [id, null]));
    return new Map(Object.entries(dados));
  } catch (error) {
    console.error("❌ Não foi possível ler inscritos.json, começando vazio:", error);
    return new Map();
  }
}

const inscritos = carregarInscritos();

function salvarInscritos() {
  writeFileSync(ARQUIVO_INSCRITOS, JSON.stringify(Object.fromEntries(inscritos), null, 2));
}

function limparInscritos() {
  inscritos.clear();
  rmSync(ARQUIVO_INSCRITOS, { force: true });
  console.log("🧹 Lista de inscritos nos alertas apagada.");
}

function mensagemEscolhaMunicipio() {
  return (
    "📍 Qual município você quer acompanhar? Responda com o nome de uma cidade:\n" +
    MUNICIPIOS.map((municipio) => `• ${municipio}`).join("\n") +
    "\n\nVocê começará a receber alertas após escolher a cidade. " +
    "Para parar, envie *SAIR*."
  );
}

async function avisarInscritosSemMunicipio() {
  for (const [destino, municipio] of inscritos) {
    if (municipio) continue;
    try {
      await client.sendMessage(destino, mensagemEscolhaMunicipio());
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Não foi possível pedir a cidade para ${destino}:`, error);
    }
  }
}

// =====================================
// CLIENTE DO WHATSAPP
// Criado por função para poder gerar um QR novo depois do logout.
// =====================================
function criarCliente() {
  const novoCliente = new Client({
    authStrategy: new LocalAuth({
      dataPath: process.env.PLUVITE_WWEBJS_AUTH_PATH
        ? path.resolve(process.env.PLUVITE_WWEBJS_AUTH_PATH)
        : path.join(__dirname, ".wwebjs_auth"),
    }),
    webVersionCache: {
      type: "local",
      path: path.join(__dirname, ".wwebjs_cache"),
    },
    puppeteer: {
      ...(executavelNavegador ? { executablePath: executavelNavegador } : {}),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  // QR CODE
  novoCliente.on("qr", (qr) => {
    console.log("📲 Escaneie o QR Code abaixo:");
    qrcode.generate(qr, { small: true });
  });

  // WHATSAPP CONECTADO
  novoCliente.on("ready", () => {
    conectado = true;
    console.log("✅ Tudo certo! WhatsApp conectado.");
    console.log(`📋 Inscritos nos alertas: ${inscritos.size}`);
    console.log("Digite \"logout\" para desvincular e apagar a sessão local e os inscritos.");
    void avisarInscritosSemMunicipio();
  });

  // DESCONEXÃO
  novoCliente.on("disconnected", (reason) => {
    conectado = false;
    console.log("⚠️ Desconectado:", reason);
    // Desvinculado pelo celular (Aparelhos conectados > Desconectar);
    // a própria biblioteca volta a mostrar um QR novo
    if (reason === "LOGOUT") limparInscritos();
  });

  novoCliente.on("auth_failure", (message) => {
    console.error("❌ Falha na autenticação do WhatsApp:", message);
  });

  novoCliente.on("message", (msg) => void tratarMensagem(msg));

  return novoCliente;
}

let client = criarCliente();

async function encerrar(signal) {
  if (encerrando) return;
  encerrando = true;
  terminal.close();
  servidorApi.close();
  console.log(`\nEncerrando o chatbot (${signal})...`);

  try {
    await client.destroy();
    console.log("✅ Navegador fechado com segurança. Pode iniciar o chatbot novamente.");
  } catch (error) {
    console.error("❌ Erro ao fechar o navegador do chatbot:", error);
    process.exitCode = 1;
  }
}

async function desvincular() {
  if (encerrando || trocandoSessao) return;
  if (!conectado) {
    console.log("O WhatsApp ainda não está conectado. Use Ctrl+C para parar sem apagar a sessão.");
    return;
  }

  trocandoSessao = true;
  conectado = false;
  try {
    await client.logout();
    await client.destroy();
    limparInscritos();
    console.log("✅ WhatsApp desvinculado e sessão local removida.");

    // Continua rodando e já mostra um QR novo para a próxima conexão
    client = criarCliente();
    await inicializar();
  } catch (error) {
    console.error("❌ Não foi possível desvincular o WhatsApp:", error);
  } finally {
    trocandoSessao = false;
  }
}

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

terminal.on("line", (linha) => {
  if (linha.trim().toLocaleLowerCase("pt-BR") === "logout") {
    void desvincular();
  }
});

terminal.on("SIGINT", () => void encerrar("Ctrl+C"));
process.once("SIGINT", () => void encerrar("Ctrl+C"));
process.once("SIGTERM", () => void encerrar("SIGTERM"));

// =====================================
// INICIALIZA
// =====================================
async function inicializar() {
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      await client.initialize();
      return;
    } catch (error) {
      const mensagemErro = error instanceof Error ? error.message : String(error);
      const contextoDestruido = mensagemErro.includes("Execution context was destroyed");
      if (!contextoDestruido || tentativa === 2) throw error;

      console.warn("⚠️ O WhatsApp recarregou durante a inicialização. Tentando novamente...");
      await client.destroy();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

inicializar().catch(async (error) => {
  console.error("❌ Não foi possível iniciar o WhatsApp:", error);
  console.error(
    "Verifique se o Chrome ou Edge está instalado. Se necessário, configure " +
      "PUPPETEER_EXECUTABLE_PATH com o caminho completo do executável."
  );
  try {
    await client.destroy();
  } catch (erroAoFechar) {
    console.error("❌ Erro ao fechar o navegador após a falha:", erroAoFechar);
  }
  // Sai com código 0: no `npm run dev` uma falha do WhatsApp não derruba o site
  terminal.close();
  servidorApi.close();
});

// =====================================
// API LOCAL DE ALERTAS (usada pelo backend Python)
// =====================================
const PORTA_API = Number(process.env.CHATBOT_PORTA || 3010);
const TOKEN_API = process.env.CHATBOT_TOKEN || "";
const URL_API_ALERTAS = `http://127.0.0.1:${process.env.API_PORT || 8000}`;

function responder(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

function formatarDataAlerta(data) {
  const instante = new Date(data);
  if (Number.isNaN(instante.getTime())) return "data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(instante);
}

async function responderUltimoAlertaOpenWeather(destino) {
  try {
    const resposta = await fetch(`${URL_API_ALERTAS}/api/alertas/ultimo-openweather`);
    const corpo = await resposta.json();
    if (!resposta.ok) {
      throw new Error(corpo.detail || `API de alertas respondeu ${resposta.status}`);
    }

    const alerta = corpo.alerta;
    if (!alerta) {
      await client.sendMessage(
        destino,
        "Ainda não há um alerta real do OpenWeather registrado. Alertas de teste e disparos manuais não entram nessa consulta."
      );
      return;
    }

    await client.sendMessage(
      destino,
      "📡 *Último alerta real do monitoramento OpenWeather* (sem simulação):\n\n" +
        `🚨 *${alerta.tipo} — ${alerta.municipio}*\n` +
        `Prioridade: ${alerta.prioridade}\n` +
        `Registrado pelo Pluvite: ${formatarDataAlerta(alerta.criado_em)}\n\n` +
        alerta.descricao
    );
  } catch (error) {
    console.error("❌ Não foi possível consultar o último alerta OpenWeather:", error);
    await client.sendMessage(
      destino,
      "Não consegui consultar o último alerta real do OpenWeather agora. Verifique se o backend de alertas está ativo e tente novamente."
    );
  }
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let bruto = "";
    req.on("data", (parte) => {
      bruto += parte;
      if (bruto.length > 64 * 1024) reject(new Error("Corpo muito grande"));
    });
    req.on("end", () => {
      try {
        resolve(bruto ? JSON.parse(bruto) : {});
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

const servidorApi = http.createServer(async (req, res) => {
  if (TOKEN_API && req.headers["x-pluvite-token"] !== TOKEN_API) {
    return responder(res, 401, { ok: false, erro: "Token inválido" });
  }

  if (req.method === "GET" && req.url === "/status") {
    return responder(res, 200, { ok: true, conectado, inscritos: inscritos.size });
  }

  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/inscritos") {
    const municipio = url.searchParams.get("municipio");
    const normalizar = (texto) =>
      texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const destinatarios = [...inscritos]
      .filter(([, cidade]) => !municipio || normalizar(cidade || "") === normalizar(municipio))
      .map(([destino]) => destino);
    return responder(res, 200, { ok: true, inscritos: destinatarios });
  }

  if (req.method !== "POST" || req.url !== "/enviar") {
    return responder(res, 404, { ok: false, erro: "Rota não encontrada" });
  }

  if (!conectado) {
    return responder(res, 503, { ok: false, erro: "WhatsApp ainda não conectado (escaneie o QR)" });
  }

  try {
    const { destino, numero, texto } = await lerCorpo(req);
    if (!texto || (!destino && !numero)) {
      return responder(res, 400, { ok: false, erro: "Informe destino (ou numero) e texto" });
    }

    let chatId = destino ? String(destino) : null;
    if (!chatId) {
      // Resolve o ID real do WhatsApp (trata o nono dígito dos celulares BR)
      const digitos = String(numero).replace(/\D/g, "");
      const contato = digitos ? await client.getNumberId(digitos) : null;
      if (!contato) {
        return responder(res, 404, { ok: false, erro: "Número sem WhatsApp", numero: digitos });
      }
      chatId = contato._serialized;
    }

    const mensagem = await client.sendMessage(chatId, String(texto));
    console.log(`📤 Alerta enviado para ${chatId}`);
    return responder(res, 200, { ok: true, destino: chatId, id: mensagem.id?._serialized });
  } catch (error) {
    console.error("❌ Erro ao enviar alerta pelo WhatsApp:", error);
    return responder(res, 500, { ok: false, erro: error instanceof Error ? error.message : String(error) });
  }
});

servidorApi.on("error", (error) => {
  console.error(`❌ API de alertas não subiu na porta ${PORTA_API}:`, error.message);
});

// Só escuta na própria máquina: o backend Python roda junto do chatbot
servidorApi.listen(PORTA_API, "127.0.0.1", () => {
  console.log(`📡 API de alertas em http://127.0.0.1:${PORTA_API} (POST /enviar, GET /inscritos)`);
});

// =====================================
// FUNIL DE MENSAGENS (SOMENTE PRIVADO)
// =====================================
async function tratarMensagem(msg) {
  try {
    // ❌ IGNORA QUALQUER COISA QUE NÃO SEJA CONVERSA PRIVADA
    if (!msg.from || msg.fromMe || msg.from.endsWith("@g.us")) return;

    const texto = (msg.body || "").trim().toLocaleLowerCase("pt-BR");
    const textoNormalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (
      /\b(ultimo|mais recente)\b/.test(textoNormalizado) &&
      /\b(alerta|aviso)\b/.test(textoNormalizado)
    ) {
      await responderUltimoAlertaOpenWeather(msg.from);
      return;
    }

    // =====================================
    // MENSAGEM INICIAL
    // =====================================
    if (texto === "pluvite") {
      if (inscritos.get(msg.from)) {
        await client.sendMessage(
          msg.from,
          `Você já recebe alertas para *${inscritos.get(msg.from)}*. ` +
            "Para trocar, envie *CIDADE*. Para parar, envie *SAIR*."
        );
        return;
      }

      inscritos.set(msg.from, null);
      salvarInscritos();
      console.log(`➕ Novo inscrito aguardando escolha de cidade (${inscritos.size} no total)`);
      await client.sendMessage(
        msg.from,
        "Olá! 👋 Sou o assistente virtual do Pluvite.\n\n" +
          "O Pluvite ajuda a acompanhar alertas e ocorrências no Vale do Paraíba e Litoral Norte.\n\n" +
          mensagemEscolhaMunicipio() +
          "\n\n" +
          "Em caso de emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."
      );
      return;
    }

    // =====================================
    // CANCELAR ALERTAS
    // =====================================
    if (texto === "sair" && inscritos.has(msg.from)) {
      inscritos.delete(msg.from);
      salvarInscritos();
      console.log(`➖ Inscrito saiu dos alertas (${inscritos.size} no total)`);
      await client.sendMessage(
        msg.from,
        "Pronto, você não vai mais receber os alertas do Pluvite. Envie *PLUVITE* para voltar."
      );
      return;
    }

    if ((texto === "cidade" || texto === "alterar cidade") && inscritos.has(msg.from)) {
      inscritos.set(msg.from, null);
      salvarInscritos();
      await client.sendMessage(
        msg.from,
        mensagemEscolhaMunicipio()
      );
      return;
    }

    if (inscritos.has(msg.from) && !inscritos.get(msg.from)) {
      const normalizar = (valor) =>
        valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const municipio = MUNICIPIOS.find((opcao) => normalizar(opcao) === normalizar(texto));
      if (!municipio) {
        await client.sendMessage(
          msg.from,
          "Não reconheci esse município. Responda com o nome de uma das cidades da lista."
        );
        return;
      }

      inscritos.set(msg.from, municipio);
      salvarInscritos();
      console.log(`✅ Inscrito configurado para ${municipio}`);
      await client.sendMessage(
        msg.from,
        `✅ Pronto! Você receberá alertas para *${municipio}*. Para trocar, envie *CIDADE*; para parar, envie *SAIR*.`
      );
    }
  } catch (error) {
    console.error("❌ Erro no processamento da mensagem:", error);
  }
}
