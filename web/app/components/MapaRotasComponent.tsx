"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Circle,
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordenada } from "@/app/lib/geo";
import type { PosicaoUsuario } from "@/app/lib/localizacao";
import type {
  EfeitoOcorrencia,
  EfeitoTransito,
  IncidenteTransito,
  OcorrenciaRota,
} from "@/app/lib/rotas/api";
import { descreverConfirmacao, descreverIncidente } from "@/app/lib/rotas/navegacao";

interface MapaRotasProps {
  limites: [Coordenada, Coordenada];
  // Trecho a percorrer (a rota inteira fora da navegação) e trecho já percorrido
  rota: Coordenada[] | null;
  percorrido: Coordenada[] | null;
  // Opções de rota não escolhidas (planejamento); `indice` é a posição na lista de opções
  alternativas: { indice: number; coordenadas: Coordenada[] }[];
  onSelecionarAlternativa: ((indice: number) => void) | null;
  origem: Coordenada | null;
  destino: Coordenada | null;
  ocorrencias: OcorrenciaRota[];
  // Incidentes do trânsito ao vivo (TomTom) no trajeto e os que a rota evitou
  transito: IncidenteTransito[];
  usuario: PosicaoUsuario | null;
  navegando: boolean;
  seguirUsuario: boolean;
  onPararDeSeguir: () => void;
  onCliqueMapa: ((lat: number, lng: number) => void) | null;
}

const ZOOM_NAVEGACAO = 17;

const COR_OCORRENCIA: Record<EfeitoOcorrencia, string> = {
  bloqueio: "#ef4444",
  restricao: "#f59e0b",
};

// Trânsito ao vivo: vermelho contínuo (lentidão medida), vinho tracejado (via fechada), âmbar
// tracejado (restrição) — por cima da rota, como nos apps de GPS
const ESTILO_TRANSITO: Record<EfeitoTransito, L.PathOptions> = {
  lentidao: { color: "#dc2626", weight: 6, opacity: 0.95 },
  bloqueio: { color: "#7f1d1d", weight: 6, opacity: 0.95, dashArray: "6 6" },
  restricao: { color: "#f59e0b", weight: 5, opacity: 0.95, dashArray: "6 6" },
};

const TEXTO_TRANSITO: Record<EfeitoTransito, string> = {
  lentidao: "Lentidão medida — o atraso já entra no tempo da rota",
  bloqueio: "Via fechada — a rota desvia deste trecho",
  restricao: "Passagem dificultada — a rota evita quando possível",
};

// Alerta "!" (diferente do círculo vermelho do destino)
const iconeOcorrencia = (efeito: EfeitoOcorrencia) =>
  L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:${COR_OCORRENCIA[efeito]};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:900 14px/1 system-ui,sans-serif">!</div>`,
  });

const ICONE_OCORRENCIA: Record<EfeitoOcorrencia, L.DivIcon> = {
  bloqueio: iconeOcorrencia("bloqueio"),
  restricao: iconeOcorrencia("restricao"),
};

// Seta de navegação apontando para o rumo; parado (sem rumo) vira um ponto
const htmlUsuario = (rumo: number | null) =>
  rumo === null
    ? `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center">
         <div style="width:18px;height:18px;border-radius:9999px;background:#0f35a0;border:3px solid #fff;box-shadow:0 0 0 6px rgba(15,53,160,.18),0 2px 6px rgba(0,0,0,.35)"></div>
       </div>`
    : `<div style="width:40px;height:40px;transform:rotate(${rumo}deg)">
         <svg width="40" height="40" viewBox="0 0 40 40" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
           <circle cx="20" cy="20" r="18" fill="#0f35a0" fill-opacity="0.15" />
           <path d="M20 6 L30 31 L20 25.5 L10 31 Z" fill="#0f35a0" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round" />
         </svg>
       </div>`;

// Reenquadra o mapa quando a cidade ou a rota mudam (na navegação a câmera segue o usuário)
function Enquadramento({
  limites,
  rota,
  navegando,
}: {
  limites: [Coordenada, Coordenada];
  rota: Coordenada[] | null;
  navegando: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(limites, { padding: [20, 20] });
  }, [map, limites]);

  useEffect(() => {
    // Deixa espaço para o painel flutuante: à esquerda no desktop, em cima no celular
    if (!navegando && rota && rota.length > 1) {
      const telaLarga = map.getSize().x >= 768;
      map.fitBounds(rota, {
        paddingTopLeft: telaLarga ? [420, 40] : [20, 320],
        paddingBottomRight: [40, 40],
      });
    }
  }, [map, rota, navegando]);

  return null;
}

// Mantém o usuário no centro durante a navegação (também ao girar o celular / redimensionar);
// arrastar o mapa desliga o acompanhamento
function AcompanharUsuario({
  coordenada,
  ativo,
  onPararDeSeguir,
}: {
  coordenada: Coordenada | null;
  ativo: boolean;
  onPararDeSeguir: () => void;
}) {
  const map = useMap();
  useMapEvents({
    dragstart: onPararDeSeguir,
    resize: () => {
      if (ativo && coordenada) map.setView(coordenada, map.getZoom(), { animate: false });
    },
  });

  useEffect(() => {
    if (!ativo || !coordenada) return;
    if (map.getZoom() < ZOOM_NAVEGACAO - 1) map.setView(coordenada, ZOOM_NAVEGACAO);
    else map.panTo(coordenada, { animate: true, duration: 0.8 });
  }, [map, ativo, coordenada]);

  return null;
}

function CapturaClique({ onCliqueMapa }: { onCliqueMapa: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onCliqueMapa(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function MarcadorUsuario({ usuario }: { usuario: PosicaoUsuario }) {
  const rumo = usuario.rumo === null ? null : Math.round(usuario.rumo);
  const icone = useMemo(
    () => L.divIcon({ className: "", html: htmlUsuario(rumo), iconSize: [40, 40], iconAnchor: [20, 20] }),
    [rumo],
  );

  return (
    <>
      {/* Círculo de imprecisão do GPS */}
      {usuario.precisao > 15 && (
        <Circle
          center={usuario.coordenada}
          radius={usuario.precisao}
          interactive={false}
          pathOptions={{ color: "#0f35a0", weight: 1, opacity: 0.3, fillColor: "#0f35a0", fillOpacity: 0.08 }}
        />
      )}
      <Marker
        position={usuario.coordenada}
        icon={icone}
        interactive={false}
        keyboard={false}
        zIndexOffset={1000}
      />
    </>
  );
}

export default function MapaRotasComponent({
  limites,
  rota,
  percorrido,
  alternativas,
  onSelecionarAlternativa,
  origem,
  destino,
  ocorrencias,
  transito,
  usuario,
  navegando,
  seguirUsuario,
  onPararDeSeguir,
  onCliqueMapa,
}: MapaRotasProps) {
  const localizadas = ocorrencias.filter((o) => o.localizacao && o.posicao);

  return (
    <MapContainer
      bounds={limites}
      className={`h-full w-full ${onCliqueMapa ? "cursor-crosshair" : ""}`}
      zoomControl={false}
    >
      {/* Mapa de ruas do OpenStreetMap (mesma base dos grafos de rotas, sem chave de API) */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <Enquadramento limites={limites} rota={rota} navegando={navegando} />
      <AcompanharUsuario
        coordenada={usuario?.coordenada ?? null}
        ativo={navegando && seguirUsuario}
        onPararDeSeguir={onPararDeSeguir}
      />
      {onCliqueMapa && <CapturaClique onCliqueMapa={onCliqueMapa} />}

      {/* VIAS AFETADAS POR OCORRÊNCIAS DO FEED (abaixo da rota) */}
      {localizadas.flatMap((o) =>
        o.trechos.map((trecho, i) => (
          <Polyline
            key={`${o.id}-${i}`}
            positions={trecho}
            interactive={false}
            pathOptions={{ color: COR_OCORRENCIA[o.efeito], weight: 7, opacity: 0.55, dashArray: "8 8" }}
          />
        )),
      )}

      {/* TRAÇADO: já percorrido em cinza; a percorrer com contorno branco + azul da marca */}
      {percorrido && percorrido.length > 1 && (
        <Polyline positions={percorrido} pathOptions={{ color: "#94a3b8", weight: 6, opacity: 0.9 }} />
      )}
      {/* OPÇÕES NÃO ESCOLHIDAS (cinza, abaixo da rota): o clique escolhe a opção e, sem propagar
          para o mapa, não marca origem/destino */}
      {alternativas.map(({ indice, coordenadas }) => (
        <Polyline
          key={`alternativa-${indice}`}
          positions={coordenadas}
          bubblingMouseEvents={false}
          eventHandlers={{ click: () => onSelecionarAlternativa?.(indice) }}
          pathOptions={{ color: "#64748b", weight: 6, opacity: 0.55 }}
        >
          <Tooltip sticky>Rota alternativa — clique para escolher</Tooltip>
        </Polyline>
      ))}
      {rota && (
        <>
          <Polyline positions={rota} pathOptions={{ color: "#ffffff", weight: 10, opacity: 0.9 }} />
          <Polyline positions={rota} pathOptions={{ color: "#0f35a0", weight: 6 }} />
        </>
      )}

      {/* TRÂNSITO AO VIVO (TomTom), por cima da rota; o clique não marca origem/destino */}
      {transito
        .filter((incidente) => incidente.trecho.length > 1)
        .map((incidente) => (
          <Polyline
            key={`transito-${incidente.id}`}
            positions={incidente.trecho}
            bubblingMouseEvents={false}
            pathOptions={ESTILO_TRANSITO[incidente.efeito]}
          >
            <Tooltip sticky>
              <strong>{descreverIncidente(incidente)}</strong>
              <br />
              {TEXTO_TRANSITO[incidente.efeito]}
              {incidente.descricao && (
                <>
                  <br />
                  <span className="text-slate-500">{incidente.descricao}</span>
                </>
              )}
              <br />
              <span className="text-slate-500">Dados de trânsito © TomTom</span>
            </Tooltip>
          </Polyline>
        ))}

      {localizadas.map((o) => (
        <Marker key={o.id} position={o.posicao as Coordenada} icon={ICONE_OCORRENCIA[o.efeito]}>
          <Tooltip direction="top" offset={[0, -12]}>
            <strong>{o.tipo}</strong> · {o.rua ?? o.endereco}
            <br />
            {o.localizacao === "rua"
              ? "Rua inteira — sem local exato: a rota evita quando possível"
              : o.efeito === "bloqueio"
                ? "Bloqueio relatado: a rota desvia deste trecho"
                : "Passagem difícil: a rota evita quando possível"}
            <br />
            <span className="text-slate-500">{descreverConfirmacao(o)}</span>
          </Tooltip>
        </Marker>
      ))}

      {origem && !navegando && (
        <CircleMarker
          center={origem}
          radius={9}
          pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#0a9667", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>Origem</Tooltip>
        </CircleMarker>
      )}

      {destino && (
        <CircleMarker
          center={destino}
          radius={9}
          pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#ef4444", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>Destino</Tooltip>
        </CircleMarker>
      )}

      {usuario && <MarcadorUsuario usuario={usuario} />}
    </MapContainer>
  );
}
