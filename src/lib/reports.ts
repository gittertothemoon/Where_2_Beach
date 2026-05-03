import type { AttributionSnapshot, CrowdLevel, Report } from "./types";
import { getDevMockAccount } from "./devMockAuth";
import { getSupabaseClient } from "./supabase";

type ApiErrorPayload = {
  ok: false;
  error?: string;
  retry_after?: number;
};

type FetchReportsSuccessPayload = {
  ok: true;
  reports?: unknown;
};

type SubmitReportSuccessPayload = {
  ok: true;
  report?: unknown;
  rewards?: unknown;
};

type FetchReportsErrorCode = "network" | "unavailable" | "invalid_payload";
type SubmitReportErrorCode =
  | "network"
  | "too_soon"
  | "account_required"
  | "unavailable"
  | "invalid_payload";

export type FetchReportsResult =
  | { ok: true; reports: Report[] }
  | { ok: false; code: FetchReportsErrorCode };

export type SubmitReportResult =
  | { ok: true; report: Report; rewards?: { awardedPoints: number; pointsBalance: number | null } }
  | { ok: false; code: SubmitReportErrorCode; retryAfterSec?: number };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const isCrowdLevel = (value: number): value is CrowdLevel =>
  value === 1 || value === 2 || value === 3 || value === 4;

const isWaterLevel = (value: number): value is import("./types").WaterLevel =>
  value === 1 || value === 2 || value === 3 || value === 4;

const isBeachLevel = (value: number): value is import("./types").BeachLevel =>
  value === 1 || value === 2 || value === 3;

const toOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  return undefined;
};

const isAttributionSnapshot = (value: unknown): value is AttributionSnapshot => {
  if (!isObject(value)) return false;
  if (value.v !== 1) return false;
  if (typeof value.first_seen_at !== "string") return false;
  if (typeof value.last_seen_at !== "string") return false;
  return true;
};

const parseReport = (value: unknown): Report | null => {
  if (!isObject(value)) return null;
  if (typeof value.id !== "string" || value.id.trim().length === 0) return null;
  if (typeof value.beachId !== "string" || value.beachId.trim().length === 0) {
    return null;
  }
  const crowdLevel = toFiniteNumber(value.crowdLevel);
  const createdAt = toFiniteNumber(value.createdAt);
  const waterConditionRaw = toFiniteNumber(value.waterCondition);
  const beachConditionRaw = toFiniteNumber(value.beachCondition);
  const attribution = isObject(value.attribution) ? value.attribution : null;
  const hasJellyfish =
    toOptionalBoolean(value.hasJellyfish) ??
    toOptionalBoolean(attribution?.has_jellyfish) ??
    toOptionalBoolean(attribution?.hasJellyfish);
  const hasAlgae =
    toOptionalBoolean(value.hasAlgae) ??
    toOptionalBoolean(attribution?.has_algae) ??
    toOptionalBoolean(attribution?.hasAlgae);
  const hasRoughSea =
    toOptionalBoolean(value.hasRoughSea) ??
    toOptionalBoolean(attribution?.has_rough_sea) ??
    toOptionalBoolean(attribution?.hasRoughSea);
  const hasStrongWind =
    toOptionalBoolean(value.hasStrongWind) ??
    toOptionalBoolean(attribution?.has_strong_wind) ??
    toOptionalBoolean(attribution?.hasStrongWind);

  if (crowdLevel === null || createdAt === null || !isCrowdLevel(crowdLevel)) {
    return null;
  }
  return {
    id: value.id,
    beachId: value.beachId,
    crowdLevel,
    waterCondition: waterConditionRaw && isWaterLevel(waterConditionRaw) ? waterConditionRaw : undefined,
    beachCondition: beachConditionRaw && isBeachLevel(beachConditionRaw) ? beachConditionRaw : undefined,
    hasJellyfish,
    hasAlgae,
    hasRoughSea,
    hasStrongWind,
    createdAt,
    attribution: isAttributionSnapshot(attribution)
      ? attribution
      : undefined,
    confirmationCount: toFiniteNumber(value.confirmationCount) ?? undefined,
  };
};

const parseReportRewards = (
  value: unknown,
): { awardedPoints: number; pointsBalance: number | null } | null => {
  if (!isObject(value)) return null;
  const awardedPoints = toFiniteNumber(value.awardedPoints);
  if (awardedPoints === null || awardedPoints <= 0) return null;
  const pointsBalanceRaw = toFiniteNumber(value.pointsBalance);
  return {
    awardedPoints: Math.round(awardedPoints),
    pointsBalance:
      pointsBalanceRaw === null ? null : Math.max(0, Math.round(pointsBalanceRaw)),
  };
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const loadAuthToken = async (): Promise<string | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
};

const toApiErrorPayload = (value: unknown): ApiErrorPayload | null => {
  if (!isObject(value) || value.ok !== false) return null;
  return {
    ok: false,
    error: typeof value.error === "string" ? value.error : undefined,
    retry_after:
      typeof value.retry_after === "number" && Number.isFinite(value.retry_after)
        ? value.retry_after
        : undefined,
  };
};

// In-memory mock store — persists submitted reports across poll cycles in dev mode.
// Reports older than MOCK_LOOKBACK_MS are automatically pruned on each fetch.
const MOCK_LOOKBACK_MS = 6 * 60 * 60 * 1000; // matches REPORTS_LOOKBACK_HOURS default
let mockReports: Report[] = [];

const buildMockReport = (input: {
  beachId: string;
  crowdLevel: CrowdLevel;
  waterCondition?: import("./types").WaterLevel;
  beachCondition?: import("./types").BeachLevel;
  hasJellyfish?: boolean;
  hasAlgae?: boolean;
  hasRoughSea?: boolean;
  hasStrongWind?: boolean;
  attribution?: AttributionSnapshot;
}): Report => ({
  id: `mock-report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  beachId: input.beachId,
  crowdLevel: input.crowdLevel,
  waterCondition: input.waterCondition,
  beachCondition: input.beachCondition,
  hasJellyfish: input.hasJellyfish,
  hasAlgae: input.hasAlgae,
  hasRoughSea: input.hasRoughSea,
  hasStrongWind: input.hasStrongWind,
  createdAt: Date.now(),
  attribution: input.attribution,
});

export const fetchSharedReports = async (
  signal?: AbortSignal,
): Promise<FetchReportsResult> => {
  if (getDevMockAccount()) {
    const cutoff = Date.now() - MOCK_LOOKBACK_MS;
    mockReports = mockReports.filter((r) => r.createdAt >= cutoff);
    return { ok: true, reports: mockReports };
  }

  let response: Response;
  try {
    response = await fetch("/api/reports", { method: "GET", signal });
  } catch {
    return { ok: false, code: "network" };
  }

  const payload = await readJson(response);
  if (!response.ok) {
    return { ok: false, code: "unavailable" };
  }

  const parsed = payload as FetchReportsSuccessPayload;
  if (!parsed || parsed.ok !== true || !Array.isArray(parsed.reports)) {
    return { ok: false, code: "invalid_payload" };
  }

  const reports = parsed.reports
    .map((item) => parseReport(item))
    .filter((item): item is Report => item !== null);

  return { ok: true, reports };
};

export const submitSharedReport = async (input: {
  beachId: string;
  crowdLevel: CrowdLevel;
  waterCondition?: import("./types").WaterLevel;
  beachCondition?: import("./types").BeachLevel;
  hasJellyfish?: boolean;
  hasAlgae?: boolean;
  hasRoughSea?: boolean;
  hasStrongWind?: boolean;
  reporterHash: string;
  attribution?: AttributionSnapshot;
}): Promise<SubmitReportResult> => {
  if (getDevMockAccount()) {
    const report = buildMockReport(input);
    mockReports = [report, ...mockReports];
    return {
      ok: true,
      report,
      rewards: { awardedPoints: 15, pointsBalance: null },
    };
  }

  let response: Response;
  const authToken = await loadAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    response = await fetch("/api/reports", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, code: "network" };
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const errorPayload = toApiErrorPayload(payload);
    if (
      response.status === 401 ||
      response.status === 403 ||
      errorPayload?.error === "account_required" ||
      errorPayload?.error === "missing_token" ||
      errorPayload?.error === "invalid_token"
    ) {
      return { ok: false, code: "account_required" };
    }
    if (response.status === 429 || errorPayload?.error === "too_soon") {
      return {
        ok: false,
        code: "too_soon",
        retryAfterSec: errorPayload?.retry_after,
      };
    }
    if (
      errorPayload?.error === "invalid_body" ||
      errorPayload?.error === "invalid_beach_id" ||
      errorPayload?.error === "invalid_crowd_level" ||
      errorPayload?.error === "invalid_water_condition" ||
      errorPayload?.error === "invalid_beach_condition" ||
      errorPayload?.error === "invalid_has_jellyfish" ||
      errorPayload?.error === "invalid_has_algae" ||
      errorPayload?.error === "invalid_reporter_hash"
    ) {
      return { ok: false, code: "invalid_payload" };
    }
    return { ok: false, code: "unavailable" };
  }

  const parsed = payload as SubmitReportSuccessPayload;
  if (!parsed || parsed.ok !== true) {
    return { ok: false, code: "invalid_payload" };
  }
  const report = parseReport(parsed.report);
  if (!report) {
    return { ok: false, code: "invalid_payload" };
  }
  const rewards = parseReportRewards(parsed.rewards) ?? undefined;
  return { ok: true, report, rewards };
};

export type ConfirmReportRewards = {
  awardedPoints: number | null;
  pointsBalance: number | null;
};

export type ConfirmReportResult =
  | { ok: true; rewards: ConfirmReportRewards }
  | { ok: false; code: "network" | "account_required" | "not_found" | "already_confirmed" | "cannot_confirm_own" | "unavailable" };

const parseConfirmRewards = (value: unknown): ConfirmReportRewards => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  const awardedPoints =
    raw && typeof raw.awardedPoints === "number" && Number.isFinite(raw.awardedPoints)
      ? Math.trunc(raw.awardedPoints)
      : null;
  const pointsBalance =
    raw && typeof raw.pointsBalance === "number" && Number.isFinite(raw.pointsBalance)
      ? Math.trunc(raw.pointsBalance)
      : null;
  return { awardedPoints, pointsBalance };
};

export const confirmReport = async (reportId: string): Promise<ConfirmReportResult> => {
  if (getDevMockAccount()) {
    return { ok: true, rewards: { awardedPoints: 1, pointsBalance: null } };
  }

  const authToken = await loadAuthToken();
  if (!authToken) return { ok: false, code: "account_required" };

  let response: Response;
  try {
    response = await fetch("/api/reports?action=confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ reportId }),
    });
  } catch {
    return { ok: false, code: "network" };
  }

  if (response.status === 401 || response.status === 403) return { ok: false, code: "account_required" };
  if (response.status === 404) return { ok: false, code: "not_found" };
  if (response.status === 409) {
    const payload = await readJson(response) as { error?: string } | null;
    if (payload?.error === "cannot_confirm_own_report") return { ok: false, code: "cannot_confirm_own" };
    return { ok: false, code: "already_confirmed" };
  }
  if (!response.ok) return { ok: false, code: "unavailable" };

  const payload = (await readJson(response)) as { rewards?: unknown } | null;
  return { ok: true, rewards: parseConfirmRewards(payload?.rewards) };
};
