// Tracks IDs of reports submitted from this device so the UI can hide actions
// (e.g. the "Confermo" button) that the backend will refuse anyway. Persisted
// to localStorage with a TTL slightly longer than a report's lifetime so the
// filter survives a page refresh while a report is still active in the feed.

const STORAGE_KEY = "where2beach-own-reports-v1";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h — comfortably > REPORTS_LOOKBACK_HOURS (6h)

type StoredEntry = { id: string; ts: number };

const readStore = (): StoredEntry[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (entry): entry is StoredEntry =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.ts === "number" &&
        now - entry.ts < TTL_MS,
    );
  } catch {
    return [];
  }
};

const writeStore = (entries: StoredEntry[]): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota or privacy mode — silently ignore; in-memory ref still works.
  }
};

export const loadOwnReportIds = (): Set<string> => {
  const entries = readStore();
  return new Set(entries.map((entry) => entry.id));
};

export const rememberOwnReportId = (id: string): void => {
  if (!id) return;
  const entries = readStore().filter((entry) => entry.id !== id);
  entries.push({ id, ts: Date.now() });
  writeStore(entries);
};
