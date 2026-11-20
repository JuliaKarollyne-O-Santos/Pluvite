// app/loading.tsx
// Aparece enquanto a próxima página carrega. Cobre só a área do conteúdo (tela-cheia: abaixo da
// navbar e ao lado da sidebar) e fica por baixo dos menus, para eles não piscarem a cada troca.
export default function Loading() {
  return (
    <div className="tela-cheia z-[40] flex items-center justify-center bg-fundo">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[#0b1f6e] animate-pulse [animation-delay:-0.3s]" />
        <span className="w-2 h-2 rounded-full bg-[#0b1f6e] animate-pulse [animation-delay:-0.15s]" />
        <span className="w-2 h-2 rounded-full bg-[#0b1f6e] animate-pulse" />
      </div>
    </div>
  );
}
