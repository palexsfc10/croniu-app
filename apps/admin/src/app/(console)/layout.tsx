import { AdminAuthProvider } from "@/components/auth/admin-auth-provider";
import { AdminShell } from "@/components/admin-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  );
}
