import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const metadata: Metadata = {
  title: "Verificar e-mail",
};

export default function VerifyEmailPage() {
  return (
    <AuthScreen
      title="Confirmar e-mail"
      subtitle="Valide o endereço usado no cadastro da sua conta Croniu."
      backHref="/login"
    >
      <VerifyEmailForm />
    </AuthScreen>
  );
}
