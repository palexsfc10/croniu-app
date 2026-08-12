import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(name) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

describe("admin source guards against silent HML defaults", () => {
  const files = walk(SRC_ROOT);
  const joined = files.map((f) => readFileSync(f, "utf8")).join("\n");

  it("does not hardcode piloto copy", () => {
    expect(joined).not.toContain("Painel operacional do piloto");
  });

  it("does not use silent hml fallback", () => {
    expect(joined).not.toMatch(/\|\|\s*["']hml["']/);
    expect(joined).not.toMatch(/\?\?\s*["']hml["']/);
  });

  it("does not hardcode bare HML badge in shell or org pages", () => {
    const shell = readFileSync(path.join(SRC_ROOT, "components/admin-shell.tsx"), "utf8");
    const org = readFileSync(
      path.join(SRC_ROOT, "app/(console)/organizations/[organizationId]/page.tsx"),
      "utf8",
    );
    expect(shell).not.toMatch(/>\s*HML\s*</);
    expect(org).not.toMatch(/>\s*HML\s*</);
  });
});
