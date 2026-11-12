/**
 * Mapa de rotas: Leaflet + OpenStreetMap dentro de uma WebView (não precisa de chave do Google).
 *
 * O React Native manda o estado do mapa (rota, pontos, ocorrências, posição) via injectJavaScript
 * e recebe os toques no mapa por postMessage. Como no site, o mapa mostra só a rota, os pontos de
 * partida/chegada e as ocorrências do Feed — os fatores do tempo de viagem ficam no cálculo.
 */

import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { Coordenada } from "../lib/geo";

export interface OcorrenciaMapa {
  id: string;
  tipo: string;
  efeito: "bloqueio" | "restricao";
  posicao: Coordenada | null;
  trechos: Coordenada[][];
}

export interface EstadoMapa {
  centro: Coordenada;
  rota: Coordenada[];
  alternativas: Coordenada[][];
  origem: Coordenada | null;
  destino: Coordenada | null;
  posicao: Coordenada | null;
  ocorrencias: OcorrenciaMapa[];
  /** true durante a navegação: o mapa acompanha a posição */
  seguir: boolean;
}

const HTML_MAPA = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #mapa { margin: 0; padding: 0; height: 100%; width: 100%; background: #e2e8f0; }
  .ponto { width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
  .voce { width: 18px; height: 18px; border-radius: 50%; background: #2a68e2; border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(42,104,226,.25); }
  .oc { width: 22px; height: 22px; border-radius: 50%; color: #fff; font: bold 13px sans-serif; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
</style>
</head><body><div id="mapa"></div>
<script>
  var mapa = L.map('mapa', { zoomControl: false, attributionControl: true }).setView([-23.0257, -45.5554], 13);
  // Tiles CARTO (dados OSM): o servidor do OSM recusa pedidos sem Referer, como os da WebView
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO'
  }).addTo(mapa);
  var camadas = L.layerGroup().addTo(mapa);
  var marcadorVoce = null;
  var ultimaRota = '';
  var ultimoCentro = '';

  function icone(classe, cor) {
    return L.divIcon({ className: '', html: '<div class="' + classe + '" style="background:' + cor + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  }

  window.atualizarMapa = function (e) {
    var chaveRota = JSON.stringify([e.rota, e.alternativas, e.origem, e.destino, e.ocorrencias]);
    if (chaveRota !== ultimaRota) {
      ultimaRota = chaveRota;
      camadas.clearLayers();
      (e.ocorrencias || []).forEach(function (oc) {
        var cor = oc.efeito === 'bloqueio' ? '#dc2626' : '#f59e0b';
        (oc.trechos || []).forEach(function (t) {
          L.polyline(t, { color: cor, weight: 7, opacity: 0.55 }).addTo(camadas);
        });
        if (oc.posicao) {
          L.marker(oc.posicao, { icon: L.divIcon({ className: '', html: '<div class="oc" style="background:' + cor + '">!</div>', iconSize: [22, 22], iconAnchor: [11, 11] }) })
            .bindPopup('<b>' + oc.tipo + '</b><br/>' + (oc.efeito === 'bloqueio' ? 'Via bloqueada' : 'Trânsito restrito'))
            .addTo(camadas);
        }
      });
      (e.alternativas || []).forEach(function (alt) {
        L.polyline(alt, { color: '#64748b', weight: 5, opacity: 0.6, dashArray: '6 8' }).addTo(camadas);
      });
      if (e.rota && e.rota.length > 1) {
        L.polyline(e.rota, { color: '#091c4b', weight: 9, opacity: 0.35 }).addTo(camadas);
        L.polyline(e.rota, { color: '#2a68e2', weight: 5 }).addTo(camadas);
        if (!e.seguir) mapa.fitBounds(L.latLngBounds(e.rota), { padding: [40, 40] });
      }
      if (e.origem) L.marker(e.origem, { icon: icone('ponto', '#059669') }).addTo(camadas);
      if (e.destino) L.marker(e.destino, { icon: icone('ponto', '#dc2626') }).addTo(camadas);
    }

    var chaveCentro = JSON.stringify(e.centro);
    if (chaveCentro !== ultimoCentro) {
      ultimoCentro = chaveCentro;
      if (!e.rota || e.rota.length < 2) mapa.setView(e.centro, 14);
    }

    if (e.posicao) {
      if (!marcadorVoce) marcadorVoce = L.marker(e.posicao, { icon: L.divIcon({ className: '', html: '<div class="voce"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(mapa);
      else marcadorVoce.setLatLng(e.posicao);
      if (e.seguir) mapa.setView(e.posicao, Math.max(mapa.getZoom(), 17));
    } else if (marcadorVoce) {
      mapa.removeLayer(marcadorVoce);
      marcadorVoce = null;
    }
  };

  mapa.on('click', function (ev) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'toque', lat: ev.latlng.lat, lng: ev.latlng.lng }));
  });
  window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'pronto' }));
</script></body></html>`;

export default function MapaRotas({
  estado,
  aoTocarMapa,
}: {
  estado: EstadoMapa;
  aoTocarMapa?: (coordenada: Coordenada) => void;
}) {
  // P = object: com o padrão (undefined) os tipos da lib viram never no TS 5.9
  const webviewRef = useRef<WebView<object>>(null);
  const [pronto, setPronto] = useState(false);

  // ENVIA O ESTADO AO MAPA SEMPRE QUE MUDA
  useEffect(() => {
    if (!pronto) return;
    webviewRef.current?.injectJavaScript(
      `window.atualizarMapa && window.atualizarMapa(${JSON.stringify(estado)}); true;`,
    );
  }, [estado, pronto]);

  const handleMensagem = (evento: WebViewMessageEvent) => {
    try {
      const mensagem = JSON.parse(evento.nativeEvent.data) as
        | { tipo: "pronto" }
        | { tipo: "toque"; lat: number; lng: number };
      if (mensagem.tipo === "pronto") setPronto(true);
      else if (mensagem.tipo === "toque") aoTocarMapa?.([mensagem.lat, mensagem.lng]);
    } catch (erro) {
      console.warn("[mapa] Mensagem inválida da WebView:", erro);
    }
  };

  return (
    <View style={styles.container}>
      <WebView<object>
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html: HTML_MAPA }}
        onMessage={handleMensagem}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden", backgroundColor: "#e2e8f0" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
