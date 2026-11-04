/* NÃO TIRAR NADA DAQUI. COLOCAR COISAS QUE PRECISAM SER FIXAS NO SITE.*/
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NavbarWrapper from "./components/NavbarWrapper";
import AlertaPopup from "./components/AlertaPopup";
import "./globals.css";
import Navbar from "./components/navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pluvite",
  description: "Plataforma de gestão de riscos e monitoramento",
  icons: {
    icon: "/Logo.png",
  },
};

// Celular: a página usa a tela toda (o "notch" do iPhone é tratado com env(safe-area-inset-*) no
// globals.css) e, no Android, o teclado encolhe a tela em vez de cobrir as gavetas do Mapa e de Rotas
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br">
      <body className="overflow-x-hidden ">
        <div className="mb-[var(--altura-navbar)] z-[9999]">
          <NavbarWrapper />
        </div>
        <main>{children}</main>
        {/* Pop-up de emergencia em tempo real (WebSocket) - vale para todas as paginas */}
        <AlertaPopup />
      </body>
    </html>
  );
}
