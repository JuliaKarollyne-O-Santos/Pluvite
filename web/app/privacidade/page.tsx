import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Política de Privacidade | Pluvite",
  description: "Como o Pluvite coleta, usa e protege os seus dados.",
};

// E-mail exibido para dúvidas e pedidos sobre dados pessoais (LGPD).
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

export default function Privacidade() {
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
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">Política de Privacidade</h1>
            <p className="text-sm text-slate-500">Última atualização: {ATUALIZADO_EM}</p>
            <p className="text-[15px] leading-7 text-slate-600">
              O Pluvite é uma plataforma de monitoramento de chuvas e alertas de risco que conecta cidadãos e
              prefeituras. Esta política explica quais dados coletamos, para que os usamos e quais são os seus
              direitos, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 – LGPD).
            </p>
          </header>

          <Secao titulo="1. Dados que coletamos">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Dados de cadastro:</strong> nome, e-mail e senha (guardada de forma criptografada).
              </li>
              <li>
                <strong>Login com Google ou Facebook:</strong> nome, e-mail e foto de perfil fornecidos pelo
                provedor. Não temos acesso à sua senha dessas contas.
              </li>
              <li>
                <strong>Dados de perfil (opcionais):</strong> telefone, data de nascimento, cidade, bairro, CEP,
                foto e banner de perfil.
              </li>
              <li>
                <strong>Informações para emergências (opcionais):</strong> tipo sanguíneo, alergias, condições
                médicas, medicamentos em uso, se é pessoa com deficiência e contato de emergência. Esses dados
                são sensíveis e só são coletados se você os informar.
              </li>
              <li>
                <strong>Ocorrências e interações:</strong> relatos, fotos, endereço e localização das ocorrências
                que você registra, além de comentários e curtidas.
              </li>
              <li>
                <strong>Localização:</strong> usada, com a sua permissão, para mostrar alertas e rotas seguras
                próximos de você.
              </li>
              <li>
                <strong>Notificações:</strong> identificador do dispositivo para envio de alertas e as suas
                preferências de notificação.
              </li>
            </ul>
          </Secao>

          <Secao titulo="2. Para que usamos os dados">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Criar e manter a sua conta e permitir o login.</li>
              <li>Enviar alertas de chuva forte, alagamento e deslizamento para a sua região.</li>
              <li>Mostrar e encaminhar às prefeituras as ocorrências registradas.</li>
              <li>Sugerir rotas mais seguras durante eventos de chuva.</li>
              <li>Apoiar o atendimento em emergências, quando você informar dados de saúde.</li>
            </ul>
            <p>Não vendemos seus dados e não os usamos para publicidade.</p>
          </Secao>

          <Secao titulo="3. Compartilhamento">
            <p>
              As ocorrências que você registra podem ser vistas por outros usuários e pelas equipes das prefeituras
              participantes, para que possam agir. Os dados também são processados pelos serviços que mantêm a
              plataforma funcionando (hospedagem, banco de dados e envio de notificações), apenas para essa
              finalidade. Podemos compartilhar dados quando exigido por lei ou por autoridade competente.
            </p>
          </Secao>

          <Secao titulo="4. Armazenamento e segurança">
            <p>
              Os dados ficam em servidores com acesso restrito e regras de segurança que limitam o que cada usuário
              pode ver. As senhas são armazenadas criptografadas. Mantemos os dados enquanto a sua conta estiver
              ativa ou pelo tempo necessário para cumprir obrigações legais.
            </p>
          </Secao>

          <Secao titulo="5. Seus direitos">
            <p>Pela LGPD, você pode a qualquer momento:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>confirmar se tratamos seus dados e acessá-los;</li>
              <li>corrigir dados incompletos ou desatualizados (pela página de perfil);</li>
              <li>pedir a exclusão da sua conta e dos seus dados;</li>
              <li>revogar o consentimento, por exemplo, desativando a localização ou as notificações.</li>
            </ul>
          </Secao>

          <Secao titulo="6. Contato">
            <p>
              Para dúvidas ou pedidos sobre seus dados, incluindo a exclusão da conta, escreva para{" "}
              <a href={`mailto:${EMAIL_CONTATO}`} className="font-medium text-[#0f35a0] underline underline-offset-2">
                {EMAIL_CONTATO}
              </a>
              .
            </p>
          </Secao>

          <Secao titulo="7. Alterações">
            <p>
              Esta política pode ser atualizada. A data da última atualização fica sempre no topo desta página.
            </p>
          </Secao>
        </article>
      </div>
    </main>
  );
}
