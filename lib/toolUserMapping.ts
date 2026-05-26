import type { AuthProfileRow, ToolUser, ToolUserQuery } from "@/lib/toolUser";

const LOG_PREFIX = "[tool-user-mapping]";

export function logToolUserMapping(fields: Record<string, string | boolean | number>): void {
  const line = Object.entries(fields)
    .map(([k, v]) => `${k}:${String(v)}`)
    .join(" ");
  console.info(`${LOG_PREFIX} ${line}`);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function parseRemainingCredit(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value.trim());
  if (Number.isNaN(n)) return null;
  return n;
}

export function profileRowToToolUser(row: AuthProfileRow): ToolUser | null {
  if (row.credit === null || row.credit === undefined || Number.isNaN(row.credit)) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email.trim(),
    credit: row.credit,
  };
}

/** query と Supabase profiles の username / email / credit を照合 */
export function matchQueryWithProfile(
  query: ToolUserQuery,
  profile: ToolUser
): boolean {
  const usernameMatch =
    normalizeUsername(query.username) === normalizeUsername(profile.username);
  const emailMatch =
    normalizeEmail(query.email) === normalizeEmail(profile.email);
  const creditMatch = query.remaining_credit === profile.credit;

  logToolUserMapping({
    query_user_id: query.user_id,
    supabase_user_id: profile.id,
    query_username: query.username,
    db_username: profile.username ?? "",
    query_email: query.email,
    db_email: profile.email,
    query_credit: query.remaining_credit,
    db_credit: profile.credit,
    username_match: usernameMatch,
    email_match: emailMatch,
    credit_match: creditMatch,
    matched: usernameMatch && emailMatch && creditMatch,
  });

  return usernameMatch && emailMatch && creditMatch;
}
