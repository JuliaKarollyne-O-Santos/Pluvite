"use client";

import { MapContainer, TileLayer, GeoJSON, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { normalizar } from "@/app/lib/constantes";
import { COR_NIVEL_MAPA, type NivelMapa } from "@/app/lib/riscoMapa";

interface MapaProps {
  bairrosDados: any;
  setLocalAberto: (nome: string) => void;
  cidadeSelecionada: string;
  /** Nível de cada cidade (chave: nome normalizado), calculado em Mapa/page.tsx com a
   * mesma regra do card "Situação". Cidade sem entrada = ainda carregando. */
  nivelPorCidade: Record<string, NivelMapa>;
}

const COR_CARREGANDO = "#475569";

export default function MapaValeComponent({
  bairrosDados,
  setLocalAberto,
  cidadeSelecionada,
  nivelPorCidade,
}: MapaProps) {
  const nivelDa = (nomeCidade: string): NivelMapa | undefined =>
    nivelPorCidade[normalizar(nomeCidade)];

  // MARCADOR: círculo na cor do nível; Alto e Crítico ganham o "!"
  function obterIconeStatus(nomeCidade: string) {
    const nivel = nivelDa(nomeCidade);
    if (!nivel) {
      return `
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="13" cy="13" r="10" fill="${COR_CARREGANDO}" stroke="#ffffff" stroke-width="2"/>
        </svg>
      `;
    }
    const exclamacao =
      nivel === "alto" || nivel === "critico"
        ? `<path d="M13 8V14M13 18H13.01" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : "";
    return `
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="13" cy="13" r="10" fill="${COR_NIVEL_MAPA[nivel]}" stroke="#000000" stroke-width="2"/>
        ${exclamacao}
      </svg>
    `;
  }

  return (
    // Ocupa a área da página do Mapa (que já começa abaixo da navbar), então o zoom do Leaflet fica
    // na posição padrão, sem o deslocamento de 85px que compensava a navbar por cima do mapa
    <div className="absolute inset-0">
      <style jsx global>{`
        .custom-svg-marker {
          background: none !important;
          border: none !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer;
          filter: drop-shadow(0px 3px 5px rgba(0, 0, 0, 0.6));
        }
      `}</style>

      <MapContainer
        key="mapa-vale"
        center={[-23.2, -45.2]}
        zoom={9}
        className="h-full w-full"
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />

        <GeoJSON
          data={bairrosDados as any}
          style={(feature) => {
            const nomeGeoJSON =
              feature?.properties?.NM_MUN ||
              feature?.properties?.name ||
              feature?.properties?.NM_MUNICIPIO;

            const selecionada =
              cidadeSelecionada && nomeGeoJSON === cidadeSelecionada;

            const nivel = nivelDa(nomeGeoJSON);

            // Selecionada: mantém a cor do nível e ganha borda branca grossa
            // (antes ficava vermelha, igual ao "Alto" da legenda)
            return {
              color: "white",
              weight: selecionada ? 4 : 1,
              fillOpacity: selecionada ? 0.55 : 0.3,
              fillColor: nivel ? COR_NIVEL_MAPA[nivel] : COR_CARREGANDO,
            };
          }}
          onEachFeature={(feature, layer) => {
            const nome =
              feature.properties.NM_MUN ||
              feature.properties.name ||
              feature.properties.NM_MUNICIPIO ||
              "Município";

            layer.on("click", () => {
              setLocalAberto(nome);
            });
          }}
        />

        {bairrosDados?.features?.map((feature: any, idx: number) => {
          const nomeCidade =
            feature.properties.NM_MUN ||
            feature.properties.name ||
            feature.properties.NM_MUNICIPIO;

          if (!nomeCidade) return null;

          const svgMarkup = obterIconeStatus(nomeCidade);

          try {
            const camadaVirtual = L.geoJson(feature);
            const centro = camadaVirtual.getBounds().getCenter();
            const posicaoFinal: [number, number] = [centro.lat, centro.lng];

            const customIcon = L.divIcon({
              html: svgMarkup,
              className: "custom-svg-marker",
              iconSize: [30, 30], // Aumentado proporcionalmente para caber o novo viewBox de 26px
              iconAnchor: [15, 15],
            });

            return (
              <Marker
                key={`svg-marker-${nomeCidade}-${idx}`}
                position={posicaoFinal}
                icon={customIcon}
                eventHandlers={{
                  click: () => {
                    setLocalAberto(nomeCidade);
                  },
                }}
              />
            );
          } catch (e) {
            console.error(
              "Erro ao calcular o centro da cidade: " + nomeCidade,
              e,
            );
            return null;
          }
        })}
      </MapContainer>
    </div>
  );
}
