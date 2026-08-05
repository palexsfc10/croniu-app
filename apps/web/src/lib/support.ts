/** Central support inbox for feedback and help. */
export const SUPPORT_EMAIL = "appcroniu@gmail.com";

export function supportMailto(subject = "Croniu — feedback / ajuda") {
  const params = new URLSearchParams({ subject });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}
