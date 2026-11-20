"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Building2,
  CalendarDays,
  Clock,
  History,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  ShieldCheck,
  User,
} from "lucide-react";
import { supabase } from "@/app/lib/banco";

// Conta de uma prefeitura: dados do acesso, troca de senha e atalhos.
// Mesma verificação do painel (/Prefeituras): só contas cadastradas na tabela "servidor".
type DadosConta = {
  nome: string;
  municipio: string;
  email: string;
  criadoEm: string | null;
  ultimoAcesso: string | null;
};

const formatarData = (iso: string | null, comHora = false) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", comHora ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" })
    : "—";

const CAMPO =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#0b1f6e] focus:ring-2 focus:ring-[#0b1f6e]/15";

export default function ContaPrefeitura() {
  const router = useRouter();
  const [conta, setConta] = useState<DadosConta | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    const carregar = async () => {
      const { data } = await supabase.auth.getUser();
      const usuario = data.user;
      if (!usuario) {
        router.replace("/login");
        return;
      }
      const { data: servidor } = await supabase
        .from("servidor")
        .select("nome_completo, municipio, email, criado_em")
        .eq("auth_id", usuario.id)
        .maybeSingle();
      if (!servidor) {
        router.replace("/login");
        return;
      }
      setConta({
        nome: servidor.nome_completo || "Servidor",
        municipio: servidor.municipio,
        email: servidor.email || usuario.email || "",
        criadoEm: servidor.criado_em ?? usuario.created_at ?? null,
        ultimoAcesso: usuario.last_sign_in_at ?? null,
      });
    };
    carregar();
  }, [router]);

  const handleTrocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);
    if (novaSenha.length < 6) {
      setMensagem({ tipo: "erro", texto: "A nova senha precisa ter pelo menos 6 caracteres." });
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setMensagem({ tipo: "erro", texto: "As senhas não coincidem." });
      return;
    }
    setSalvandoSenha(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSalvandoSenha(false);
    if (error) {
      setMensagem({ tipo: "erro", texto: `Não foi possível trocar a senha: ${error.message}` });
      return;
    }
    setNovaSenha("");
    setConfirmarSenha("");
    setMensagem({ tipo: "ok", texto: "Senha alterada com sucesso." });
  };

  const handleSair = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!conta) {
    return (
      <div className="min-h-dvh -mt-[var(--altura-navbar)] w-full flex items-center justify-center bg-fundo">
        <Loader2 size={22} className="text-[#0b1f6e] animate-spin" />
      </div>
    );
  }

  const dados = [
    { Icone: User, rotulo: "Responsável", valor: conta.nome },
    { Icone: MapPin, rotulo: "Município", valor: conta.municipio },
    { Icone: Mail, rotulo: "E-mail de acesso", valor: conta.email || "—" },
    { Icone: CalendarDays, rotulo: "Conta criada em", valor: formatarData(conta.criadoEm) },
    { Icone: Clock, rotulo: "Último acesso", valor: formatarData(conta.ultimoAcesso, true) },
  ];

  return (
    <div className="min-h-screen -mt-[var(--altura-navbar)] w-full font-sans text-slate-800 bg-fundo">
      <div className="pt-24 md:pt-8 md:px-6 pb-16">
        <div className="max-w-5xl mx-auto px-6 md:px-4 space-y-6">
          {/* CABEÇALHO */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Painel da Prefeitura · {conta.municipio}
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight mt-1">Minha conta</h1>
            <p className="text-sm text-slate-600 mt-1">Dados de acesso da prefeitura e segurança da conta.</p>
          </div>

          {/* FAIXA DA PREFEITURA */}
          <section className="bg-[#0b1f6e] text-white rounded-lg p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="w-12 h-12 rounded-md bg-white/10 flex items-center justify-center shrink-0">
              <Building2 size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold leading-tight">Prefeitura de {conta.municipio}</p>
              <p className="text-sm text-blue-100/80 mt-0.5 truncate">{conta.nome} · {conta.email}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start sm:self-auto text-xs font-medium bg-emerald-400/15 text-emerald-200 border border-emerald-300/30 px-2.5 py-1 rounded">
              <ShieldCheck size={13} />
              Conta verificada pela equipe Pluvite
            </span>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* DADOS DA CONTA */}
            <section className="lg:col-span-2 bg-white border border-slate-200 rounded-lg">
              <h2 className="px-5 pt-4 pb-3 text-sm font-semibold text-slate-900 border-b border-slate-200">
                Dados da conta
              </h2>
              <dl className="divide-y divide-slate-100">
                {dados.map(({ Icone, rotulo, valor }) => (
                  <div key={rotulo} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
                    <dt className="flex items-center gap-2.5 text-slate-500">
                      <Icone size={15} className="text-[#0f35a0]" />
                      {rotulo}
                    </dt>
                    <dd className="text-slate-900 font-medium text-right truncate">{valor}</dd>
                  </div>
                ))}
              </dl>
              <p className="px-5 py-3 text-xs text-slate-500 border-t border-slate-100">
                Para alterar o município ou o responsável, fale com a equipe Pluvite.
              </p>
            </section>

            {/* ATALHOS */}
            <section className="bg-sky-50 border border-sky-200 rounded-lg">
              <h2 className="px-5 pt-4 pb-3 text-sm font-semibold text-sky-950 border-b border-sky-200">Atalhos</h2>
              <ul className="p-2">
                {[
                  { href: "/Servidor/Emitir", Icone: BellRing, rotulo: "Emitir alerta à população", cor: "text-red-600" },
                  { href: "/Servidor", Icone: History, rotulo: "Histórico de alertas", cor: "text-[#0f35a0]" },
                  { href: "/Prefeituras", Icone: Building2, rotulo: "Voltar ao painel", cor: "text-slate-600" },
                ].map(({ href, Icone, rotulo, cor }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-slate-800 hover:bg-white transition-colors"
                    >
                      <Icone size={16} className={cor} />
                      {rotulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* TROCAR SENHA */}
            <section className="lg:col-span-2 bg-white border border-slate-200 rounded-lg">
              <h2 className="px-5 pt-4 pb-3 text-sm font-semibold text-slate-900 border-b border-slate-200 flex items-center gap-2">
                <KeyRound size={15} className="text-[#0f35a0]" />
                Alterar senha
              </h2>
              <form onSubmit={handleTrocarSenha} className="p-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    className={`${CAMPO} mt-1.5`}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Confirmar nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    className={`${CAMPO} mt-1.5`}
                  />
                </label>
                {mensagem && (
                  <p
                    role="status"
                    className={`sm:col-span-2 text-sm rounded-md border px-3 py-2 ${
                      mensagem.tipo === "ok"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-red-50 border-red-200 text-red-700"
                    }`}
                  >
                    {mensagem.texto}
                  </p>
                )}
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={salvandoSenha || !novaSenha}
                    className="inline-flex items-center gap-2 rounded-md bg-[#0b1f6e] hover:bg-[#0f35a0] px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {salvandoSenha && <Loader2 size={15} className="animate-spin" />}
                    Salvar nova senha
                  </button>
                </div>
              </form>
            </section>

            {/* SEGURANÇA / SAIR */}
            <section className="bg-amber-50 border border-amber-200 rounded-lg p-5 flex flex-col">
              <h2 className="text-sm font-semibold text-amber-950 flex items-center gap-2">
                <ShieldCheck size={15} className="text-amber-600" />
                Boas práticas
              </h2>
              <ul className="mt-3 space-y-2 text-[13px] text-amber-950 leading-snug flex-1">
                <li>Não compartilhe o acesso da prefeitura com pessoas fora da equipe.</li>
                <li>Revise sempre o alerta antes de enviar: ele notifica a população.</li>
                <li>Saia da conta ao usar computadores compartilhados.</li>
              </ul>
              <button
                onClick={handleSair}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-white hover:bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 transition-colors cursor-pointer"
              >
                <LogOut size={15} />
                Sair da conta
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
