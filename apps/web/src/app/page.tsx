import Link from "next/link";
import { BrandWordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-end px-5 pb-10 pt-16">
      <div className="animate-fade-up space-y-6">
        <BrandWordmark size="xl" surface="light" />
        <div className="space-y-3">
          <h1 className="h-display text-3xl leading-tight text-[var(--color-ink)]">
            Sua rotina. Seus ciclos. Tudo sob controle.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-[var(--color-ink-muted)]">
            Assistente de rotina e renovações para profissionais com clientes recorrentes.
          </p>
        </div>
        <div className="flex flex-col gap-3 animate-fade-up-delay sm:flex-row">
          <Link href="/register" className="sm:flex-1">
            <Button fullWidth>Começar</Button>
          </Link>
          <Link href="/login" className="sm:flex-1">
            <Button fullWidth variant="secondary">
              Entrar
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
