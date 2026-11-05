"use client";

import { MapContainer, TileLayer, GeoJSON, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";

interface MapaProps {
  bairrosDados: any;
  setLocalAberto: (nome: string) => void;
  cidadeSelecionada: string;
  climaPorCidade: { [key: string]: any };
  setClimaPorCidade: (fn: (anterior: any) => any) => void;
}

export default function MapaValeComponent({
  bairrosDados,
  setLocalAberto,
  cidadeSelecionada,
  climaPorCidade,
  setClimaPorCidade,
}: MapaProps) {
  const cidades = [
    "Aparecida",
    "Arapeí",
    "Areias",
    "Bananal",
    "Caçapava",
    "Cachoeira Paulista",
    "Campos do Jordão",
    "Canas",
    "Caraguatatuba",
    "Cruzeiro",
    "Cunha",
    "Guararema",
    "Guaratinguetá",
    "Igaratá",
    "Ilhabela",
    "Jacareí",
    "Jambeiro",
    "Lagoinha",
    "Lavrinhas",
    "Lorena",
    "Monteiro Lobato",
    "Natividade da Serra",
    "Paraibuna",
    "Pindamonhangaba",
    "Piquete",
    "Potim",
    "Queluz",
    "Redenção da Serra",
    "Roseira",
    "Santa Branca",
    "Santo Antônio do Pinhal",
    "São Bento do Sapucaí",
    "São José do Barreiro",
    "São José dos Campos",
    "São Luiz do Paraitinga",
    "São Sebastião",
    "Silveiras",
    "Taubaté",
    "Tremembé",
    "Ubatuba",
  ];

  useEffect(() => {
    Promise.all(
      cidades.map((cidade) =>
        fetch(
          `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(cidade)},BR&appid=aea3caae2787bef2039681102761e6d1&units=metric&lang=pt_br`,
        )
          .then((res) => res.json())
          .then((data) => {
            if (data.cod !== "200") return;
            setClimaPorCidade((anterior) => ({
              ...anterior,
              [cidade]: data,
            }));
          }),
      ),
    );
  }, []);

  function obterCor(chuva: number) {
    if (chuva < 1) return "green";
    if (chuva >= 1 && chuva < 3) return "orange";
    if (chuva >= 3 && chuva < 6) return "red";
    if (chuva > 6) return "purple";
    return "green";
  }

  // 🔥 SVGS PADRONIZADOS COM O MESMO TAMANHO ABSOLUTO E CORES ULTRA VIVAS
  function obterIconeStatus(nomeCidade: string) {
    const dadosClima = climaPorCidade[nomeCidade];

    // Estado de carregamento: Cinza escuro padronizado
    if (!dadosClima) {
      return `
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="13" cy="13" r="10" fill="#475569" stroke="#ffffff" stroke-width="2"/>
        </svg>
      `;
    }

    const lista = dadosClima?.list?.slice(0, 8) ?? [];
    const chuva =
      lista.length > 0
        ? Math.max(...lista.map((item: any) => item?.rain?.["3h"] ?? 0))
        : 0;

    // Risco Extremo / Crítico (Roxo Forte Sólido) - Tamanho idêntico aos outros
    if (chuva > 6) {
      return `
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="13" cy="13" r="10" fill="#7c3aed" stroke="#000000" stroke-width="2"/>
          <path d="M13 8V14M13 18H13.01" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }

    // Risco Alto / Perigo (Vermelho Forte Sólido)
    if (chuva >= 3 && chuva <= 6) {
      return `
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="13" cy="13" r="10" fill="#dc2626" stroke="#000000" stroke-width="2"/>
          <path d="M13 8V14M13 18H13.01" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }

    // Risco Médio / Atenção (Laranja Forte Sólido)
    if (chuva >= 1 && chuva < 3) {
      return `
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="13" cy="13" r="10" fill="#ea580c" stroke="#000000" stroke-width="2"/>
        </svg>
      `;
    }

    // Risco Baixo / Seguro (Verde Vibrante Sólido)
    return `
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="13" cy="13" r="10" fill="#16a34a" stroke="#000000" stroke-width="2"/>
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

            const lista = climaPorCidade[nomeGeoJSON]?.list?.slice(0, 8) ?? [];
            const chuva =
              lista.length > 0
                ? Math.max(...lista.map((item: any) => item?.rain?.["3h"] ?? 0))
                : 0;

            return {
              color: selecionada ? "#ef4444" : "white",
              weight: selecionada ? 3 : 1,
              fillOpacity: selecionada ? 0.6 : 0.3,
              fillColor: selecionada ? "#ef4444" : obterCor(chuva),
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
