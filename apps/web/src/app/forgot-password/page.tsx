import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Esqueci minha senha",
};

export default function ForgotPasswordPage() {
  return (
    <AuthScreen
      title="Esqueci minha senha"
      subtitle="Informe o e-mail da conta. Se ele existir, enviaremos as instruções."
      backHref="/login"
    >
      <ForgotPasswordForm />
    </AuthScreen>
  );
}
