"use client";

import { useParams } from "next/navigation";
import { ClientProfile } from "@/components/app/client-profile";

export default function ClientDetailPage() {
  const params = useParams<{ clientId: string }>();
  return <ClientProfile clientId={params.clientId} />;
}
