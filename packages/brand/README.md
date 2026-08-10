# @croniu/brand (referência canônica)

Fonte oficial do wordmark Croniu. As apps embutem uma cópia idêntica em:

- `apps/web/src/components/brand/`
- `apps/admin/src/components/brand/`

Motivo da cópia: o bundler Next (Turbopack) no monorepo Windows não resolveu de forma confiável o pacote `file:` externo. Qualquer alteração do wordmark deve atualizar **este pacote e as duas cópias** (ou regenerar as cópias a partir daqui).

## Uso

```tsx
import { BrandWordmark } from "@/components/brand";
```

Variantes: `size` (`sm` | `md` | `lg` | `xl`), `surface` (`light` | `dark`), `compact`.
Acessível: um único nome `Croniu`.
