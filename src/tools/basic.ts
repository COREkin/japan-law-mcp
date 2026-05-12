/**
 * 基本ツール — 法令検索・条文取得・改正履歴
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchLaws,
  searchByKeyword,
  getLawData,
  resolveLawRevisionId,
  extractArticle,
  normalizeLawName,
  getCacheStats,
  clearCache,
} from "../lib/egov-client.js";
import {
  validateInput,
  notFoundResponse,
  parseArticleReference,
} from "../lib/helpers.js";
import { lawLinkMd, articleLinkMd } from "../lib/links.js";

export function registerBasicTools(server: McpServer): void {
  /**
   * search_laws — 法令名で検索
   */
  server.tool(
    "search_laws",
    "法令名で法令を検索します。略称にも対応（労基法→労働基準法）",
    {
      query: z.string().describe("検索する法令名（略称可）"),
      limit: z.number().optional().describe("最大件数（デフォルト: 10）"),
    },
    async ({ query, limit }) => {
      try {
        const validated = validateInput(query);
        const results = await searchLaws(validated, { limit: limit || 10 });

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: notFoundResponse(
                  `「${query}」に該当する法令が見つかりません`,
                  [
                    `正式名称で検索してみてください`,
                    `search_by_keyword でキーワード検索を試してください`,
                  ]
                ),
              },
            ],
          };
        }

        const text = results
          .map(
            (r, i) =>
              `${i + 1}. **${r.lawTitle}**\n   法令番号: ${r.lawNum}\n   ${lawLinkMd(r.lawId)}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `## 検索結果: 「${query}」\n\n${text}\n\n---\n💡 条文を見るには \`find_article\` を使ってください`,
            },
          ],
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
   * search_by_keyword — キーワード全文検索
   */
  server.tool(
    "search_by_keyword",
    "法令の本文をキーワードで全文検索します",
    {
      keyword: z.string().describe("検索キーワード"),
      limit: z.number().optional().describe("最大件数（デフォルト: 10）"),
    },
    async ({ keyword, limit }) => {
      try {
        const validated = validateInput(keyword);
        const results = await searchByKeyword(validated, {
          limit: limit || 10,
        });

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: notFoundResponse(
                  `「${keyword}」を含む法令が見つかりません`,
                  [`別のキーワードで試してください`, `法令名検索: search_laws`]
                ),
              },
            ],
          };
        }

        const text = results
          .map(
            (r, i) =>
              `${i + 1}. **${r.lawTitle}**\n   法令番号: ${r.lawNum}\n   ${lawLinkMd(r.lawId)}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `## キーワード検索: 「${keyword}」\n\n${text}`,
            },
          ],
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
   * find_article — 条文ピンポイント取得
   */
  server.tool(
    "find_article",
    "特定の法令の条文を取得します。「民法第709条」「労基法36条1項」等",
    {
      law_name: z.string().describe("法令名（略称可）"),
      article: z
        .string()
        .describe("条文番号（例: 709, 第36条第1項, 325条の3）"),
    },
    async ({ law_name, article }) => {
      try {
        const validatedLaw = validateInput(law_name, 100);
        const validatedArticle = validateInput(article, 50);

        // Resolve law revision ID
        const revisionId = await resolveLawRevisionId(validatedLaw);
        if (!revisionId) {
          return {
            content: [
              {
                type: "text" as const,
                text: notFoundResponse(
                  `法令「${law_name}」が見つかりません`,
                  [
                    `search_laws で正式名称を確認してください`,
                    `略称: 労基法, 道交法, 独禁法 等が使えます`,
                  ]
                ),
              },
            ],
          };
        }

        // Get law content
        const lawData = await getLawData(revisionId);
        const parsed = parseArticleReference(validatedArticle);

        // Extract article
        const articleNum = parsed.appendedArticle
          ? `${parsed.article}_${parsed.appendedArticle}`
          : parsed.article;

        const result = extractArticle(lawData.lawFullText, articleNum, lawData.lawTitle);
        if (!result) {
          return {
            content: [
              {
                type: "text" as const,
                text: notFoundResponse(
                  `${normalizeLawName(law_name)} 第${parsed.article}条${parsed.appendedArticle ? `の${parsed.appendedArticle}` : ""} が見つかりません`,
                  [
                    `条文番号を確認してください`,
                    `get_law_content で法令全文を確認できます`,
                  ]
                ),
              },
            ],
          };
        }

        let text = `## ${result.lawTitle} 第${result.articleNumber}条`;
        if (result.articleCaption) {
          text += `（${result.articleCaption}）`;
        }
        text += `\n\n${result.articleText}`;

        // Filter by paragraph/item if specified
        if (parsed.paragraph && result.paragraphs) {
          const para = result.paragraphs.find(
            (p) => p.paragraphNum === parsed.paragraph
          );
          if (para) {
            text += `\n\n---\n📌 指定: 第${parsed.paragraph}項\n${para.paragraphText}`;
            if (parsed.item && para.items) {
              const item = para.items.find((i) => i.itemNum === parsed.item);
              if (item) {
                text += `\n📌 第${parsed.item}号: ${item.itemText}`;
              }
            }
          }
        }

        text += `\n\n🔗 ${articleLinkMd(lawData.lawId, result.articleNumber)}`;

        return {
          content: [{ type: "text" as const, text }],
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
   * get_law_content — 法令全文取得
   */
  server.tool(
    "get_law_content",
    "法令の全文を取得します（大きい法令は要約されます）",
    {
      law_name: z.string().describe("法令名（略称可）またはlawId"),
      format: z
        .enum(["text", "xml"])
        .optional()
        .describe("出力形式（デフォルト: text）"),
    },
    async ({ law_name, format }) => {
      try {
        const validated = validateInput(law_name, 100);

        const revisionId = await resolveLawRevisionId(validated);
        if (!revisionId) {
          return {
            content: [
              {
                type: "text" as const,
                text: notFoundResponse(
                  `法令「${law_name}」が見つかりません`
                ),
              },
            ],
          };
        }

        const lawData = await getLawData(revisionId);

        if (format === "xml") {
          const body = JSON.stringify(lawData.lawFullText, null, 2);
          const truncated = body.length > 100000
            ? body.substring(0, 100000) + "\n\n... [truncated: 100KB limit]"
            : body;
          return {
            content: [
              {
                type: "text" as const,
                text: `## ${lawData.lawTitle}\n法令番号: ${lawData.lawNum}\n\n\`\`\`json\n${truncated}\n\`\`\``,
              },
            ],
          };
        }

        // Text format: extract all text from JSON tree
        const { extractAllArticles } = await import("../lib/egov-client.js");
        const articles = extractAllArticles(lawData.lawFullText);
        let textBody = "";
        for (const [num, text] of articles) {
          textBody += `第${num}条 ${text}\n\n`;
        }
        const truncated = textBody.length > 50000
          ? textBody.substring(0, 50000) + "\n\n... [truncated: 50KB limit]"
          : textBody;

        return {
          content: [
            {
              type: "text" as const,
              text: `## ${lawData.lawTitle}\n法令番号: ${lawData.lawNum}\n\n${truncated}`,
            },
          ],
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
   * get_law_revisions — 改正履歴
   */
  server.tool(
    "get_law_revisions",
    "法令の改正履歴（沿革）を取得します",
    {
      law_name: z.string().describe("法令名（略称可）"),
    },
    async ({ law_name }) => {
      try {
        const validated = validateInput(law_name, 100);
        const results = await searchLaws(validated, { limit: 50 });
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: notFoundResponse(
                  `法令「${law_name}」が見つかりません`
                ),
              },
            ],
          };
        }

        // Filter to same law_id (different revisions = different amendments)
        const targetLawId = results[0].lawId;
        const revisions = results.filter((r) => r.lawId === targetLawId);

        if (revisions.length <= 1) {
          return {
            content: [
              {
                type: "text" as const,
                text: `## ${normalizeLawName(law_name)} — 改正履歴\n\n現行版のみ確認できました。\n- ${revisions[0]?.lawTitle} (${revisions[0]?.promulgationDate || "日付不明"})`,
              },
            ],
          };
        }

        const text = revisions
          .map(
            (r, i) =>
              `${i + 1}. ${r.promulgationDate || "日付不明"} — ${r.lawTitle} (${r.lawRevisionId})`
          )
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `## ${normalizeLawName(law_name)} — 改正履歴\n\n${text}`,
            },
          ],
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
   * batch_find_articles — バッチ条文検索
   */
  server.tool(
    "batch_find_articles",
    "複数の条文を一括検索します（最大20件）",
    {
      queries: z
        .array(
          z.object({
            law_name: z.string(),
            article: z.string(),
          })
        )
        .describe("検索クエリの配列 [{law_name, article}, ...]"),
    },
    async ({ queries }) => {
      if (queries.length > 20) {
        return {
          content: [
            {
              type: "text" as const,
              text: "[ERROR] 最大20件までです",
            },
          ],
          isError: true,
        };
      }

      const results: string[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const q of queries) {
        try {
          const revisionId = await resolveLawRevisionId(q.law_name);
          if (!revisionId) {
            results.push(
              `❌ ${q.law_name} 第${q.article}条 — 法令が見つかりません`
            );
            failCount++;
            continue;
          }

          const lawData = await getLawData(revisionId);
          const parsed = parseArticleReference(q.article);
          const articleNum = parsed.appendedArticle
            ? `${parsed.article}_${parsed.appendedArticle}`
            : parsed.article;
          const article = extractArticle(lawData.lawFullText, articleNum, lawData.lawTitle);

          if (article) {
            results.push(
              `✅ **${lawData.lawTitle} 第${parsed.article}条${parsed.appendedArticle ? `の${parsed.appendedArticle}` : ""}**\n${article.articleText.substring(0, 200)}${article.articleText.length > 200 ? "..." : ""}`
            );
            successCount++;
          } else {
            results.push(
              `❌ ${lawData.lawTitle} 第${q.article}条 — 条文が見つかりません`
            );
            failCount++;
          }
        } catch {
          results.push(`❌ ${q.law_name} 第${q.article}条 — エラー`);
          failCount++;
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `## バッチ検索結果\n\n成功: ${successCount} / 失敗: ${failCount}\n\n${results.join("\n\n")}`,
          },
        ],
      };
    }
  );

  /**
   * get_cache_stats — キャッシュ統計
   */
  server.tool(
    "get_cache_stats",
    "キャッシュのパフォーマンス統計を表示します",
    {},
    async () => {
      const stats = getCacheStats();
      return {
        content: [
          {
            type: "text" as const,
            text: `## キャッシュ統計\n\n| 種別 | サイズ | 最大 | ヒット率 |\n|------|--------|------|----------|\n| 検索 | ${stats.search.size} | ${stats.search.maxSize} | ${stats.search.hitRate} |\n| 本文 | ${stats.content.size} | ${stats.content.maxSize} | ${stats.content.hitRate} |\n| 条文 | ${stats.article.size} | ${stats.article.maxSize} | ${stats.article.hitRate} |`,
          },
        ],
      };
    }
  );

  /**
   * clear_cache — キャッシュクリア
   */
  server.tool(
    "clear_cache",
    "キャッシュをクリアします",
    {
      type: z
        .enum(["search", "content", "article", "all"])
        .optional()
        .describe("クリア対象（デフォルト: all）"),
    },
    async ({ type }) => {
      clearCache(type || "all");
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ キャッシュをクリアしました（対象: ${type || "all"}）`,
          },
        ],
      };
    }
  );
}
