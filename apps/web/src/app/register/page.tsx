import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default function RegisterPage() {
  return (
    <AuthScreen
      title="Crie sua conta"
      subtitle="Comece organizando sua rotina profissional."
      backHref="/"
    >
      <RegisterForm />
    </AuthScreen>
  );
}
