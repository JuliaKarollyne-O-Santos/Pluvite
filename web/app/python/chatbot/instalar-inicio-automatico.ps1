# =====================================
# INÍCIO AUTOMÁTICO DO CHATBOT WHATSAPP (WINDOWS)
# Instalar:  powershell -ExecutionPolicy Bypass -File instalar-inicio-automatico.ps1
# Remover:   powershell -ExecutionPolicy Bypass -File instalar-inicio-automatico.ps1 -Remover
# Cria uma tarefa agendada que liga o chatbot, escondido, sempre que o usuário entra no Windows.
# =====================================
param([switch]$Remover)

$nomeTarefa = "Pluvite Chatbot WhatsApp"
$script = Join-Path $PSScriptRoot "iniciar-automatico.ps1"

if ($Remover) {
    Unregister-ScheduledTask -TaskName $nomeTarefa -Confirm:$false -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "name='node.exe'" |
        Where-Object { $_.CommandLine -like "*chatbot.js*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Get-CimInstance Win32_Process -Filter "name='powershell.exe'" |
        Where-Object { $_.CommandLine -like "*iniciar-automatico.ps1*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Host "Início automático removido e chatbot parado."
    exit 0
}

if (-not (Test-Path (Join-Path $PSScriptRoot ".env.chatbot"))) {
    Write-Warning "Falta chatbot\.env.chatbot (URL da API do Render e CHATBOT_TOKEN). Veja o README."
    exit 1
}

$acao = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $PSScriptRoot
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $nomeTarefa -Action $acao -Trigger $gatilho -Settings $config `
    -Description "Mantém o chatbot de alertas do Pluvite ligado (WhatsApp)." -Force | Out-Null
Start-ScheduledTask -TaskName $nomeTarefa

Write-Host "Pronto! O chatbot vai ligar sozinho sempre que você entrar no Windows."
Write-Host "Já foi iniciado agora. Log: $(Join-Path $PSScriptRoot 'logs\chatbot.log')"
