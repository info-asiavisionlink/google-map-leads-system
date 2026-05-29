import {
  OPENAI_MAX_CONTEXT_CHARS,
  WEBSITE_FETCH_TIMEOUT_MS,
  WEBSITE_MAX_TEXT_CHARS,
} from "@/lib/constants";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export async function fetchWebsiteText(
  websiteUrl: string
): Promise<{ text: string; ok: boolean }> {
  const url = normalizeUrl(websiteUrl);
  if (!url) {
    return { text: "", ok: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GoogleMapLeadsBot/1.0; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return { text: "", ok: false };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return { text: "", ok: false };
    }

    const raw = await res.text();
    const text = stripHtml(raw).slice(0, WEBSITE_MAX_TEXT_CHARS);
    return { text, ok: text.length > 0 };
  } catch {
    return { text: "", ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export function trimForOpenAI(text: string, maxChars = OPENAI_MAX_CONTEXT_CHARS): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…（以下省略）`;
}
