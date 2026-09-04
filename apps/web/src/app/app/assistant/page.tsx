"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { AssistantExperience } from "@/components/app/assistant/assistant-experience";
import { useAssistantConversation } from "@/components/app/assistant/use-assistant-conversation";
import { personalGreeting } from "@/lib/greeting";

/**
 * The full-page Assistant — a deep link and a complete standalone
 * experience, independent of the global persistent layer (see
 * `assistant-layer/`). It owns its own `useAssistantConversation` instance,
 * seeded once from `?prompt=&context=&returnTo=` exactly like before this
 * fatia's refactor — every other page linking here (`AskAssistantLink`,
 * bookmarks, browser history) keeps working unchanged.
 */
export default function AssistantPage() {
  const { me } = useAuth();
  const search = useSearchParams();

  const greeting = useMemo(
    () => personalGreeting(me?.user.full_name, me?.organization.timezone),
    [me?.user.full_name, me?.organization.timezone],
  );

  const conversation = useAssistantConversation({
    initialPrompt: search.get("prompt") || "",
    initialContext: search.get("context") || null,
    initialReturnTo: search.get("returnTo") || null,
  });

  return <AssistantExperience layout="page" conversation={conversation} greeting={greeting} />;
}
