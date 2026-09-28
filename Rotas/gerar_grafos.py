"""
Gera os grafos viários dos 39 municípios usados no cálculo de rotas do Pluvite.

Para cada cidade:
  1. Baixa a malha "drive" do OpenStreetMap com OSMnx, incluindo as tags que o modelo de
     tempo de viagem usa (semáforos, lombadas, PARE, pavimento, pedágio...).
  2. Adiciona a elevação de cada nó a partir do SRTM 1" (NASA, ~30 m), lido dos tiles
     públicos "skadi" da AWS (Mapzen/Tilezen) — sem dependências além da biblioteca padrão.
  3. Calcula a subida e a descida acumuladas de cada aresta ao longo da geometria.
  4. Salva <cidade>_graph.json (node-link JSON compacto) nesta pasta.

Uso (na raiz do repositório):
    python Rotas/gerar_grafos.py                 # todas as cidades
    python Rotas/gerar_grafos.py Taubaté Ubatuba # só algumas

O modelo que consome esses dados está em web/app/backend/rotas/modeloTempo.js.
"""

import array
import gzip
import json
import math
import os
import sys
import unicodedata
import urllib.request

import networkx as nx
import osmnx as ox

PASTA_ROTAS = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(PASTA_ROTAS)
PASTA_SRTM = os.path.join(RAIZ, "cache", "srtm")
URL_SRTM = "https://s3.amazonaws.com/elevation-tiles-prod/skadi/{pasta}/{nome}.hgt.gz"

MUNICIPIOS = [
    "Aparecida", "Arapeí", "Areias", "Bananal", "Caçapava", "Cachoeira Paulista",
    "Campos do Jordão", "Canas", "Caraguatatuba", "Cruzeiro", "Cunha", "Guaratinguetá",
    "Igaratá", "Ilhabela", "Jacareí", "Jambeiro", "Lagoinha", "Lavrinhas", "Lorena",
    "Monteiro Lobato", "Natividade da Serra", "Paraibuna", "Pindamonhangaba", "Piquete",
    "Potim", "Queluz", "Redenção da Serra", "Roseira", "Santa Branca",
    "Santo Antônio do Pinhal", "São Bento do Sapucaí", "São José do Barreiro",
    "São José dos Campos", "São Luiz do Paraitinga", "São Sebastião", "Silveiras",
    "Taubaté", "Tremembé", "Ubatuba",
]

# Tags extras além do padrão do OSMnx (ver ox.settings.useful_tags_*)
TAGS_NO = ["traffic_calming", "crossing", "stop", "direction", "traffic_signals:direction"]
TAGS_VIA = ["surface", "smoothness", "tracktype", "toll"]

# Retângulo que contém o Vale do Paraíba e o Litoral Norte — protege contra geocodificação
# errada (ex.: "Cunha, São Paulo" já caiu num bairro homônimo no oeste do estado)
LIMITES_VALE = {"lat": (-23.95, -22.35), "lon": (-46.4, -44.1)}

# Amostragem do perfil de elevação ao longo das arestas
PASSO_AMOSTRA_M = 25
# Variações menores que isso são tratadas como ruído do SRTM (histerese)
HISTERESE_M = 3.0


def slug(nome):
    sem_acento = unicodedata.normalize("NFD", nome).encode("ascii", "ignore").decode()
    return sem_acento.lower().replace(" ", "_")


def distancia_m(lat1, lon1, lat2, lon2):
    r = math.radians
    a = (math.sin(r(lat2 - lat1) / 2) ** 2
         + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(a))


class SRTM:
    """Leitor de tiles SRTM .hgt (3601x3601, int16 big-endian, linha 0 = borda norte)."""

    def __init__(self, pasta):
        self.pasta = pasta
        self.tiles = {}
        os.makedirs(pasta, exist_ok=True)

    def _tile(self, lat_i, lon_i):
        chave = (lat_i, lon_i)
        if chave not in self.tiles:
            pasta = f"{'S' if lat_i < 0 else 'N'}{abs(lat_i):02d}"
            nome = f"{pasta}{'W' if lon_i < 0 else 'E'}{abs(lon_i):03d}"
            caminho = os.path.join(self.pasta, f"{nome}.hgt.gz")
            if not os.path.exists(caminho):
                print(f"  baixando SRTM {nome}...")
                urllib.request.urlretrieve(URL_SRTM.format(pasta=pasta, nome=nome), caminho)
            with gzip.open(caminho, "rb") as f:
                dados = array.array("h")
                dados.frombytes(f.read())
            if sys.byteorder == "little":
                dados.byteswap()
            lado = int(math.sqrt(len(dados)))
            self.tiles[chave] = (lado, dados)
        return self.tiles[chave]

    def altitude(self, lat, lon):
        lat_i, lon_i = math.floor(lat), math.floor(lon)
        lado, dados = self._tile(lat_i, lon_i)
        linha = (lat_i + 1 - lat) * (lado - 1)
        coluna = (lon - lon_i) * (lado - 1)
        l0, c0 = int(linha), int(coluna)
        l1, c1 = min(l0 + 1, lado - 1), min(c0 + 1, lado - 1)
        dl, dc = linha - l0, coluna - c0

        # Interpolação bilinear ignorando pixels vazios (-32768)
        soma = peso_total = 0.0
        for l, c, peso in ((l0, c0, (1 - dl) * (1 - dc)), (l0, c1, (1 - dl) * dc),
                           (l1, c0, dl * (1 - dc)), (l1, c1, dl * dc)):
            valor = dados[l * lado + c]
            if valor != -32768:
                soma += valor * peso
                peso_total += peso
        return round(soma / peso_total, 1) if peso_total else None


def pontos_da_aresta(G, u, v, dados):
    if "geometry" in dados:
        return [(lat, lon) for lon, lat in dados["geometry"].coords]
    return [(G.nodes[u]["y"], G.nodes[u]["x"]), (G.nodes[v]["y"], G.nodes[v]["x"])]


def perfil_da_aresta(srtm, pontos):
    """Subida/descida acumuladas (m) amostrando a geometria a cada PASSO_AMOSTRA_M."""
    amostras = [pontos[0]]
    for (la1, lo1), (la2, lo2) in zip(pontos, pontos[1:]):
        trecho = distancia_m(la1, lo1, la2, lo2)
        passos = max(1, int(trecho // PASSO_AMOSTRA_M))
        for i in range(1, passos + 1):
            t = i / passos
            amostras.append((la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t))

    alturas = [h for h in (srtm.altitude(la, lo) for la, lo in amostras) if h is not None]
    subida = descida = 0.0
    if alturas:
        referencia = alturas[0]
        for h in alturas[1:]:
            if h - referencia >= HISTERESE_M:
                subida += h - referencia
                referencia = h
            elif referencia - h >= HISTERESE_M:
                descida += referencia - h
                referencia = h
    return round(subida, 1), round(descida, 1)


def gerar(nome, srtm):
    print(f"{nome}: baixando malha viária...")
    # Consulta estruturada ao Nominatim: busca o município, não qualquer lugar com esse nome
    consulta = {"city": nome, "state": "São Paulo", "country": "Brazil"}
    G = ox.graph_from_place(consulta, network_type="drive")

    lat_media = sum(d["y"] for _, d in G.nodes(data=True)) / len(G)
    lon_media = sum(d["x"] for _, d in G.nodes(data=True)) / len(G)
    if not (LIMITES_VALE["lat"][0] < lat_media < LIMITES_VALE["lat"][1]
            and LIMITES_VALE["lon"][0] < lon_media < LIMITES_VALE["lon"][1]):
        raise ValueError(f"geocodificação fora do Vale ({lat_media:.3f}, {lon_media:.3f})")

    for _, dados in G.nodes(data=True):
        dados["elevacao"] = srtm.altitude(dados["y"], dados["x"])

    for u, v, dados in G.edges(data=True):
        # Pontes e túneis: o SRTM mede o vale/morro, não o tabuleiro — usa só as pontas
        if dados.get("bridge") or dados.get("tunnel"):
            hu, hv = G.nodes[u]["elevacao"], G.nodes[v]["elevacao"]
            delta = (hv - hu) if hu is not None and hv is not None else 0
            dados["subida"], dados["descida"] = round(max(delta, 0), 1), round(max(-delta, 0), 1)
        else:
            dados["subida"], dados["descida"] = perfil_da_aresta(srtm, pontos_da_aresta(G, u, v, dados))

    arquivo = os.path.join(PASTA_ROTAS, f"{slug(nome)}_graph.json")
    temporario = arquivo + ".tmp"
    with open(temporario, "w", encoding="utf-8") as f:
        json.dump(nx.node_link_data(G, edges="edges"), f, ensure_ascii=False,
                  separators=(",", ":"), default=str)
    os.replace(temporario, arquivo)

    # Remove versões antigas com acento no nome (ex.: igaratá_graph.json) para não duplicar a cidade
    for existente in os.listdir(PASTA_ROTAS):
        if (existente.endswith("_graph.json") and existente != os.path.basename(arquivo)
                and slug(existente.replace("_graph.json", "").replace("_", " ")) == slug(nome)):
            os.remove(os.path.join(PASTA_ROTAS, existente))

    print(f"{nome}: {len(G.nodes)} nós, {len(G.edges)} arestas -> {os.path.basename(arquivo)}")


def main():
    ox.settings.use_cache = True
    ox.settings.cache_folder = os.path.join(RAIZ, "cache")
    # Espelho alternativo quando o servidor principal está fora (ex.: https://overpass.kumi.systems/api)
    ox.settings.overpass_url = os.environ.get("OVERPASS_URL", ox.settings.overpass_url)
    ox.settings.useful_tags_node = sorted(set(ox.settings.useful_tags_node) | set(TAGS_NO))
    ox.settings.useful_tags_way = sorted(set(ox.settings.useful_tags_way) | set(TAGS_VIA))

    cidades = sys.argv[1:] or MUNICIPIOS
    srtm = SRTM(PASTA_SRTM)
    falhas = []
    for nome in cidades:
        try:
            gerar(nome, srtm)
        except Exception as erro:  # segue para as próximas cidades
            print(f"{nome}: ERRO {erro}")
            falhas.append(nome)
    if falhas:
        print("Falharam:", ", ".join(falhas))
        sys.exit(1)


if __name__ == "__main__":
    main()
