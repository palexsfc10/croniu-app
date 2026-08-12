# RC2.8 — PWA icon + Asaas checkout operator notes (no PII)

## Incorrect PWA icon (RC2.7)

- Served `/icons/icon-192.png` / `icon-512.png` derived from the **transparent UI cutout**
  (`croniu-mark.png`) via `scripts/generate_favicon_assets.py`.
- On Android Chrome install UI, transparent pixels composite onto the system blue tile →
  appears as a pale/white “C” on a blue square (generic).

## Official source (do not replace)

- `assets/brand/croniu-c-official.png` (opaque navy tile + blue→cyan gradient C).
- UI cutout remains `apps/web/public/brand/croniu-mark.png` (in-product chrome only).

## Cache busting

- Versioned filenames: `icon-*-v3.png`
- Manifest + SW (`croniu-static-v3`) reference only v3 paths
- Legacy unversioned icon files removed from the web tree

## Existing Android installs

New visitors / clean site data pick up v3 automatically.
Already-installed PWAs may keep the old launcher icon until the user clears site data,
removes the shortcut, or reinstalls — document this in release notes; do not rely on
uninstall as the only path for *new* installs.

## Asaas checkout failure (PRD smoke)

- Root cause: `ASAAS_API_URL=https://api.asaas.com/api/v3` returns **404** on
  `POST .../customers`. Canonical production base is `https://api.asaas.com/v3`.
- RC2.8 normalizes the misconfigured URL at runtime and updates env examples/preflight.
- PRD attempt created **no** local checkout rows, **no** provider_customer_id, **no**
  Asaas payments (duplicate risk: none from that attempt).
- Ops should still set `.env.prd` to the canonical URL on the next controlled deploy
  (code already tolerates the legacy misconfig).

