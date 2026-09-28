"use client";
import Link from "next/link";
import {
  Map,
  Rss,
  CloudSun,
  Compass,
  ShieldCheck,
  BellRing,
  Building2,
  AlertTriangle,
  Smartphone,
  CloudLightning,
  PhoneCall,
  Activity,
  Users,
  Database,
  Siren,
  Navigation,
  ArrowRight,
} from "lucide-react";

// ─── Scroll util ──────────────────────────────────────────────────────────────
const scrollTo = (id: string) => {
  const scrollContainer = document.querySelector(".overflow-y-auto");
  const el = document.getElementById(id);
  if (el && scrollContainer) {
    const containerTop = scrollContainer.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    const top = scrollContainer.scrollTop + elTop - containerTop - 80;
    scrollContainer.scrollTo({ top, behavior: "smooth" });
  }
};

export default function Home() {
  return (
    <div className="fixed h-screen w-full overflow-y-auto bg-slate pt-12 font-sans antialiased text-slate-800 -mt-10">
      <main>
        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section
          id="hero"
          className="max-w-5xl mx-auto px-6 pt-8 pb-20 flex flex-col items-center text-center gap-10"
        >
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[#ccddff] bg-[#eff5ff] text-slate-700 text-xs font-bold tracking-widest uppercase shadow-sm">
            <Activity size={13} className="text-[#2C4A6F]" />
            Monitoramento do Vale do Paraíba e Litoral Norte
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-950 leading-[1.1] max-w-3xl -mt-3">
            Sistema de Monitoramento{" "}
            <span className="text-[#0d43af]">de Riscos do Vale do Paraíba</span>
          </h1>

          <p className="text-lg text-slate-800 font-medium max-w-4xl leading-relaxed -mt-4">
            Desenvolvido para a região do Vale do Paraíba e Litoral Norte, o
            Pluvite é um sistema de monitoramento de desastres naturais. Com o
            objetivo de prevenir enchentes, deslizamentos e outras complicações
            decorrentes de chuvas intensas, ventos fortes e infraestrutura
            danificada, a plataforma envia alertas em tempo real à população. O
            sistema possui um mapa interativo que exibe os níveis de risco das
            cidades, além de dados meteorológicos atualizados, e um feed
            colaborativo para que os moradores relatem incidentes.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-1">
            <Link href="/cadastro-cidadao">
              <button className="bg-[#0d43af] hover:bg-[#0c2b6b] text-white font-bold text-base px-9 py-4 rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-md">
                Iniciar sessão
                <img
                  src="/seta-pro-lado.png"
                  alt="Seguir"
                  width={18}
                  height={18}
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              </button>
            </Link>
            <button
              className="border border-[#0d43af] bg-white hover:bg-slate-100 text-slate-900 font-bold text-base px-9 py-4 rounded-lg transition-colors cursor-pointer shadow-sm"
              onClick={() => scrollTo("emergencia")}
            >
              Contatos de Emergência
            </button>
          </div>
        </section>

        <div className="border-t border-slate-300 my-5" />

        <section id="painel" className="max-w-6xl mx-auto px-6 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
            <div>
              <span className="text-md font-bold text-[#2C4A6F] uppercase tracking-widest">
                Dados unificados
              </span>
              <h2 className="text-5xl font-extrabold text-slate-950 mt-4 leading-snug">
                Análise e Despacho Integrado
              </h2>
              <p className="text-base text-slate-800 font-medium mt-5">
                O Pluvite centraliza chamados, monitora cidades criticamente
                afetadas e oferece suporte visual imediato para equipes de
                resposta.
              </p>
            </div>

            <div className="lg:col-span-2 border border-[#ccddff] bg-white rounded-2xl p-8 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-200 pb-5 mb-8">
                <div className="flex items-center gap-2.5">
                  <img src="/grafico.png" alt="Painel" width={18} height={18} />
                  <span className="text-base font-bold text-slate-900">
                    Visão Geral do Painel
                  </span>
                </div>
                <span className="text-xs font-bold text-black border border-[#ccddff] bg-[#eff5ff] px-3 py-1.5 rounded-md">
                  Atualizado agora
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                {[
                  { label: "Chamados", value: "6", bg: "bg-[#e8000e]" },
                  { label: "Críticos", value: "3", bg: "bg-[#1e0972]" },
                  { label: "Andamento", value: "2", bg: "bg-[#f18200]" },
                  { label: "Concluídos", value: "0", bg: "bg-[#006b26]" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`${s.bg} rounded-xl p-4 text-center shadow-sm`}
                  >
                    <p className="text-3xl font-extrabold text-white">
                      {s.value}
                    </p>
                    <p className="text-xs text-white/85 font-bold mt-2">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>

              <div>
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Ocorrências por Município
                </span>
                <div className="h-28 flex items-end gap-3 pt-5 border-b border-slate-300 px-1 mt-4">
                  {[
                    { h: "70%" },
                    { h: "95%" },
                    { h: "45%" },
                    { h: "20%" },
                    { h: "60%" },
                  ].map((bar, i) => (
                    <div
                      key={i}
                      className="bg-[#1351cb] w-full rounded-t-sm"
                      style={{ height: bar.h }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-slate-700 font-bold px-1 mt-3">
                  <span>Taubaté</span>
                  <span>Campos do Jordão</span>
                  <span>Ubatuba</span>
                  <span>Cunha</span>
                  <span>Lagoinha</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-slate-300 my-5" />

        {/* ── RECURSOS ──────────────────────────────────────────────────────── */}
        <section id="recursos" className="max-w-6xl mx-auto px-6 py-24">
          <span className="text-sm font-bold text-[#2C4A6F] uppercase tracking-widest">
            Recursos
          </span>
          <h2 className="text-5xl font-extrabold mt-4 mb-12 text-slate-950">
            Ecossistema do Sistema
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Map,
                title: "Mapa Interativo",
                desc: "Exibe os polígonos de risco e a situação de alerta de cada município em tempo real.",
                bgColor: "#f7f7f7",
                hoverBorder: "hover:border-[#006b26]",
                iconColor: "text-[#006b26]",
              },
              {
                icon: Rss,
                title: "Feed Colaborativo",
                desc: "Permite publicar ocorrências locais com fotos e texto, alimentando o mapa em tempo real.",
                bgColor: "#f7f7f7",
                hoverBorder: "hover:border-[#e8000e]",
                iconColor: "text-[#e8000e]",
              },
              {
                icon: CloudSun,
                title: "Dados Climáticos",
                desc: "Acompanhamento de índices pluviométricos e alertas meteorológicos integrados.",
                bgColor: "#f7f7f7",
                hoverBorder: "hover:border-[#e47c00]",
                iconColor: "text-[#e47c00]",
              },
              {
                icon: Compass,
                title: "Rotas Inteligentes",
                desc: "Rotas alternativas calculadas automaticamente para evitar locais bloqueados ou inundados.",
                bgColor: "#f7f7f7",
                hoverBorder: "hover:border-[#00b277]",
                iconColor: "text-[#00b277]",
              },
            ].map(({ icon: Icon, title, desc, bgColor, hoverBorder, iconColor }) => (
              <div
                key={title}
                style={{ backgroundColor: bgColor }}
                className={`border border-slate-200 p-7 rounded-2xl ${hoverBorder} transition-colors duration-200 cursor-pointer shadow-sm`}
              >
                <Icon size={22} className={`${iconColor} mb-5`} />
                <h3 className="font-bold text-slate-900 text-base mb-2.5">
                  {title}
                </h3>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-slate-300 my-5" />

        {/* ── COMUNICAÇÃO ───────────────────────────────────────────────────── */}
        <section id="comunicacao" className="max-w-6xl mx-auto px-6 pt-2 pb-24">
          <span className="text-sm font-bold text-[#2C4A6F] uppercase tracking-widest">
            Comunicação
          </span>
          <h2 className="text-5xl font-extrabold text-slate-950 mt-4 mb-3">
            Comunicação Direta com as Prefeituras
          </h2>
          <p className="text-base text-slate-800 font-medium max-w-2xl mb-12">
            O projeto aprimora a comunicação entre cidadãos e prefeituras,
            reforçando a segurança e minimizando os efeitos de desastres
            naturais.
          </p>

          {/* 3 pilares */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">
            {[
              {
                icon: ShieldCheck,
                title: "Prevenção Direta",
                desc: "Evita acidentes estruturais e logísticos graves.",
                bg: "bg-[#006b26]",
              },
              {
                icon: BellRing,
                title: "Alertas em Tempo Real",
                desc: "Notificações críticas para a população.",
                bg: "bg-[#e8000e]",
              },
              {
                icon: Building2,
                title: "Integração Municipal",
                desc: "Respostas rápidas das defesas civis.",
                bg: "bg-[#eb8000]",
              },
            ].map(({ icon: Icon, title, desc, bg }) => (
              <div
                key={title}
                className={`${bg} rounded-2xl p-6 flex gap-5 shadow-md`}
              >
                <Icon size={22} className="text-white flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white text-base">{title}</h4>
                  <p className="text-sm text-white/85 font-medium mt-1.5">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Fluxo de comunicação */}
          <div className="border border-slate-200 bg-white rounded-2xl p-8 mb-10 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-8">
              Fluxo de Comunicação
            </h3>
            <div className="grid grid-cols-5 gap-3 items-start">
              {[
                {
                  icon: Users,
                  titulo: "Cidadão reporta",
                  desc: "Relato via app com foto e localização",
                  color: "text-[#e47c00]",
                  bgColor: "bg-[#ffd29d]/30",
                },
                {
                  icon: Database,
                  titulo: "Sistema processa",
                  desc: "Riscos classificados por urgência",
                  color: "text-[#2C4A6F]",
                  bgColor: "bg-slate-100",
                },
                {
                  icon: Siren,
                  titulo: "Alerta gerado",
                  desc: "Notificação enviada à região",
                  color: "text-[#e8000e]",
                  bgColor: "bg-[#ffb7bb]/30",
                },
                {
                  icon: Building2,
                  titulo: "Prefeitura recebe",
                  desc: "Painel atualizado com o chamado",
                  color: "text-[#006b26]",
                  bgColor: "bg-[#c0ffd6]/30",
                },
                {
                  icon: Navigation,
                  titulo: "Equipe despachada",
                  desc: "Resposta rápida para o local",
                  color: "text-[#00b277]",
                  bgColor: "bg-[#d7fff2]/30",
                },
              ].map(({ icon: Icon, titulo, desc, color, bgColor }, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center text-center gap-3 relative"
                >
                  <div
                    className={`w-11 h-11 border border-slate-300 ${bgColor} rounded-xl flex items-center justify-center`}
                  >
                    <Icon size={18} className={color} />
                  </div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">
                    {titulo}
                  </p>
                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed hidden sm:block">
                    {desc}
                  </p>
                  {i < 4 && (
                    <ArrowRight
                      size={14}
                      className="hidden sm:block absolute -right-3 top-3.5 text-slate-400"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Municípios */}
          <div className="border border-slate-200 bg-white rounded-2xl p-8 mb-14 shadow-sm">
            <div className="flex items-center justify-between mb-7">
              <h3 className="text-base font-bold text-slate-900">
                Principais Municípios Monitorados
              </h3>
              <span className="text-xs font-bold text-[#0d43af] bg-[#0d43af]/5 border border-[#0d43af]/15 px-3.5 py-1.5 rounded-full">
                39 municípios
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8">
              {[
                "Taubaté",
                "São José dos Campos",
                "Jacareí",
                "Pindamonhangaba",
                "Guaratinguetá",
                "Lorena",
                "Campos do Jordão",
                "Ubatuba",
                "Caraguatatuba",
                "São Sebastião",
                "Cunha",
                "Lagoinha",
                "Tremembé",
                "Caçapava",
                "Aparecida",
                "Potim",
              ].map((cidade) => (
                <div
                  key={cidade}
                  className="flex items-center gap-2.5 text-sm text-slate-700 py-3 font-semibold border-b border-slate-100 last:sm:border-b last:border-0"
                >
                  <img
                    src="/localizacao-vermelha.png"
                    alt="Local"
                    width={11}
                    height={11}
                    className="flex-shrink-0"
                  />
                  {cidade}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-100">
              <p className="text-sm text-slate-500 font-medium">
                + 23 municípios adicionais na região
              </p>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Vale do Paraíba • Litoral Norte
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-10 border-t border-slate-300 text-center">
            {[
              { value: "39", label: "Municípios Monitorados" },
              { value: "100%", label: "Colaborativo" },
              { value: "Tempo real", label: "Atualização contínua" },
              { value: "+3M", label: "Cidadãos protegidos" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-3xl font-extrabold text-slate-950">
                  {value}
                </p>
                <p className="text-xs text-slate-600 uppercase tracking-wider font-bold mt-2">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-slate-300 my-5" />

        {/* ── CATEGORIZAÇÃO ─────────────────────────────────────────────────── */}
        <section id="riscos" className="max-w-6xl mx-auto px-6 pt-20 pb-24">
          <span className="text-sm font-bold text-[#2C4A6F] uppercase tracking-widest">
            Categorização
          </span>
          <h2 className="text-5xl font-extrabold text-slate-950 mt-4 mb-3">
            Categorização de Riscos
          </h2>
          <p className="text-base text-slate-800 font-medium max-w-xl mb-12">
            O sistema analisa dados pluviométricos e relatos em tempo real para
            classificar cada região em quatro categorias.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
            {[
              {
                bg: "bg-[#7c3aed]",
                title: "Alerta Máximo",
                desc: "Inundações iminentes ou deslizamentos detectados.",
              },
              {
                bg: "bg-[#e8000e]",
                title: "Estado de Alerta",
                desc: "Índice de chuva crítico acumulado.",
              },
              {
                bg: "bg-[#e47c00]",
                title: "Atenção Crítica",
                desc: "Previsão de tempestades severas na região.",
              },
              {
                bg: "bg-[#008d17]",
                title: "Zona Segura",
                desc: "Condições estáveis e normais.",
              },
            ].map(({ bg, title, desc }) => (
              <div key={title} className={`${bg} p-6 rounded-2xl shadow-md`}>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-white" />
                  <h3 className="font-extrabold text-base text-white">
                    {title}
                  </h3>
                </div>
                <p className="text-sm text-white/90 leading-relaxed font-bold">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-slate-300 my-5" />

        {/* ── EMERGÊNCIA ────────────────────────────────────────────────────── */}
        <section id="emergencia" className="max-w-6xl mx-auto px-6 pt-10 pb-24">
          <div className="flex items-start gap-5 mb-10 -mt-6">
            <div className="w-12 h-12 border border-slate-300 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
              <img src="/telefone.png" alt="Telefone" width={20} height={20} />
            </div>
            <div>
              <span className="text-sm font-bold text-[#e8000e] uppercase tracking-widest">
                Emergência
              </span>
              <h2 className="text-3xl font-extrabold text-slate-950 mt-2">
                Números de Emergência
              </h2>
              <p className="text-base text-slate-800 font-medium mt-2 max-w-xl">
                Em caso de riscos iminentes, acione o socorro imediatamente. A
                rapidez no acionamento pode salvar vidas. Mantenha esses
                números salvos.
              </p>
            </div>
          </div>

          {/* Números */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
            {[
              { label: "Defesa Civil", numero: "199", bg: "bg-[#00b277]" },
              { label: "Bombeiros", numero: "193", bg: "bg-[#e8000e]" },
              { label: "SAMU", numero: "192", bg: "bg-[#2563eb]" },
            ].map(({ label, numero, bg }) => (
              <div
                key={label}
                className={`${bg} rounded-2xl p-7 text-center shadow-lg`}
              >
                <p className="text-xs font-bold text-white/80 uppercase tracking-wider mb-3">
                  {label}
                </p>
                <p className="text-5xl font-black text-white">{numero}</p>
              </div>
            ))}
          </div>

          {/* Instruções */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                title: "Em caso de enchente",
                bulletColor: "text-[#00b277]",
                items: [
                  "Desligue a energia elétrica",
                  "Suba para locais altos imediatamente",
                  "Não atravesse áreas alagadas",
                  "Ligue 199 para a Defesa Civil",
                ],
              },
              {
                title: "Em caso de deslizamento",
                bulletColor: "text-[#e8000e]",
                items: [
                  "Afaste-se da encosta imediatamente",
                  "Não retorne ao imóvel",
                  "Procure abrigo seguro",
                  "Avise vizinhos em risco",
                ],
              },
              {
                title: "Kit de emergência",
                bulletColor: "text-[#2563eb]",
                items: [
                  "Documentos em saco plástico",
                  "Água e alimentos não perecíveis",
                  "Lanternas e pilhas extras",
                  "Medicamentos essenciais",
                ],
              },
            ].map(({ title, items, bulletColor }) => (
              <div
                key={title}
                className="border border-slate-300 bg-white rounded-2xl p-7 shadow-sm"
              >
                <div className="flex items-center gap-2.5 mb-5">
                  <AlertTriangle size={15} className="text-[#e8000e]" />
                  <h5 className="text-base font-bold text-slate-900">
                    {title}
                  </h5>
                </div>
                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="text-sm text-slate-800 flex gap-2.5 font-bold"
                    >
                      <span className={`${bulletColor} mt-0.5`}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-slate-300 my-5" />

        {/* ── APP ───────────────────────────────────────────────────────────── */}
        <section
          id="app"
          className="max-w-6xl mx-auto px-6 py-12 bg-gradient-to-b from-transparent to-slate-50/50 rounded-3xl mb-17 pt-2"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Bloco de Textos, Recursos e Downloads */}
            <div className="lg:col-span-7 flex flex-col justify-start w-full">
              <span className="text-sm font-bold text-[#0d43af] uppercase tracking-widest bg-[#0d43af]/10 px-3 py-1.5 rounded-full w-fit">
                Tecnologia na sua Mão
              </span>
              <h2 className="text-4xl md:text-5xl font-extrabold text-slate-950 mt-4 leading-tight">
                Conheça o Nosso <br /> Aplicativo Móvel
              </h2>
              <p className="text-base text-slate-700 font-medium mt-4 w-full">
                Uma experiência rápida, moderna e intuitiva feita para manter
                você e sua comunidade informados e seguros a qualquer momento
                do dia.
              </p>

              {/* Lista de Recursos Detalhados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 w-full">
                {[
                  {
                    icon: <Smartphone className="text-[#0d43af]" size={22} />,
                    title: "Acesso Rápido",
                    desc: "Autenticação simples integrada às suas redes sociais favoritas para um login imediato.",
                  },
                  {
                    icon: <ShieldCheck className="text-emerald-600" size={22} />,
                    title: "Cadastro Seguro",
                    desc: "Ambiente protegido para criação de perfis pessoais ou credenciais institucionais validadas.",
                  },
                  {
                    icon: <CloudLightning className="text-amber-500" size={22} />,
                    title: "Painel de Clima",
                    desc: "Acompanhe as condições meteorológicas locais e receba alertas críticos em tempo real.",
                  },
                  {
                    icon: <PhoneCall className="text-rose-600" size={22} />,
                    title: "Canais de Ajuda",
                    desc: "Acione a central de emergência e canais de socorro diretamente com apenas um clique.",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex gap-4 p-4 rounded-xl border border-slate-200/60 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300 w-full"
                  >
                    <div className="p-2.5 bg-slate-50 rounded-lg h-fit flex items-center justify-center flex-shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Botões de Download */}
              <div className="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-slate-300 w-full">
                <button className="flex items-center gap-3 bg-[#0f35a0] hover:bg-[#091f75] text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-md active:scale-95">
                  <span className="font-medium">Disponível no</span>
                  <span className="font-black text-sm border-l border-white/20 pl-3">
                    Google Play
                  </span>
                </button>
                <button className="flex items-center gap-3 text-slate-950 bg-zinc hover:bg-zinc-100 border border-zinc-300 shadow-sm px-5 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer active:scale-95">
                  <span className="font-medium">Baixar para</span>
                  <span className="font-black text-sm border-l border-slate-300 pl-3">
                    iOS App Store
                  </span>
                </button>
              </div>

              {/* QR Code */}
              <div className="mt-6 flex items-center gap-5 select-none">
                <div className="w-[200px] h-[200px] bg-white border border-zinc-200 shadow-[1px_1px_5px_0px_rgba(9,28,75,0.2)] rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src="/qrcode-pluvite.png"
                    alt="QRCode"
                    className="w-full h-full object-cover flex-shrink-0"
                  />
                </div>
                <div className="flex flex-col items-start gap-2 max-w-[240px]">
                  <p className="text-sm font-bold text-slate-700 leading-snug">
                    Ou escaneie o QR Code para fazer o download direto
                  </p>
                  <img
                    src="/seta-pra-esquerda.png"
                    alt="Seta"
                    width={32}
                    height={32}
                    className="transform -rotate-45 flex-shrink-0"
                  />
                </div>
              </div>
            </div>

            {/* Exibição dos Mockups */}
            <div className="lg:col-span-5 flex justify-center items-center relative w-full">
              <div className="absolute w-80 h-80 bg-[#0d43af]/5 rounded-full blur-3xl -z-10" />

              <div className="grid grid-cols-2 gap-x-8 gap-y-12 max-w-[380px] w-full">
                {[
                  { src: "/app-login.png", pos: "" },
                  { src: "/app-cadastro.png", pos: "translate-y-6" },
                  { src: "/app-clima.jpg", pos: "-translate-y-4" },
                  { src: "/app-contatos.jpg", pos: "translate-y-2" },
                ].map((img, idx) => (
                  <div
                    key={idx}
                    className={`relative rounded-sm p-1 bg-white ring-1 ring-slate-200 shadow-xl transition-all duration-300 transform ${img.pos}`}
                  >
                    <div className="overflow-hidden rounded-sm bg-slate-100 aspect-[9/19]">
                      <img
                        src={img.src}
                        alt="App Screen"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-[#091c4b] px-6 py-8 text-white shadow-inner select-none">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo + Nome */}
          <div className="flex items-center gap-3">
            <img
              src="/PluviteIcon.jpg"
              alt="Logo Pluvite"
              className="w-12 h-12 rounded-xl object-cover shadow-md flex-shrink-0"
            />
            <span className="font-black text-white text-2xl tracking-tight">
              Pluvite
            </span>
          </div>

          {/* GitHub */}
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-xs text-slate-400 font-medium">
            <span className="text-slate-300 font-semibold">
              Vale do Paraíba • Litoral Norte
            </span>
            <a
              href="https://github.com/juliasantos-Git/Pluvite"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white px-5 py-3 rounded-xl border border-white/10 transition-all duration-200 shadow-sm"
              title="Acessar código-fonte no GitHub"
            >
              <img
                src="/github.png"
                alt="GitHub"
                className="w-5 h-5"
                style={{ filter: "brightness(0) invert(1)" }}
              />
              <span className="font-extrabold text-sm tracking-wider">
                GitHub
              </span>
            </a>
          </div>
        </div>
        {/* ── BOTÃO SCROLL TO TOP ─────────────────────────────────────────────── */}
        <button
          onClick={() => scrollTo("hero")}
          className="fixed bottom-6 right-6 p-3.5 rounded-full bg-[#0d43af] hover:bg-[#133986] text-white shadow-lg transition-all duration-300 hover:-translate-y-1 active:scale-95 z-50 group cursor-pointer"
          title="Voltar ao topo"
        >
          <img
            src="/seta-pra-cima.png"
            alt="Voltar ao topo"
            width={20}
            height={20}
            className="transition-transform duration-300 group-hover:scale-110"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </button>
      </footer>
    </div>
  );
}

