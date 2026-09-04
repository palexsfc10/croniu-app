/**
 * Builds the URL that hands the Assistant a prefilled prompt, the screen's
 * context label, and where to return to after. Every page that offers
 * "Perguntar à IA" was assembling this same query string by hand.
 */
export function buildAssistantHref(prompt: string, context: string, returnTo: string): string {
  return `/app/assistant?prompt=${encodeURIComponent(prompt)}&context=${encodeURIComponent(context)}&returnTo=${encodeURIComponent(returnTo)}`;
}
