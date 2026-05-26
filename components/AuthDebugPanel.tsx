"use client";

import {
  isClientAuthDebugEnabled,
  useAuthDebugLogs,
} from "@/lib/authDebugClient";
import { useEffect, useState } from "react";

type AuthHealthResponse = {
  auth_system_api_url: string | null;
  auth_system_api_source: string;
  auth_system_api_configured: boolean;
  env_mismatch_warning: string | null;
  tool_key: string;
  google_map_supabase_configured: boolean;
  google_map_supabase_ok: boolean | null;
  google_map_supabase_error: string | null;
  auth_system_reachable: boolean | null;
  auth_system_verify_probe_status: number | null;
  auth_system_probe_error: string | null;
  server_auth_debug_enabled: boolean;
};

export default function AuthDebugPanel() {
  const logs = useAuthDebugLogs();
  const [health, setHealth] = useState<AuthHealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isClientAuthDebugEnabled()) return;

    void (async () => {
      try {
        const res = await fetch("/api/debug/auth-health", { cache: "no-store" });
        const data = (await res.json()) as AuthHealthResponse & {
          error?: string;
        };
        if (!res.ok) {
          setHealthError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        setHealth(data);
      } catch (err) {
        setHealthError(
          err instanceof Error ? err.message : "auth-health の取得に失敗"
        );
      }
    })();
  }, []);

  if (!isClientAuthDebugEnabled()) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/80 p-4 text-xs text-gray-800 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-amber-900">
          認証デバッグ（一時表示・本番では無効化）
        </h2>
        <span className="rounded bg-amber-200 px-2 py-0.5 font-mono text-[10px] text-amber-950">
          NEXT_PUBLIC_AUTH_DEBUG=true または ?auth_debug=1
        </span>
      </div>

      <p className="mb-3 text-[11px] leading-relaxed text-amber-950/90">
        ダッシュボード側 <code className="rounded bg-white px-1">openTool()</code>{" "}
        のログは本リポジトリ外です。
        <code className="ml-1 rounded bg-white px-1">
          docs/debug-dashboard-openTool.snippet.ts
        </code>{" "}
        を NAL Auth System に貼り付けてください。
      </p>

      {health ? (
        <div className="mb-4 grid gap-1 rounded-lg border border-amber-300 bg-white p-3 font-mono text-[11px]">
          <p className="font-semibold text-amber-900">サーバー接続チェック</p>
          <p>
            AUTH_SYSTEM_API_URL:{" "}
            <span className="font-bold">
              {health.auth_system_api_url ?? "(未設定)"}
            </span>{" "}
            ({health.auth_system_api_source})
          </p>
          <p>
            configured: {String(health.auth_system_api_configured)} /
            reachable: {String(health.auth_system_reachable)} /
            verify_probe_status:{" "}
            {health.auth_system_verify_probe_status ?? "n/a"}
          </p>
          {health.env_mismatch_warning ? (
            <p className="text-red-700">{health.env_mismatch_warning}</p>
          ) : null}
          <p>
            Google Map Supabase: configured=
            {String(health.google_map_supabase_configured)} ok=
            {String(health.google_map_supabase_ok)}
            {health.google_map_supabase_error
              ? ` err=${health.google_map_supabase_error}`
              : ""}
          </p>
          <p>tool_key: {health.tool_key}</p>
        </div>
      ) : null}

      {healthError ? (
        <p className="mb-3 text-red-700">
          auth-health エラー: {healthError}
          （Vercel で AUTH_DEBUG=true を設定）
        </p>
      ) : null}

      <div className="max-h-72 overflow-y-auto rounded-lg border border-amber-300 bg-gray-900 p-3 font-mono text-[10px] leading-relaxed text-green-300">
        {logs.length === 0 ? (
          <p className="text-gray-400">ログはまだありません…</p>
        ) : (
          logs.map((entry) => (
            <div
              key={entry.id}
              className={
                entry.level === "error"
                  ? "mb-2 border-b border-gray-700 pb-2 text-red-300"
                  : "mb-2 border-b border-gray-700 pb-2"
              }
            >
              <span className="text-gray-500">{entry.ts}</span>{" "}
              <span
                className={
                  entry.level === "error" ? "text-red-400" : "text-blue-400"
                }
              >
                [{entry.scope}]
              </span>
              <pre className="mt-1 whitespace-pre-wrap break-all">
                {Object.entries(entry.fields)
                  .map(([k, v]) => `${k}: ${v ?? "null"}`)
                  .join("\n")}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
