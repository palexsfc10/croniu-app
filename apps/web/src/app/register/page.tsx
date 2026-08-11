import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default function RegisterPage() {
  return (
    <AuthScreen
      title="Criar conta"
      subtitle="Sua organização começa com você como administrador."
      backHref="/"
    >
      <RegisterForm />
    </AuthScreen>
  );
}
