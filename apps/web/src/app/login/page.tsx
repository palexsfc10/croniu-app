import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <AuthScreen title="Entrar" subtitle="Acesse sua rotina com segurança.">
      <LoginForm />
    </AuthScreen>
  );
}
