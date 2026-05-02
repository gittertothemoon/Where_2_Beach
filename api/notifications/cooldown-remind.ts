/**
 * Cron endpoint: POST /api/notifications/cooldown-remind
 * Schedule: every 15 minutes (see vercel.json).
 * For each user whose most recent beach_report is between 60 and 75 minutes
 * old (i.e. their report cooldown just expired), send a push notification
 * inviting them to submit a fresh report. Marks `cooldown_reminded_at` so
 * each report only triggers one reminder.
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyApiSecurityHeaders,
  readBearerToken,
  readEnv,
  safeEqualSecret,
} from "../_lib/security.js";
import { sendPushNotifications, type PushMessage } from "../_lib/push.js";

const COOLDOWN_MIN = 60;
const WINDOW_END_MIN = 75; // grace window so a 15-min cron always catches each user once

function isAuthorized(req: VercelRequest): boolean {
  const token = readBearerToken(req);
  if (!token) return false;
  const cronSecret = readEnv("CRON_SECRET");
  if (!cronSecret) return false;
  return safeEqualSecret(token, cronSecret);
}

function buildSupabaseClient() {
  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRole = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
}

const REMINDER_BODY =
  "Sei pronto a tornare in spiaggia con un nuovo aggiornamento? Puoi segnalare di nuovo!";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyApiSecurityHeaders(res, { noStore: true });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const supabase = buildSupabaseClient();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: "missing_env" });
  }

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_END_MIN * 60 * 1000).toISOString();
  const windowEnd = new Date(now - COOLDOWN_MIN * 60 * 1000).toISOString();

  // Candidates: reports whose age is in [60, 75] min and that haven't been
  // pinged yet. Many of these may be superseded by a later report from the
  // same user; we filter those out below.
  const { data: candidates, error: candidatesError } = await supabase
    .from("beach_reports")
    .select("id, user_id, created_at")
    .gte("created_at", windowStart)
    .lte("created_at", windowEnd)
    .is("cooldown_reminded_at", null)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false });

  if (candidatesError) {
    return res.status(500).json({ ok: false, error: "db_candidates_failed" });
  }

  const candidateRows = (candidates ?? []) as {
    id: string;
    user_id: string;
    created_at: string;
  }[];

  if (candidateRows.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, reason: "no_candidates" });
  }

  // Keep only the latest candidate per user.
  const latestByUser = new Map<string, { id: string; created_at: string }>();
  for (const row of candidateRows) {
    const existing = latestByUser.get(row.user_id);
    if (!existing || existing.created_at < row.created_at) {
      latestByUser.set(row.user_id, { id: row.id, created_at: row.created_at });
    }
  }

  const userIds = [...latestByUser.keys()];

  // Drop users who have a newer report than the candidate (their cooldown
  // resets). One query batches all of them.
  const { data: laterRows, error: laterError } = await supabase
    .from("beach_reports")
    .select("user_id, created_at")
    .in("user_id", userIds)
    .gt("created_at", windowEnd);

  if (laterError) {
    return res.status(500).json({ ok: false, error: "db_later_failed" });
  }

  const usersWithLater = new Set(
    (laterRows ?? []).map((r: { user_id: string }) => r.user_id),
  );
  for (const uid of usersWithLater) latestByUser.delete(uid);

  if (latestByUser.size === 0) {
    return res.status(200).json({ ok: true, sent: 0, reason: "all_superseded" });
  }

  // Most-recent push token per remaining user.
  const eligibleUserIds = [...latestByUser.keys()];
  const { data: tokenRows, error: tokenError } = await supabase
    .from("user_push_tokens")
    .select("user_id, token, updated_at")
    .in("user_id", eligibleUserIds)
    .order("updated_at", { ascending: false });

  if (tokenError) {
    return res.status(500).json({ ok: false, error: "db_tokens_failed" });
  }

  const tokenByUser = new Map<string, string>();
  for (const row of (tokenRows ?? []) as { user_id: string; token: string }[]) {
    if (!tokenByUser.has(row.user_id)) tokenByUser.set(row.user_id, row.token);
  }

  const messages: PushMessage[] = [];
  const reportIdsToMark: string[] = [];
  for (const [userId, candidate] of latestByUser) {
    const token = tokenByUser.get(userId);
    // Always mark the report so we don't reconsider it next run, even when
    // the user has no push token registered.
    reportIdsToMark.push(candidate.id);
    if (!token) continue;
    messages.push({
      to: token,
      title: "Where2Beach",
      body: REMINDER_BODY,
      sound: "default",
      data: { type: "cooldown_reminder", reportId: candidate.id },
    });
  }

  let sent = 0;
  if (messages.length > 0) {
    await sendPushNotifications(messages);
    sent = messages.length;
  }

  if (reportIdsToMark.length > 0) {
    const stamp = new Date().toISOString();
    const { error: markError } = await supabase
      .from("beach_reports")
      .update({ cooldown_reminded_at: stamp })
      .in("id", reportIdsToMark);
    if (markError) {
      return res.status(500).json({ ok: false, error: "db_mark_failed", sent });
    }
  }

  return res.status(200).json({ ok: true, sent });
}
