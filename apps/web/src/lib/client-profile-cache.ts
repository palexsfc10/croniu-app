import type {
  Appointment,
  Client,
  ClientAccess,
  ClientEvaluation,
  ClientJourney,
  Cycle,
  Protocol,
  Receivable,
  RenewalCaseView,
} from "@/lib/api";

export type ClientProfileSnapshot = {
  item: Client;
  access: ClientAccess | null;
  journey: ClientJourney | null;
  protocols: Protocol[];
  cycles: Cycle[];
  todayIso: string;
  evaluations: ClientEvaluation[];
  routinePendingCount: number | null;
  routineOverdueCount: number;
  submissionId: string | null;
  appointments: Appointment[];
  receivables: Receivable[];
  renewalCases: RenewalCaseView[];
};

const MAX_ENTRIES = 20;

/** Session-only, in-memory — deliberately never localStorage/
 * sessionStorage: this is a same-tab render optimization (skip the full
 * skeleton on a remount for a client already seen this session), not
 * data that needs to survive a reload or be readable anywhere else.
 *
 * A bare `Map` keyed only by `clientId` is NOT safe here: it's plain JS
 * module memory, so it survives `AuthProvider.logout()`'s storage
 * cleanup (which only clears sessionStorage/localStorage) and a
 * client-side route change — a second person signing into the same
 * browser tab could briefly see the first person's cached snapshot for a
 * client id, and switching organizations could do the same. Every read
 * and write here is scoped by a caller-supplied `scope` string (built
 * from the CURRENT, already-resolved authenticated identity — org id +
 * user id) and re-validated on every access via `ensureScope`: the
 * moment the scope string differs from the last one seen, the entire
 * store is thrown away before anything is read or written. Callers must
 * only ever pass a scope built from a confirmed `me` — never a guess,
 * never a default — so nothing is ever hydrated before the current
 * identity is known. `clearAllSnapshots` is the explicit, immediate path
 * for logout/session-loss instead of waiting for the next scoped call to
 * happen to notice the change. */
let currentScope: string | null = null;
let store = new Map<string, ClientProfileSnapshot>();

function ensureScope(scope: string): void {
  if (scope !== currentScope) {
    currentScope = scope;
    store = new Map();
  }
}

function keyFor(scope: string, clientId: string): string {
  return `${scope}:${clientId}`;
}

export function getClientProfileSnapshot(
  scope: string,
  clientId: string,
): ClientProfileSnapshot | undefined {
  ensureScope(scope);
  const key = keyFor(scope, clientId);
  const hit = store.get(key);
  if (hit) {
    // Re-insert to bump recency for the simple LRU eviction below —
    // `Map` iterates in insertion order, so the first key is the oldest.
    store.delete(key);
    store.set(key, hit);
  }
  return hit;
}

export function setClientProfileSnapshot(
  scope: string,
  clientId: string,
  snapshot: ClientProfileSnapshot,
): void {
  ensureScope(scope);
  const key = keyFor(scope, clientId);
  store.delete(key);
  store.set(key, snapshot);
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}

/** A confirmed 401/403/404 on the primary client fetch means whatever is
 * cached is no longer trustworthy (session died, access was revoked, or
 * the record is gone) — drop it immediately so a future remount can't
 * hydrate from it and briefly show data that no longer applies. */
export function invalidateClientProfileSnapshot(scope: string, clientId: string): void {
  ensureScope(scope);
  store.delete(keyFor(scope, clientId));
}

/** Logout, a confirmed session loss, or any other point where the
 * caller can no longer vouch for "this is still the same authenticated
 * identity" — wipes everything immediately rather than waiting for the
 * next `ensureScope` call to notice a different scope string. */
export function clearAllClientProfileSnapshots(): void {
  currentScope = null;
  store = new Map();
}

/** Test-only escape hatch — the cache is a module singleton, so it
 * otherwise leaks snapshots across unrelated test cases in the same
 * file/run. Not used by any production code path. */
export function __resetClientProfileCacheForTests(): void {
  clearAllClientProfileSnapshots();
}
