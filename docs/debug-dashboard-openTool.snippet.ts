/**
 * NAL Auth System（ダッシュボード）側に貼り付ける一時デバッグ用スニペット
 * openTool() 内で generated URL / token 有無を確認する
 *
 * 有効化: process.env.NEXT_PUBLIC_AUTH_DEBUG === "true"
 * 削除: 原因特定後にこのブロックを削除
 */

function authDebugOpenTool(fields: Record<string, string | boolean | number>) {
  if (process.env.NEXT_PUBLIC_AUTH_DEBUG !== "true") return;
  const line = Object.entries(fields)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.info(`[auth-debug][openTool] ${line}`);
}

// openTool() 内の例（変数名はプロジェクトに合わせて調整）:
//
// authDebugOpenTool({
//   tool_url: toolUrl,
//   generated_url: generatedUrl,
//   token_exists: Boolean(accessToken),
//   token_length: accessToken?.length ?? 0,
//   destination_url: `${toolUrl}?access_token=${encodeURIComponent(accessToken)}`,
// });
