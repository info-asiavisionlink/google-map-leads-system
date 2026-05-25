import { User } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export async function getAuthUser(
  request: NextRequest
): Promise<User | null> {
  const supabase = createSupabaseRouteClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("認証ユーザー取得エラー:", error);
    return null;
  }

  return user;
}
