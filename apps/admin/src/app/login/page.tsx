import type { Metadata } from "next";
import { AdminAuthScreen } from "@/components/auth/admin-auth-screen";
import { AdminLoginForm } from "@/components/auth/admin-login-form";

export const metadata: Metadata = { title: "Login" };

export default function AdminLoginPage() {
  return (
    <AdminAuthScreen
      title="Entrar"
      subtitle="Sessão administrativa separada da conta do profissional."
      backHref="/"
    >
      <AdminLoginForm />
    </AdminAuthScreen>
  );
}
