"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordenada } from "@/app/lib/geo";

// Mapa pequeno para marcar o ponto exato de uma ocorrência (modal de publicação do Feed)
interface SeletorLocalMapaProps {
  centroCidade: Coordenada;
  valor: Coordenada | null;
  onChange: (coordenada: Coordenada) => void;
}

const ZOOM_CIDADE = 14;
const ZOOM_LOCAL = 17;

// Centraliza só quando o ponto sai da área visível (troca de cidade, local vindo do GPS);
// um clique dentro do mapa não mexe na câmera
function Enquadrar({ centro, zoom }: { centro: Coordenada; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().contains(centro)) map.setView(centro, zoom);
  }, [map, centro, zoom]);
  return null;
}

function CapturaClique({ onChange }: { onChange: (coordenada: Coordenada) => void }) {
  useMapEvents({
    click: (e) => onChange([e.latlng.lat, e.latlng.lng]),
  });
  return null;
}

export default function SeletorLocalMapa({ centroCidade, valor, onChange }: SeletorLocalMapaProps) {
  const centro = valor ?? centroCidade;
  const zoom = valor ? ZOOM_LOCAL : ZOOM_CIDADE;

  return (
    // z-0 isola as camadas do Leaflet para os menus suspensos do modal abrirem por cima do mapa
    <div className="relative z-0 h-44 rounded-2xl overflow-hidden border border-slate-200">
      <MapContainer center={centro} zoom={zoom} className="h-full w-full cursor-crosshair">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Enquadrar centro={centro} zoom={zoom} />
        <CapturaClique onChange={onChange} />
        {valor && (
          <CircleMarker
            center={valor}
            radius={9}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#ef4444", fillOpacity: 1 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
