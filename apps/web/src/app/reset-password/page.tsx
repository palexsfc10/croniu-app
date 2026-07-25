import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha",
};

export default function ResetPasswordPage() {
  return (
    <AuthScreen
      title="Nova senha"
      subtitle="Escolha uma senha forte para voltar a acessar o Croniu."
      backHref="/login"
    >
      <ResetPasswordForm />
    </AuthScreen>
  );
}
