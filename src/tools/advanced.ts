/**
 * 高度ツール — 引用検証, 市民ガイド
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchLaws,
  getLawData,
  resolveLawRevisionId,
  extractArticle,
  findMaxArticleNumber,
} from "../lib/egov-client.js";
import {
  validateInput,
  notFoundResponse,
} from "../lib/helpers.js";
import { articleLinkMd } from "../lib/links.js";

export function registerAdvancedTools(server: McpServer): void {
  /**
   * verify_citations — 引用検証（ハルシネーション防止）
   */
  server.tool(
    "verify_citations",
    "テキスト中の法令引用が実在するか検証します。LLMのハルシネーション防止に使用。",
    {
      text: z
        .string()
        .describe(
          "検証するテキスト（法令引用を含む文章）。例: 「民法第750条に基づき...」"
        ),
    },
    async ({ text }) => {
      try {
        const validated = validateInput(text, 2000);

        // Extract citations from text
        const citations = extractCitations(validated);

        if (citations.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "法令引用が検出されませんでした。\n\n検出可能なパターン: 「○○法第X条」「○○法X条Y項」等",
              },
            ],
          };
        }

        const results: CitationVerification[] = [];
        let passCount = 0;
        let failCount = 0;

        for (const citation of citations) {
          const verification = await verifySingleCitation(citation);
          results.push(verification);
          if (verification.exists) {
            passCount++;
          } else {
            failCount++;
          }
        }

        const output = results
          .map((r) => {
            if (r.exists) {
              const link = r.lawId ? ` | ${articleLinkMd(r.lawId, r.article)}` : "";
              return `✅ **${r.lawName} 第${r.article}条${r.paragraph ? `第${r.paragraph}項` : ""}${r.item ? `第${r.item}号` : ""}** — 実在${r.caption ? `（${r.caption}）` : ""}${link}`;
            } else {
              return `❌ **${r.lawName} 第${r.article}条${r.paragraph ? `第${r.paragraph}項` : ""}${r.item ? `第${r.item}号` : ""}** — ${r.reason}`;
            }
          })
          .join("\n");

        const summary =
          failCount > 0
            ? `\n\n⚠️ [HALLUCINATION_DETECTED] ${failCount}件の引用が実在しません。LLMは推測・生成禁止。`
            : `\n\n✅ 全${passCount}件の引用が実在確認済み。`;

        return {
          content: [
            {
              type: "text" as const,
              text: `## 引用検証結果\n\n検出: ${citations.length}件 | 実在: ${passCount} | 不在: ${failCount}\n\n${output}${summary}`,
            },
          ],
          isError: failCount > 0,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[ERROR] ${error instanceof Error ? error.message : "不明なエラー"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * action_plan — 市民向け5ステップ実行ガイド
   */
  server.tool(
    "action_plan",
    "法律相談を5ステップの実行ガイドに変換します。自然言語で相談内容を入力してください。",
    {
      question: z
        .string()
        .describe(
          "相談内容（自然言語）。例: 「敷金を返してもらえない」「残業代が払われない」"
        ),
    },
    async ({ question }) => {
      try {
        const validated = validateInput(question, 500);

        // Keyword extraction for law search
        const keywords = extractLegalKeywords(validated);

        // Search relevant laws
        const relevantLaws: Array<{
          title: string;
          lawId: string;
          relevance: string;
        }> = [];

        for (const kw of keywords.slice(0, 3)) {
          const results = await searchLaws(kw, { limit: 3 });
          for (const r of results) {
            if (!relevantLaws.find((l) => l.lawId === r.lawId)) {
              relevantLaws.push({
                title: r.lawTitle,
                lawId: r.lawId,
                relevance: kw,
              });
            }
          }
        }

        // Also try keyword search
        const kwResults = await searchLaws(validated.substring(0, 50), {
          limit: 5,
        });
        for (const r of kwResults) {
          if (!relevantLaws.find((l) => l.lawId === r.lawId)) {
            relevantLaws.push({
              title: r.lawTitle,
              lawId: r.lawId,
              relevance: "直接検索",
            });
          }
        }

        const output = [
          `## 📋 実行ガイド`,
          ``,
          `> 相談: 「${validated}」`,
          ``,
          `### STEP 1: 状況診断 — 関連法令の特定`,
          ``,
          relevantLaws.length > 0
            ? relevantLaws
                .slice(0, 5)
                .map((l) => `- **${l.title}** (検索: ${l.relevance})`)
                .join("\n")
            : "⚠️ 関連法令を自動特定できませんでした。より具体的な相談内容を入力してください。",
          ``,
          `### STEP 2: 権利・救済手段`,
          ``,
          `上記法令に基づく権利を確認するには:`,
          relevantLaws.length > 0
            ? `\`\`\`\nfind_article で「${relevantLaws[0].title}」の関連条文を確認\n\`\`\``
            : "（法令特定後に確認可能）",
          ``,
          `### STEP 3: 申請先・期限`,
          ``,
          `- 📍 相談窓口: 法テラス (0570-078374)`,
          `- 📍 弁護士会: 各地域の弁護士会無料相談`,
          `- 📍 行政相談: 総務省行政相談 (0570-090110)`,
          `- ⏰ 時効に注意: 民事は原則5年（民法第166条）、不法行為は3年（民法第724条）`,
          ``,
          `### STEP 4: 必要書類（一般的）`,
          ``,
          `- 契約書・領収書等の証拠書類`,
          `- 相手方とのやり取り記録（メール、LINE等）`,
          `- 被害・損害の記録（写真、日記等）`,
          `- 本人確認書類`,
          ``,
          `### STEP 5: 注意点`,
          ``,
          `- ⚠️ 時効の確認（権利行使には期限があります）`,
          `- ⚠️ 証拠の保全（早めに記録を残す）`,
          `- ⚠️ 専門家への相談推奨（法テラスは無料）`,
          `- ⚠️ このガイドは一般的な情報提供であり、法的助言ではありません`,
          ``,
          `---`,
          `💡 次にできること:`,
          relevantLaws.length > 0
            ? [
                `- \`find_article\` で「${relevantLaws[0].title}」の具体的条文を確認`,
                `- \`verify_citations\` で情報の正確性を検証`,
              ].join("\n")
            : `- より具体的なキーワードで \`search_laws\` を実行`,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[ERROR] ${error instanceof Error ? error.message : "不明なエラー"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// ============ Helper functions ============

interface Citation {
  lawName: string;
  article: string;
  paragraph?: string;
  item?: string;
  originalText: string;
}

interface CitationVerification extends Citation {
  exists: boolean;
  reason?: string;
  caption?: string;
  lawId?: string;
}

/**
 * テキストから法令引用を抽出
 */
function extractCitations(text: string): Citation[] {
  const citations: Citation[] = [];
  const pattern =
    /(?:^|[、。，．\s「」（）])([^\s、。「」（）]{1,15}(?:法|令|規則|条例))第(\d+)条(?:の(\d+))?(?:第(\d+)項)?(?:第(\d+)号)?/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    citations.push({
      lawName: match[1],
      article: match[2] + (match[3] ? `_${match[3]}` : ""),
      paragraph: match[4] || undefined,
      item: match[5] || undefined,
      originalText: match[0].trim(),
    });
  }

  return citations;
}

/**
 * 単一引用の検証
 */
async function verifySingleCitation(
  citation: Citation
): Promise<CitationVerification> {
  try {
    const revisionId = await resolveLawRevisionId(citation.lawName);
    if (!revisionId) {
      return {
        ...citation,
        exists: false,
        reason: `法令「${citation.lawName}」が見つかりません`,
      };
    }

    const lawData = await getLawData(revisionId);
    const articleNum = citation.article;
    const article = extractArticle(lawData.lawFullText, articleNum, lawData.lawTitle);

    if (!article) {
      const maxArticle = findMaxArticleNumber(lawData.lawFullText);
      return {
        ...citation,
        exists: false,
        reason: maxArticle
          ? `第${citation.article.replace("_", "条の")}条が存在しません（範囲: 第1条〜第${maxArticle}条）`
          : `第${citation.article.replace("_", "条の")}条が存在しません`,
      };
    }

    // Check paragraph exists
    if (citation.paragraph && article.paragraphs) {
      const para = article.paragraphs.find(
        (p) => p.paragraphNum === citation.paragraph
      );
      if (!para) {
        const maxPara = Math.max(
          ...article.paragraphs.map((p) => parseInt(p.paragraphNum))
        );
        return {
          ...citation,
          exists: false,
          reason: `第${citation.paragraph}項が存在しません（最大第${maxPara}項）`,
        };
      }

      if (citation.item && para.items) {
        const item = para.items.find((i) => i.itemNum === citation.item);
        if (!item) {
          const maxItem = Math.max(
            ...para.items.map((i) => parseInt(i.itemNum))
          );
          return {
            ...citation,
            exists: false,
            reason: `第${citation.item}号が存在しません（最大第${maxItem}号）`,
          };
        }
      }
    }

    return {
      ...citation,
      exists: true,
      caption: article.articleCaption || undefined,
      lawId: lawData.lawId,
    };
  } catch {
    return {
      ...citation,
      exists: false,
      reason: "検証中にエラーが発生しました",
    };
  }
}

/**
 * 相談文から法律キーワードを抽出
 */
function extractLegalKeywords(text: string): string[] {
  const keywords: string[] = [];

  const domainMap: Record<string, string[]> = {
    敷金: ["借地借家法", "民法"],
    家賃: ["借地借家法"],
    退去: ["借地借家法"],
    賃貸: ["借地借家法", "民法"],
    残業: ["労働基準法"],
    解雇: ["労働基準法", "労働契約法"],
    有給: ["労働基準法"],
    パワハラ: ["労働施策総合推進法"],
    セクハラ: ["男女雇用機会均等法"],
    離婚: ["民法"],
    相続: ["民法", "相続税法"],
    交通事故: ["道路交通法", "自動車損害賠償保障法"],
    詐欺: ["刑法", "消費者契約法"],
    個人情報: ["個人情報保護法"],
    著作権: ["著作権法"],
    特許: ["特許法"],
    商標: ["商標法"],
    会社設立: ["会社法"],
    株主: ["会社法"],
    税金: ["所得税法", "法人税法"],
    確定申告: ["所得税法"],
    建築: ["建築基準法"],
    騒音: ["環境基本法"],
    近隣トラブル: ["民法"],
    ストーカー: ["ストーカー規制法"],
    DV: ["DV防止法"],
    児童虐待: ["児童虐待防止法"],
    いじめ: ["いじめ防止対策推進法"],
    名誉毀損: ["刑法", "民法"],
    プライバシー: ["個人情報保護法", "民法"],
  };

  for (const [keyword, laws] of Object.entries(domainMap)) {
    if (text.includes(keyword)) {
      keywords.push(...laws);
    }
  }

  return [...new Set(keywords)];
}
