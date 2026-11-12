"use client";

/**
 * Botão de ajuda do WhatsApp (tela inicial e navbar2).
 *
 * Ao clicar, mostra como se inscrever nos alertas pelo chatbot
 * (web/app/python/chatbot/chatbot.js) e abre a conversa com o número que
 * envia os alertas, já com "pluvite" escrito. Na tela inicial é verde, pisca com
 * anéis e tem um balão "Em uma emergência, toque aqui!"; na navbar2 é vermelho. Se o município do cidadão logado estiver em
 * alerta, as instruções mostram um aviso.
 *
 * O número vem de NEXT_PUBLIC_WHATSAPP_ALERTAS (só dígitos, com DDI: 5512999999999).
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { supabase } from "@/app/lib/banco";
import { MUNICIPIOS, normalizar } from "@/app/lib/constantes";
import { buscarUltimoAlerta, EVENTO_ALERTA_RECEBIDO, type Alerta } from "@/app/lib/alertas";

const NUMERO_WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_ALERTAS ?? "").replace(/\D/g, "");
const LINK_WHATSAPP = NUMERO_WHATSAPP
  ? `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent("pluvite")}`
  : "";
/** Mesma validade do AlertaPopup */
const VALIDADE_HORAS = 6;
const ATUALIZAR_MS = 60_000;
/** Ritmo lento do ícone da tela inicial; os anéis usam .anel-whatsapp (globals.css, 2,6s) */
const ATRASO_SEGUNDO_ANEL = "1.3s";
const DURACAO_PISCAR = "3s";

const PASSOS = [
  { titulo: "Abra a conversa", texto: 'Toque em "Abrir WhatsApp" abaixo.' },
  { titulo: "Envie PLUVITE", texto: "A palavra já vem escrita. É só enviar a mensagem." },
  { titulo: "Responda com sua cidade", texto: "Digite o nome do município que quer acompanhar." },
  { titulo: "Pronto!", texto: "Você vai receber os alertas de risco da sua cidade por lá." },
];

function emAlertaAtivo(alerta: Alerta | null): boolean {
  if (!alerta || alerta.prioridade === "Zona Segura") return false;
  const criadoEm = new Date(alerta.criado_em).getTime();
  if (Number.isNaN(criadoEm)) return true;
  return Date.now() - criadoEm < VALIDADE_HORAS * 60 * 60 * 1000;
}

function IconeWhatsApp({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/** Município de alertas do cidadão logado e se ele está em alerta agora. */
function useAlertaMunicipio() {
  const [municipio, setMunicipio] = useState<string | null>(null);
  const [emAlerta, setEmAlerta] = useState(false);

  // CARREGAMENTO DO MUNICÍPIO (mesma regra do AlertaPopup: municipio_alertas, senão cidade)
  useEffect(() => {
    let ativo = true;

    async function carregarMunicipio(authId: string | null) {
      if (!authId) {
        if (ativo) setMunicipio(null);
        return;
      }
      const { data, error } = await supabase
        .from("cidadao")
        .select("municipio_alertas, cidade")
        .eq("auth_id", authId)
        .maybeSingle();
      if (error) {
        console.error("Erro ao carregar município para o botão do WhatsApp:", error);
        return;
      }
      const informado = data?.municipio_alertas || data?.cidade || "";
      const encontrado = MUNICIPIOS.find((nome) => normalizar(nome) === normalizar(informado)) ?? null;
      if (ativo) setMunicipio(encontrado);
    }

    supabase.auth.getUser().then(({ data }) => carregarMunicipio(data.user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      window.setTimeout(() => void carregarMunicipio(sessao?.user.id ?? null), 0);
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  // VERIFICAÇÃO DO ÚLTIMO ALERTA (periódica + evento em tempo real do AlertaPopup)
  useEffect(() => {
    if (!municipio) return;
    let ativo = true;

    const verificar = () => {
      buscarUltimoAlerta(municipio)
        .then((ultimo) => ativo && setEmAlerta(emAlertaAtivo(ultimo)))
        .catch(() => {
          /* API de alertas fora do ar: mantém o estado atual */
        });
    };

    const aoReceberAlerta = (evento: Event) => {
      const alerta = (evento as CustomEvent<Alerta>).detail;
      if (alerta && normalizar(alerta.municipio) === normalizar(municipio)) {
        setEmAlerta(emAlertaAtivo(alerta));
      }
    };

    verificar();
    const intervalo = window.setInterval(verificar, ATUALIZAR_MS);
    window.addEventListener(EVENTO_ALERTA_RECEBIDO, aoReceberAlerta);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      window.removeEventListener(EVENTO_ALERTA_RECEBIDO, aoReceberAlerta);
    };
  }, [municipio]);

  // Sem município (deslogado ou sem cidade no perfil), nunca está em alerta
  return { municipio, emAlerta: Boolean(municipio) && emAlerta };
}

export default function BotaoAjudaWhatsApp({
  variante,
  className,
}: {
  /** "destaque" = botão grande da tela inicial; "navbar" = dentro da navbar2 */
  variante: "destaque" | "navbar";
  /** Posicionamento do botão "destaque" (absolute/fixed), definido por quem usa */
  className?: string;
}) {
  const { municipio, emAlerta } = useAlertaMunicipio();
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);

  // FECHA COM ESC
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, fechar]);

  const destaque = variante === "destaque";
  // Anéis vazados (só a borda)
  const corAnel = "border-2 border-[#25D366]/60";
  const rotulo = emAlerta
    ? `${municipio} está em alerta — receba os avisos pelo WhatsApp`
    : "Ajuda: receber alertas pelo WhatsApp";

  const botao = (
    <button
      type="button"
      onClick={() => setAberto(true)}
      aria-label={rotulo}
      title={rotulo}
      className={`relative flex items-center justify-center rounded-full text-white shadow-lg transition-colors duration-200 active:scale-95 cursor-pointer
        ${destaque
          ? "w-20 h-20 shrink-0 bg-[#25D366] hover:bg-[#0fa84a]"
          : "w-10 h-10 ring-2 ring-white/30 bg-red-600 hover:bg-red-700"}`}
    >
      {/* ANÉIS PISCANDO (só na tela inicial) */}
      {destaque && (
        <>
          <span className={`anel-whatsapp pointer-events-none absolute inset-0 rounded-full ${corAnel}`} />
          <span
            className={`anel-whatsapp pointer-events-none absolute inset-0 rounded-full ${corAnel}`}
            style={{ animationDelay: ATRASO_SEGUNDO_ANEL }}
          />
        </>
      )}
      <span
        className={`relative ${destaque ? "animate-pulse" : ""}`}
        style={destaque ? { animationDuration: DURACAO_PISCAR } : undefined}
      >
        {/* Ícone com ~55% do diâmetro do círculo */}
        <IconeWhatsApp size={destaque ? 44 : 20} />
      </span>
    </button>
  );

  return (
    <>
      {destaque ? (
        // O posicionamento (className) fica no contêiner, para o balão acompanhar o botão
        <div className={className || "relative"}>
          {botao}

          {/* BALÃO DE FALA — à esquerda do botão no celular, acima dele em telas largas */}
          <button
            type="button"
            onClick={() => setAberto(true)}
            tabIndex={-1}
            aria-hidden="true"
            className="absolute right-full top-1/2 mr-4 -translate-y-1/2 w-max max-w-[11rem]
              xl:right-auto xl:top-auto xl:mr-0 xl:translate-y-0 xl:bottom-full xl:left-1/2 xl:-translate-x-1/2 xl:mb-6
              rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-left text-sm font-semibold leading-snug
              tracking-normal text-slate-800 shadow-lg cursor-pointer"
          >
            Em uma emergência, <span className="text-[#0fa84a]">toque aqui!</span>
            {/* Ponta do balão: lado direito no celular, embaixo em telas largas */}
            <span
              className="absolute top-1/2 -right-1.5 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-slate-200 bg-white
                xl:top-auto xl:right-auto xl:-bottom-1.5 xl:left-1/2 xl:-translate-x-1/2 xl:translate-y-0 xl:border-t-0 xl:border-b"
            />
          </button>
        </div>
      ) : (
        botao
      )}

      {/* INSTRUÇÕES */}
      {aberto &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-ajuda-whatsapp"
            onClick={fechar}
            className="alerta-overlay fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="alerta-caixa w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              {/* CABEÇALHO */}
              <div className="flex items-center gap-3 bg-[#091c4b] px-5 py-4 text-white">
                <span className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-[#25D366]">
                  <IconeWhatsApp size={22} />
                </span>
                <div className="flex-1">
                  <h2 id="titulo-ajuda-whatsapp" className="text-lg font-bold leading-tight">
                    Alertas pelo WhatsApp
                  </h2>
                  <p className="text-xs text-white/70">Receba os avisos de risco da sua cidade</p>
                </div>
                <button
                  onClick={fechar}
                  aria-label="Fechar"
                  className="rounded-lg p-1 transition-colors hover:bg-white/20 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* AVISO DE ALERTA ATIVO */}
              {emAlerta && (
                <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <p>
                    <span className="font-bold">{municipio} está em alerta.</span> Inscreva-se para
                    receber as próximas atualizações no celular.
                  </p>
                </div>
              )}

              {/* PASSO A PASSO */}
              <ol className="space-y-3 px-5 py-4">
                {PASSOS.map(({ titulo, texto }, indice) => (
                  <li key={titulo} className="flex items-start gap-3">
                    <span className="flex w-7 h-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-[#0d1b54]">
                      {indice + 1}
                    </span>
                    <div className="text-sm">
                      <p className="font-semibold text-slate-900">{titulo}</p>
                      <p className="text-slate-600">{texto}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="mx-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                Para trocar de cidade, envie <strong>CIDADE</strong>. Para parar de receber, envie{" "}
                <strong>SAIR</strong>. Em emergência, ligue <strong>199</strong> (Defesa Civil) ou{" "}
                <strong>193</strong> (Bombeiros).
              </p>

              {/* AÇÃO */}
              <div className="px-5 py-4">
                {LINK_WHATSAPP ? (
                  <a
                    href={LINK_WHATSAPP}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={fechar}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0fa84a] px-4 py-3 font-bold text-white transition-colors hover:bg-[#0b7d37]"
                  >
                    <IconeWhatsApp size={18} />
                    Abrir WhatsApp
                    <ExternalLink size={14} />
                  </a>
                ) : (
                  <p className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-700">
                    O número de alertas ainda não foi configurado.
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
