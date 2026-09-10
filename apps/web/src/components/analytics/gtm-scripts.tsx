import Script from "next/script";
import { GTM_ID, isGtmScriptAllowed } from "@/lib/analytics/gtm";

type Props = { isHml: boolean };

/**
 * Pushes the Consent Mode default (denied unless a stored choice on this
 * origin says otherwise) before the GTM container executes. Runs as
 * `beforeInteractive`, which Next.js only allows from the root layout.
 */
export function GtmConsentDefaultScript({ isHml }: Props) {
  if (!isGtmScriptAllowed(isHml)) return null;
  return (
    <Script id="gtm-consent-default" strategy="beforeInteractive">
      {`(function () {
  var state = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
  try {
    var raw = localStorage.getItem("croniu_app_consent_v1");
    if (raw) {
      var stored = JSON.parse(raw);
      var marketing = stored && stored.marketing ? "granted" : "denied";
      state = {
        ad_storage: marketing,
        ad_user_data: marketing,
        ad_personalization: marketing,
        analytics_storage: stored && stored.analytics ? "granted" : "denied",
      };
    }
  } catch (e) {}
  window.dataLayer = window.dataLayer || [];
  state.wait_for_update = 500;
  window.dataLayer.push(["consent", "default", state]);
})();`}
    </Script>
  );
}

/**
 * GTM container script — loads once, after the page is interactive.
 * `isGtmScriptAllowed(isHml)` is a build-time/server render decision
 * (`isHml` comes from `CRONIU_ENV`, read once at module load in
 * layout.tsx — see the comment there on why it's not the request Host
 * header). The `location.hostname` check inside the snippet itself is a
 * second, independent, client-only layer with zero static-generation cost:
 * even if `CRONIU_ENV` were ever wrong or absent for a request that somehow
 * still resolves to the HML host, the container refuses to load there.
 */
export function GtmContainerScript({ isHml }: Props) {
  if (!isGtmScriptAllowed(isHml)) return null;
  return (
    <Script id="gtm-container" strategy="afterInteractive">
      {`(function(w,d,s,l,i){if(w.location.hostname.indexOf('croniu-hml')===0){return;}w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
    </Script>
  );
}

/** Official noscript fallback — must sit immediately after the opening <body> tag. */
export function GtmNoscriptFallback({ isHml }: Props) {
  if (!isGtmScriptAllowed(isHml)) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
