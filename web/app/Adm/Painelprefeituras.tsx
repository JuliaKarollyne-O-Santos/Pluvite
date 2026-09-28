"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import { Building2, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { MUNICIPIOS } from "@/app/lib/constantes";

interface Servidor {
  id: string;
  nome_completo: string;
  email: string;
  municipio: string;
  criado_em: string;
}

// Aba "Prefeituras" do painel /Adm: cadastra o login de cada prefeitura e
// permite remover uma conta. Cada conta de servidor só vê e recebe
// notificações das ocorrências do próprio município (ver /Prefeituras).
export default function PainelPrefeituras() {
  const router = useRouter();

  const [servidores, setServidores] = useState<Servidor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [municipio, setMunicipio] = useState("");

  const obterTokenSessao = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const carregarServidores = async () => {
    setCarregando(true);
    try {
      const token = await obterTokenSessao();
      if (!token) {
        router.replace("/login");
        return;
      }
      const resposta = await fetch("/api/criar-servidor", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resposta.ok) {
        setServidores(await resposta.json());
      }
    } catch (e) {
      console.error("Erro ao carregar servidores:", e);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarServidores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    if (!nome.trim() || !email.trim() || !senha || !municipio) {
      setErro("Preencha todos os campos.");
      return;
    }
    if (senha.length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setSalvando(true);
    try {
      const token = await obterTokenSessao();
      if (!token) {
        router.replace("/login");
        return;
      }

      const resposta = await fetch("/api/criar-servidor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nome, email, senha, municipio }),
      });
      const resultado = await resposta.json();

      if (!resposta.ok) {
        setErro(resultado.error || "Não foi possível criar a conta.");
        return;
      }

      setNome("");
      setEmail("");
      setSenha("");
      setMunicipio("");
      carregarServidores();
    } catch (e) {
      setErro("Erro inesperado ao criar a conta.");
    } finally {
      setSalvando(false);
    }
  };

  const handleRemover = async (servidor: Servidor) => {
    const confirmar = window.confirm(
      `Remover o acesso de "${servidor.nome_completo}" (${servidor.municipio})? Essa conta não vai mais conseguir entrar no painel.`,
    );
    if (!confirmar) return;

    setRemovendoId(servidor.id);
    try {
      const token = await obterTokenSessao();
      if (!token) {
        router.replace("/login");
        return;
      }

      const resposta = await fetch(
        `/api/criar-servidor?id=${servidor.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!resposta.ok) {
        const resultado = await resposta.json();
        alert(resultado.error || "Não foi possível remover essa conta.");
        return;
      }

      setServidores((prev) => prev.filter((s) => s.id !== servidor.id));
    } catch (e) {
      alert("Erro inesperado ao remover a conta.");
    } finally {
      setRemovendoId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Contas de Servidor
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Cadastre o login de cada prefeitura. Cada conta só vê e recebe
          notificações das ocorrências do próprio município.
        </p>
      </div>

      {/* FORMULÁRIO */}
      <form
        onSubmit={handleCriar}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4"
      >
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Building2 size={16} className="text-[#091f75]" />
          Nova conta de servidor
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
              Nome
            </span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Prefeitura de Taubaté"
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#091f75] focus:ring-2 focus:ring-[#091f75]/10"
            />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
              Município
            </span>
            <select
              value={municipio}
              onChange={(e) => setMunicipio(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#091f75] focus:ring-2 focus:ring-[#091f75]/10"
            >
              <option value="">Selecione</option>
              {MUNICIPIOS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
              E-mail de login
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prefeitura.taubate@pluvite.com"
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#091f75] focus:ring-2 focus:ring-[#091f75]/10"
            />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
              Senha inicial
            </span>
            <input
              type="text"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#091f75] focus:ring-2 focus:ring-[#091f75]/10"
            />
          </div>
        </div>

        {erro && <p className="text-xs font-semibold text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={salvando}
          className="flex items-center gap-2 bg-[#091f75] hover:bg-[#0f2a8f] text-white text-sm font-bold px-4 py-2.5 rounded-xl transition cursor-pointer disabled:opacity-60"
        >
          {salvando ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Plus size={15} />
          )}
          Criar conta
        </button>
      </form>

      {/* LISTA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-4">
          Servidores cadastrados
        </h2>

        {carregando ? (
          <p className="text-xs text-slate-400 font-medium">Carregando...</p>
        ) : servidores.length === 0 ? (
          <p className="text-xs text-slate-400 font-medium">
            Nenhuma conta de servidor cadastrada ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {servidores.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3"
              >
                <div className="w-9 h-9 rounded-full bg-blue-50 text-[#091f75] flex items-center justify-center shrink-0">
                  <UserRound size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 truncate">
                    {s.nome_completo}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {s.email}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-[#091f75] bg-blue-50 px-2.5 py-1 rounded-md shrink-0">
                  {s.municipio}
                </span>
                <button
                  onClick={() => handleRemover(s)}
                  disabled={removendoId === s.id}
                  title="Remover acesso"
                  className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
                >
                  {removendoId === s.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}