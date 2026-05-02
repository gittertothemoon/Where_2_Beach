/**
 * POST /api/reports?action=confirm
 * Body: { reportId: string }
 * Authenticated: bearer token required.
 * Confirms an active beach report, extending its TTL and awarding points.
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyApiSecurityHeaders, readBearerToken, readEnv } from "../_lib/security.js";
import { sendSinglePush } from "../_lib/push.js";

const MAX_BODY_BYTES = 4 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSingleString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function readBody(req: VercelRequest): { body: Record<string, unknown> | null; error?: string } {
  const rawLength = Number(req.headers["content-length"] || 0);
  if (rawLength && rawLength > MAX_BODY_BYTES) return { body: null, error: "payload_too_large" };
  if (!req.body) return { body: null, error: "missing_body" };
  if (typeof req.body === "string") {
    if (req.body.length > MAX_BODY_BYTES) return { body: null, error: "payload_too_large" };
    try {
      const parsed = JSON.parse(req.body);
      if (!isObject(parsed)) return { body: null, error: "invalid_body" };
      return { body: parsed };
    } catch {
      return { body: null, error: "invalid_json" };
    }
  }
  if (!isObject(req.body)) return { body: null, error: "invalid_body" };
  return { body: req.body };
}

// Basic UUID validation (RFC 4122)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyApiSecurityHeaders(res, { noStore: true });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRole = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ ok: false, error: "missing_env" });
  }
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const accessToken = readBearerToken(req);
  if (!accessToken) return res.status(401).json({ ok: false, error: "missing_token" });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
  const userId = userData.user.id;

  const { body, error: bodyError } = readBody(req);
  if (bodyError || !body) {
    return res.status(400).json({ ok: false, error: bodyError ?? "missing_body" });
  }

  const reportId = toSingleString(body.reportId);
  if (!reportId || !UUID_RE.test(reportId)) {
    return res.status(400).json({ ok: false, error: "invalid_report_id" });
  }

  type ConfirmFnRow = {
    ok?: unknown;
    error?: unknown;
    awarded_points?: unknown;
    points_balance?: unknown;
  };
  const { data: fnData, error: fnError } = await supabase.rpc("confirm_beach_report", {
    p_confirmer_id: userId,
    p_report_id: reportId,
  });

  if (fnError) {
    return res.status(500).json({ ok: false, error: "db_confirm_failed" });
  }

  const result = isObject(fnData) ? (fnData as ConfirmFnRow) : null;
  if (result?.ok !== true) {
    const errCode = toSingleString(result?.error);
    if (errCode === "report_not_found") return res.status(404).json({ ok: false, error: errCode });
    if (errCode === "already_confirmed" || errCode === "cannot_confirm_own_report") {
      return res.status(409).json({ ok: false, error: errCode });
    }
    return res.status(400).json({ ok: false, error: errCode ?? "confirm_failed" });
  }

  const awardedPoints =
    typeof result.awarded_points === "number" && Number.isFinite(result.awarded_points)
      ? Math.trunc(result.awarded_points)
      : null;
  const pointsBalance =
    typeof result.points_balance === "number" && Number.isFinite(result.points_balance)
      ? Math.trunc(result.points_balance)
      : null;

  // Notify the reporter — best-effort, don't block the response
  void (async () => {
    try {
      // Find the reporter's user_id from the report
      const { data: reportRow } = await supabase
        .from("beach_reports")
        .select("user_id")
        .eq("id", reportId)
        .single();

      const reporterUserId = reportRow?.user_id as string | null | undefined;
      if (!reporterUserId || reporterUserId === userId) return;

      // Get their latest push token
      const { data: tokenRow } = await supabase
        .from("user_push_tokens")
        .select("token")
        .eq("user_id", reporterUserId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const token = tokenRow?.token as string | null | undefined;
      if (!token) return;

      const CONFIRM_MESSAGES = [
        "Qualcuno ha confermato la tua segnalazione! 🙌 +2 pt per te.",
        "La tua segnalazione è stata confermata da un altro utente. ✅ +2 pt accreditati.",
        "Ottimo lavoro! Un altro bagnante ha confermato la tua segnalazione 🏖️ +2 pt.",
      ];
      const body = CONFIRM_MESSAGES[Math.floor(Math.random() * CONFIRM_MESSAGES.length)];

      await sendSinglePush({
        to: token,
        title: "Where2Beach",
        body,
        data: { type: "report_confirmed", reportId },
        sound: "default",
      });
    } catch {
      // Non-fatal
    }
  })();

  return res.status(200).json({
    ok: true,
    rewards: {
      awardedPoints,
      pointsBalance,
    },
  });
}
