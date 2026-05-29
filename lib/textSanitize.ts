/** 不正なサロゲートペア（孤立 high/low surrogate）を除去 */
export function removeInvalidSurrogates(input: string): string {
  const parts: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        parts.push(input[i]!, input[i + 1]!);
        i++;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    } else {
      parts.push(input[i]!);
    }
  }
  return parts.join("");
}

/** DB保存・JSON化前の文字列サニタイズ */
export function sanitizeText(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = removeInvalidSurrogates(String(value)).trim();
  if (!trimmed || trimmed === "-") return null;
  try {
    JSON.stringify(trimmed);
  } catch {
    return null;
  }
  return trimmed;
}

export function sanitizeOptionalText(
  value: string | null | undefined
): string | null {
  return sanitizeText(value);
}
