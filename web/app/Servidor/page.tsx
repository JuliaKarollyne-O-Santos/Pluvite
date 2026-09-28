"use client";

import { useState } from "react";
import {
  dispararAlertaManual,
  type Prioridade,
  type RelatorioDisparo,
} from "@/app/lib/alertas";

export default function PainelServidor() {
  const [tipo, setTipo] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("BAIXA");
  const [municipio, setMunicipio] = useState("");
  const [endereco, setEndereco] = useState("");
  const [descricao, setDescricao] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioDisparo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * GATILHO MANUAL — chama o mesmo ponto central que o monitor automatico do
   * OpenWeather usa. O backend grava no Supabase e dispara, em paralelo:
   * pop-up no site (WebSocket) + WhatsApp + push notification no app.
   */
  const handleEnviarAlerta = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    setRelatorio(null);

    try {
      const resultado = await dispararAlertaManual({
        tipo,
        prioridade,
        municipio,
        endereco: endereco || "Toda a área do município",
        descricao,
      });

      setRelatorio(resultado);
      setTipo("");
      setPrioridade("BAIXA");
      setMunicipio("");
      setEndereco("");
      setDescricao("");
    } catch (e) {
      console.error("Falha ao disparar alerta:", e);
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível falar com o servidor de alertas.",
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Painel Administrativo - Pluvite</h1>
        <p className="text-gray-600">Central de gerenciamento de alertas e ocorrências.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-white p-6 rounded-lg shadow-md border-t-4 border-red-500">
          <h2 className="text-xl font-bold text-gray-800 mb-4">🚨 Disparar Alerta Meteorológico</h2>
          <p className="text-sm text-gray-500 mb-6">
            O alerta é salvo no banco e enviado na hora pelos três canais:{" "}
            <strong>pop-up no site</strong>, <strong>WhatsApp</strong> e{" "}
            <strong>notificação no aplicativo</strong>.
          </p>

          <form onSubmit={handleEnviarAlerta} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tipo de Alerta</label>
              <input
                type="text"
                placeholder="Ex: Tempestade, Enchente..."
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="mt-1 p-2 w-full border rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Prioridade</label>
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as Prioridade)}
                className="mt-1 p-2 w-full border rounded-md"
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="CRITICA">Crítica</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Município/Região</label>
              <input
                type="text"
                placeholder="Ex: São José dos Campos"
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                className="mt-1 p-2 w-full border rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Endereço/Região afetada
              </label>
              <input
                type="text"
                placeholder="Ex: Av. Tiradentes, próximo ao rio"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                className="mt-1 p-2 w-full border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Descrição/Instruções</label>
              <textarea
                rows={3}
                placeholder="Detalhes sobre o evento e instruções de segurança."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="mt-1 p-2 w-full border rounded-md"
                required
              />
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="mt-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              {enviando ? "Disparando nos 3 canais..." : "Registrar e Disparar Alerta"}
            </button>
          </form>

          {erro && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <strong>Falha no disparo:</strong> {erro}
              <p className="mt-1 text-xs text-red-500">
                Confira se o backend Python está rodando em{" "}
                <code>uvicorn backend.main:app --port 8000</code>.
              </p>
            </div>
          )}

          {relatorio && (
            <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <strong>Alerta disparado:</strong> {relatorio.alerta.titulo}
              <ul className="mt-2 space-y-1 text-xs">
                <li>
                  🖥️ Site: {relatorio.canais.web.entregues ?? 0} navegador(es) receberam o pop-up
                </li>
                <li>
                  💬 WhatsApp:{" "}
                  {relatorio.canais.whatsapp.ok
                    ? `${relatorio.canais.whatsapp.enviados}/${relatorio.canais.whatsapp.total} mensagens enviadas`
                    : `não enviado (${relatorio.canais.whatsapp.motivo ?? "erro"})`}
                </li>
                <li>
                  📱 App:{" "}
                  {relatorio.canais.push.ok
                    ? `${relatorio.canais.push.enviados}/${relatorio.canais.push.total} aparelhos notificados`
                    : `não enviado (${relatorio.canais.push.motivo ?? "erro"})`}
                </li>
                <li>💾 Banco: {relatorio.persistido ? "registrado" : "não persistido"}</li>
              </ul>
            </div>
          )}
        </section>

        <section className="bg-white p-6 rounded-lg shadow-md border-t-4 border-blue-500">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📱 Notificações e Ocorrências do Feed</h2>
          <p className="text-sm text-gray-500 mb-6">
            Área reservada para a gestão de postagens dos usuários no aplicativo.
          </p>

          <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-md bg-gray-50">
            <div className="text-center">
              <span className="text-4xl">🚧</span>
              <p className="mt-2 text-gray-600 font-medium">Em desenvolvimento</p>
              <p className="text-sm text-gray-400">Escopo da Scrum Master (React Native / Expo)</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
