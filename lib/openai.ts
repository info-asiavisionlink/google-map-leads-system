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
営業リスト作成ユーザー向けに、取得済みの店舗情報をもとに簡潔で実用的な回答をしてください。

回答方針:
- Googleマップ保存情報を最優先する
- 公式サイト情報があれば補足として利用する
- 不明な内容は断定しない
- 取得済み情報で確認できない場合は「取得済み情報では確認できません」と答える
- 営業提案に使える情報があれば整理する
- 日本語で回答する`;

  const userPrompt = `店舗名: ${params.placeName}

【ユーザーの質問】
${params.question}

【Googleマップ保存情報】
${trimForOpenAI(params.mapContext, 4000)}${websiteSection}`;

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
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
