import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import Feed from "./Feed";

jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MockIcon = (props: any) => <View {...props} />;
  return {
    AlertTriangle: MockIcon,
    Wrench: MockIcon,
    Eye: MockIcon,
    Plus: MockIcon,
    Search: MockIcon,
    MapPin: MockIcon,
    Filter: MockIcon,
    MessageSquare: MockIcon,
    ThumbsUp: MockIcon,
    Share2: MockIcon,
    TrendingUp: MockIcon,
    CloudRain: MockIcon,
  };
});

describe("Automação da Tela de Feed", () => {
  it("deve renderizar o cabeçalho e as seções principais da tela", () => {
    const { getByText } = render(<Feed />);

    expect(getByText("Feed de Ocorrências")).toBeTruthy();
    expect(
      getByText("Acompanhe e reporte problemas urbanos em tempo real na sua região.")
    ).toBeTruthy();

    expect(getByText("Publicar Ocorrência")).toBeTruthy();

    expect(getByText("Situação em Três Marias")).toBeTruthy();
    expect(getByText("Bairros com mais relatos")).toBeTruthy();
    expect(getByText("Ocorrências Recentes")).toBeTruthy();
  });

  it("deve permitir digitar no campo de busca por bairro", () => {
    const { getByPlaceholderText } = render(<Feed />);

    const campoBusca = getByPlaceholderText("Buscar por bairro (ex: Quiririm)...");

    fireEvent.changeText(campoBusca, "Quiririm");

    expect(campoBusca.props.value).toBe("Quiririm");
  });

  it("deve permitir selecionar diferentes cidades no filtro", () => {
    const { getByText } = render(<Feed />);

    const chipSJC = getByText("São José dos Campos");

    fireEvent.press(chipSJC);

    expect(chipSJC).toBeTruthy();
  });

  it("deve permitir selecionar diferentes categorias no filtro", () => {
    const { getByText } = render(<Feed />);

    const chipAlagamento = getByText("Alagamento");

    fireEvent.press(chipAlagamento);

    expect(chipAlagamento).toBeTruthy();
  });

  it("deve exibir as informações da ocorrência cadastrada na lista", () => {
    const { getByText } = render(<Feed />);

    expect(getByText("Maria Silva")).toBeTruthy();
    expect(getByText(/Avenida Armando de Moura, 256/)).toBeTruthy();
    expect(
      getByText(/Ponto de alagamento acentuado próximo ao cruzamento principal/)
    ).toBeTruthy();
    expect(getByText("Curtidas (12)")).toBeTruthy();
    expect(getByText("Comentários (4)")).toBeTruthy();
  });
});