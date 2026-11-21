# =====================================
# CHATBOT WHATSAPP EM SEGUNDO PLANO
# Iniciado pela tarefa "Pluvite Chatbot WhatsApp" (instalar-inicio-automatico.ps1)
# ao entrar no Windows. Reinicia o chatbot se ele cair e grava tudo em logs\chatbot.log.
# =====================================
$ErrorActionPreference = "Continue"
$pasta = $PSScriptRoot
$pastaLogs = Join-Path $pasta "logs"
$arquivoLog = Join-Path $pastaLogs "chatbot.log"
New-Item -ItemType Directory -Force $pastaLogs | Out-Null

function Registrar([string]$texto) {
    Add-Content -Path $arquivoLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $texto" -Encoding UTF8
}

# Uma instância só: duas abririam a mesma sessão do WhatsApp e brigariam pela porta 3010
$criado = $false
$trava = New-Object System.Threading.Mutex($true, "Local\PluviteChatbotWhatsApp", [ref]$criado)
if (-not $criado) {
    Registrar "Outra instância do chatbot automático já está rodando; saindo."
    exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    Registrar "Node.js não encontrado no PATH. Instale o Node ou ajuste o PATH."
    exit 1
}

Set-Location $pasta
while ($true) {
    # Log muito grande (> 5 MB): guarda o anterior e começa outro
    if ((Test-Path $arquivoLog) -and (Get-Item $arquivoLog).Length -gt 5MB) {
        Move-Item $arquivoLog "$arquivoLog.anterior" -Force
    }
    Registrar "Iniciando chatbot..."
    # Via cmd para o log ficar em UTF-8 (o >> do PowerShell 5.1 grava em UTF-16)
    cmd /c "`"$node`" chatbot.js >> `"$arquivoLog`" 2>&1"
    Registrar "Chatbot encerrou (código $LASTEXITCODE). Reiniciando em 30 s..."
    Start-Sleep -Seconds 30
}
