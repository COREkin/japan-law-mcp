/**
 * 共通ヘルパー関数
 */

/**
 * NOT_FOUND レスポンス生成（LLM環覚防止用）
 */
export function notFoundResponse(
  message: string,
  suggestions?: string[]
): string {
  let response = `[NOT_FOUND] ${message}\n⚠️ LLMは推測・生成禁止。この情報は存在しません。`;
  if (suggestions && suggestions.length > 0) {
    response += `\n\n💡 代わりに試せること:\n${suggestions.map((s) => `  - ${s}`).join("\n")}`;
  }
  return response;
}

/**
 * 入力バリデーション
 */
export function validateInput(input: string, maxLength = 200): string {
  if (!input || typeof input !== "string") {
    throw new Error("入力が空です");
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("入力が空です");
  }
  if (trimmed.length > maxLength) {
    throw new Error(`入力が長すぎます（最大${maxLength}文字）`);
  }
  // Injection prevention
  if (/[<>{}]|javascript:|data:|vbscript:/i.test(trimmed)) {
    throw new Error("不正な文字が含まれています");
  }
  return trimmed;
}

/**
 * 日付文字列のバリデーション (YYYY-MM-DD)
 */
export function validateDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("日付形式が不正です（YYYY-MM-DD）");
  }
  const [, year, month, day] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  if (
    date.getFullYear() !== parseInt(year) ||
    date.getMonth() !== parseInt(month) - 1 ||
    date.getDate() !== parseInt(day)
  ) {
    throw new Error("無効な日付です");
  }
  return dateStr;
}

/**
 * 条文番号パース
 * "第709条" → { article: "709" }
 * "第36条第1項" → { article: "36", paragraph: "1" }
 * "第36条第1項第2号" → { article: "36", paragraph: "1", item: "2" }
 */
export interface ParsedArticleRef {
  article: string;
  paragraph?: string;
  item?: string;
  appendedArticle?: string; // 条の2, 条の3 etc.
}

export function parseArticleReference(input: string): ParsedArticleRef {
  const cleaned = input
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    );

  const result: ParsedArticleRef = { article: "" };

  // Match: 第X条の2第Y項第Z号
  const fullMatch = cleaned.match(
    /第?(\d+)条(?:の(\d+))?(?:第(\d+)項)?(?:第(\d+)号)?/
  );
  if (fullMatch) {
    result.article = fullMatch[1];
    if (fullMatch[2]) result.appendedArticle = fullMatch[2];
    if (fullMatch[3]) result.paragraph = fullMatch[3];
    if (fullMatch[4]) result.item = fullMatch[4];
    return result;
  }

  // Simple number
  const simpleMatch = cleaned.match(/^(\d+)(?:条)?(?:の(\d+))?$/);
  if (simpleMatch) {
    result.article = simpleMatch[1];
    if (simpleMatch[2]) result.appendedArticle = simpleMatch[2];
    return result;
  }

  // Fallback: just use the input
  result.article = cleaned.replace(/[^0-9]/g, "") || cleaned;
  return result;
}

/**
 * 丸数字パース (①②③... → 1,2,3...)
 */
export function parseCircledNumber(char: string): number | null {
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  const idx = circled.indexOf(char);
  return idx >= 0 ? idx + 1 : null;
}

/**
 * diff 生成（2つのテキストの差分）
 */
export interface DiffResult {
  type: "added" | "removed" | "changed" | "unchanged";
  articleNum?: string;
  oldText?: string;
  newText?: string;
  text?: string;
}

export function generateArticleDiff(
  oldArticles: Map<string, string>,
  newArticles: Map<string, string>
): DiffResult[] {
  const results: DiffResult[] = [];
  const allKeys = new Set([...oldArticles.keys(), ...newArticles.keys()]);

  for (const key of [...allKeys].sort((a, b) => {
    const numA = parseInt(a) || 0;
    const numB = parseInt(b) || 0;
    return numA - numB;
  })) {
    const oldText = oldArticles.get(key);
    const newText = newArticles.get(key);

    if (!oldText && newText) {
      results.push({ type: "added", articleNum: key, newText });
    } else if (oldText && !newText) {
      results.push({ type: "removed", articleNum: key, oldText });
    } else if (oldText && newText && oldText !== newText) {
      results.push({ type: "changed", articleNum: key, oldText, newText });
    }
    // unchanged は省略
  }

  return results;
}
