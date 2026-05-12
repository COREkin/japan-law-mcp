/**
 * e-Gov 法令ページへのリンク生成
 *
 * URL パターン:
 * - 法令トップ: https://laws.e-gov.go.jp/law/{lawId}
 * - 条文アンカー: https://laws.e-gov.go.jp/law/{lawId}#{articleNum}
 */

const EGOV_BASE = "https://laws.e-gov.go.jp/law";

/**
 * 法令ページへのリンクを生成
 */
export function lawLink(lawId: string): string {
  return `${EGOV_BASE}/${lawId}`;
}

/**
 * 条文へのリンクを生成（アンカー付き）
 */
export function articleLink(lawId: string, articleNum: string): string {
  return `${EGOV_BASE}/${lawId}#${articleNum}`;
}

/**
 * Markdown リンクを生成
 */
export function lawLinkMd(lawId: string, label?: string): string {
  const url = lawLink(lawId);
  return `[${label || "e-Gov で見る"}](${url})`;
}

/**
 * 条文への Markdown リンクを生成
 */
export function articleLinkMd(lawId: string, articleNum: string, label?: string): string {
  const url = articleLink(lawId, articleNum);
  return `[${label || `第${articleNum}条を e-Gov で見る`}](${url})`;
}
