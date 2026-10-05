// =====================================
// IMPORTAÇÕES
// =====================================
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { existsSync } = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

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

const client = new Client({
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

// =====================================
// QR CODE
// =====================================
client.on("qr", (qr) => {
  console.log("📲 Escaneie o QR Code abaixo:");
  qrcode.generate(qr, { small: true });
});

let encerrando = false;
let conectado = false;

// =====================================
// WHATSAPP CONECTADO
// =====================================
client.on("ready", () => {
  conectado = true;
  console.log("✅ Tudo certo! WhatsApp conectado.");
  console.log("Digite \"logout\" para desvincular e apagar a sessão local.");
});

// =====================================
// DESCONEXÃO
// =====================================
client.on("disconnected", (reason) => {
  console.log("⚠️ Desconectado:", reason);
});

client.on("auth_failure", (message) => {
  console.error("❌ Falha na autenticação do WhatsApp:", message);
});

async function encerrar(signal) {
  if (encerrando) return;
  encerrando = true;
  terminal.close();
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
  if (encerrando) return;
  if (!conectado) {
    console.log("O WhatsApp ainda não está conectado. Use Ctrl+C para parar sem apagar a sessão.");
    return;
  }

  encerrando = true;
  terminal.close();
  try {
    await client.logout();
    await client.destroy();
    console.log("✅ WhatsApp desvinculado e sessão local removida.");
  } catch (error) {
    console.error("❌ Não foi possível desvincular o WhatsApp:", error);
    process.exitCode = 1;
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
  process.exitCode = 1;
  terminal.close();
});

// =====================================
// FUNIL DE MENSAGENS (SOMENTE PRIVADO)
// =====================================
client.on("message", async (msg) => {
  try {
    // ❌ IGNORA QUALQUER COISA QUE NÃO SEJA CONVERSA PRIVADA
    if (!msg.from || msg.fromMe || msg.from.endsWith("@g.us")) return;

    const texto = (msg.body || "").trim().toLocaleLowerCase("pt-BR");

    // =====================================
    // MENSAGEM INICIAL
    // =====================================
    if (texto === "pluvite") {
      await client.sendMessage(
        msg.from,
        "Olá! 👋 Sou o assistente virtual do Pluvite.\n\n" +
          "O Pluvite ajuda a acompanhar alertas e ocorrências no Vale do Paraíba e Litoral Norte.\n\n" +
          "Em caso de emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros)."
      );
    }


  } catch (error) {
    console.error("❌ Erro no processamento da mensagem:", error);
  }
});
