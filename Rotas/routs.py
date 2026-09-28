import osmnx as ox
import networkx as nx
import json

G = ox.graph_from_place("Ubatuba, São Paulo, Brazil", network_type="drive")

data = nx.node_link_data(G)
with open("ubatuba_graph.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2, default=str)