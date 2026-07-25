import Link from "next/link";
import { BrandWordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function AdminLandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <div className="flex flex-wrap items-baseline gap-2">
        <BrandWordmark size="lg" surface="light" />
        <span className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          Admin
        </span>
      </div>
      <h1 className="mt-3 text-2xl font-semibold">Painel da plataforma</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Acesso restrito a operadores autorizados da NTWS Labs. Hostname pretendido a confirmar:
        admin.croniu.com.br
      </p>
      <div className="mt-6">
        <Link href="/login">
          <Button fullWidth>Entrar</Button>
        </Link>
      </div>
    </main>
  );
}
