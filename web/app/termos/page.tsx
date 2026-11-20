import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Termos de Serviço | Pluvite",
  description: "Regras de uso da plataforma Pluvite.",
};

// Mesmo contato da Política de Privacidade (app/privacidade/page.tsx).
const EMAIL_CONTATO = "juliakarollyne3m@gmail.com";
const ATUALIZADO_EM = "19 de novembro de 2026";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-slate-200 pt-6">
      <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      <div className="space-y-2.5 text-[15px] leading-7 text-slate-600">{children}</div>
    </section>
  );
}

export default function Termos() {
  return (
    <main className="min-h-dvh w-full bg-fundo px-4 py-10 sm:py-14 font-sans antialiased">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0f35a0] transition-colors"
        >
          <ArrowLeft size={15} />
          Voltar ao início
        </Link>

        <article className="mt-6 rounded-md border border-slate-200 bg-white p-6 sm:p-12 space-y-6">
          <header className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">Termos de Serviço</h1>
            <p className="text-sm text-slate-500">Última atualização: {ATUALIZADO_EM}</p>
            <p className="text-[15px] leading-7 text-slate-600">
              Estes termos regulam o uso do Pluvite, plataforma de monitoramento de chuvas e alertas de risco que
              conecta cidadãos e prefeituras. Ao criar uma conta ou usar a plataforma, você concorda com eles.
            </p>
          </header>

          <Secao titulo="1. O serviço">
            <p>
              O Pluvite reúne dados meteorológicos, alertas e ocorrências relatadas por usuários para ajudar
              cidadãos e órgãos públicos a se prevenirem contra chuvas fortes, alagamentos e deslizamentos. A
              plataforma é oferecida gratuitamente e pode mudar, ganhar ou perder funções a qualquer momento.
            </p>
          </Secao>

          <Secao titulo="2. Não substitui os órgãos oficiais">
            <p>
              Os alertas e previsões do Pluvite são informativos e podem conter atrasos ou imprecisões. Eles{" "}
              <strong>não substituem</strong> os avisos da Defesa Civil e de outros órgãos oficiais. Em caso de
              emergência, ligue para a <strong>Defesa Civil (199)</strong>, o <strong>Corpo de Bombeiros (193)</strong>{" "}
              ou o <strong>SAMU (192)</strong>.
            </p>
          </Secao>

          <Secao titulo="3. Sua conta">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Você deve informar dados verdadeiros e manter seu cadastro atualizado.</li>
              <li>Você é responsável por manter sua senha em segredo e pelas ações feitas na sua conta.</li>
              <li>
                Contas de prefeituras e de administradores são criadas pela equipe Pluvite e devem ser usadas apenas
                por pessoas autorizadas.
              </li>
            </ul>
          </Secao>

          <Secao titulo="4. Uso adequado">
            <p>Ao usar o Pluvite, você se compromete a não:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>registrar ocorrências falsas ou enganosas;</li>
              <li>publicar conteúdo ofensivo, discriminatório, ilegal ou que viole direitos de outras pessoas;</li>
              <li>enviar fotos que exponham pessoas sem necessidade ou sem autorização;</li>
              <li>tentar acessar dados de outros usuários ou prejudicar o funcionamento da plataforma.</li>
            </ul>
            <p>
              Conteúdos que descumpram estas regras podem ser removidos, e a conta responsável pode ser suspensa.
            </p>
          </Secao>

          <Secao titulo="5. Conteúdo enviado por você">
            <p>
              As ocorrências, fotos e comentários continuam sendo seus. Ao publicá-los, você autoriza o Pluvite a
              exibi-los na plataforma e a encaminhá-los às prefeituras participantes para fins de prevenção e
              atendimento.
            </p>
          </Secao>

          <Secao titulo="6. Privacidade">
            <p>
              O tratamento dos seus dados pessoais está descrito na{" "}
              <Link href="/privacidade" className="font-medium text-[#0f35a0] underline underline-offset-2">
                Política de Privacidade
              </Link>
              .
            </p>
          </Secao>

          <Secao titulo="7. Limitação de responsabilidade">
            <p>
              O Pluvite é oferecido &quot;como está&quot;. Não garantimos que a plataforma estará sempre disponível
              ou livre de erros, e não nos responsabilizamos por decisões tomadas apenas com base nas informações
              exibidas nela.
            </p>
          </Secao>

          <Secao titulo="8. Encerramento">
            <p>
              Você pode deixar de usar o Pluvite e pedir a exclusão da sua conta quando quiser. Podemos suspender
              contas que violem estes termos.
            </p>
          </Secao>

          <Secao titulo="9. Alterações e contato">
            <p>
              Estes termos podem ser atualizados, e a data da última atualização fica no topo desta página. Dúvidas:{" "}
              <a href={`mailto:${EMAIL_CONTATO}`} className="font-medium text-[#0f35a0] underline underline-offset-2">
                {EMAIL_CONTATO}
              </a>
              . Estes termos seguem as leis brasileiras.
            </p>
          </Secao>
        </article>
      </div>
    </main>
  );
}
