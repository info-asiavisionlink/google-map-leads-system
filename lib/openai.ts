import OpenAI from "openai";
import { trimForOpenAI } from "@/lib/fetchWebsiteText";

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY が設定されていません");
  }
  return new OpenAI({ apiKey });
}

export type GeneratePlaceAnswerParams = {
  placeName: string;
  question: string;
  mapContext: string;
  websiteText?: string;
  websiteFetchFailed?: boolean;
};

export async function generatePlaceAnswer(
  params: GeneratePlaceAnswerParams
): Promise<string> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const websiteSection = params.websiteText
    ? `\n\n【公式サイトから抽出したテキスト】\n${trimForOpenAI(params.websiteText, 6000)}`
    : params.websiteFetchFailed
      ? "\n\n【公式サイト】取得できなかったため、Googleマップ保存情報のみを参照してください。"
      : "\n\n【公式サイト】URLがないため、Googleマップ保存情報のみを参照してください。";

  const systemPrompt = `あなたはGoogleマップ営業リスト作成ツールのAIアシスタントです。
取得済みの店舗情報をもとに、ユーザーの質問に短く分かりやすく答えてください。

回答ルール（必ず守る）:
- 原則300文字以内で答える
- 箇条書きを使う場合は最大3項目まで
- 聞かれたことに直接答える。不要な前置きや長い営業提案は書かない
- Googleマップ保存情報を最優先し、公式サイト情報があれば補足として使う
- 不明な内容は断定せず「取得済み情報では確認できません」と短く答える
- 最後に長い注意書きや免責は付けない
- 日本語で、読みやすい短い文章または短い箇条書きで答える`;

  const userPrompt = `店舗名: ${params.placeName}

【ユーザーの質問】
${params.question}

【Googleマップ保存情報】
${trimForOpenAI(params.mapContext, 4000)}${websiteSection}`;

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error("AI回答の生成に失敗しました");
  }
  return answer;
}
