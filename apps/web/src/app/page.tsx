import { PublicEntryHero } from "@/components/marketing/public-entry-hero";
import { safeAuthNext } from "@/lib/public-entry";

type SearchParams = Promise<{ next?: string | string[] }>;

export default async function HomePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const raw = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeAuthNext(raw);

  return <PublicEntryHero next={next} />;
}
