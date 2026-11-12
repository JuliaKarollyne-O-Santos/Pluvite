// CONFIGURAÇÃO DO APP
//
// No emulador Android, 10.0.2.2 aponta para o computador que executa os backends.
// Em aparelho físico, troque pelo IP local da máquina na rede Wi-Fi (ex.: 192.168.0.10)
// ou pela URL publicada (Render), e libere as portas no firewall.

/** Backend Python de alertas (web/app/python/backend) — alertas, WebSocket e push FCM */
export const API_ALERTAS = "http://10.0.2.2:8000";

/** Backend Express (web/app/backend) — rotas seguras, ocorrências no mapa e trânsito */
export const API_ROTAS = "http://10.0.2.2:3001";

/**
 * Número do WhatsApp que envia os alertas (chatbot web/app/python/chatbot), só dígitos com DDI.
 * Mesmo valor de NEXT_PUBLIC_WHATSAPP_ALERTAS no site.
 */
export const WHATSAPP_ALERTAS = "5512997456049";

/**
 * Endereço para onde o Supabase devolve o login social (Google/Facebook).
 * Precisa estar em Supabase → Authentication → URL Configuration → Redirect URLs
 * e no intent-filter do AndroidManifest.xml (scheme "pluvite", host "auth").
 */
export const REDIRECT_LOGIN_SOCIAL = "pluvite://auth";
