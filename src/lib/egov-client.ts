/**
 * e-Gov 法令API v2 クライアント
 * Base URL: https://laws.e-gov.go.jp/api/2
 *
 * エンドポイント:
 * - GET /laws?law_title=X — 法令一覧検索
 * - GET /laws?keyword=X — キーワード検索
 * - GET /law_data/{law_revision_id} — 法令本文取得 (JSON tree)
 *
 * 応答構造:
 * - laws: [{law_info: {law_id, law_num, ...}, revision_info: {law_revision_id, law_title, ...}}]
 * - law_data: {law_full_text: {tag, attr, children}, law_info, revision_info}
 */

import { LRUCache } from "./cache.js";
import { LAW_ALIASES, COMMON_LAWS } from "./law-mappings.js";

const BASE_URL = process.env.EGOV_API_URL || "https://laws.e-gov.go.jp/api/2";
const USER_AGENT =
  process.env.JAPAN_LAW_USER_AGENT ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// 3-tier cache
const searchCache = new LRUCache<string, unknown>(100, 2 * 60 * 60 * 1000); // 2h
const contentCache = new LRUCache<string, unknown>(50, 60 * 60 * 1000); // 1h
const articleCache = new LRUCache<string, unknown>(200, 30 * 60 * 1000); // 30m

// ============ Types ============

export interface LawSearchResult {
  lawId: string;
  lawRevisionId: string;
  lawNum: string;
  lawTitle: string;
  lawType: string;
  promulgationDate?: string;
  category?: string;
}

export interface LawFullData {
  lawId: string;
  lawRevisionId: string;
  lawTitle: string;
  lawNum: string;
  lawFullText: JsonNode; // JSON tree
}

export interface LawRevision {
  lawRevisionId: string;
  lawTitle: string;
  amendmentLawTitle?: string;
  amendmentEnforcementDate?: string;
  amendmentPromulgateDate?: string;
}

export interface ArticleResult {
  lawTitle: string;
  articleNumber: string;
  articleCaption?: string;
  articleText: string;
  paragraphs?: ParagraphResult[];
}

export interface ParagraphResult {
  paragraphNum: string;
  paragraphText: string;
  items?: ItemResult[];
}

export interface ItemResult {
  itemNum: string;
  itemText: string;
}

/** e-Gov JSON tree node */
interface JsonNode {
  tag: string;
  attr?: Record<string, string>;
  children?: (JsonNode | string)[];
}

// ============ HTTP ============

async function fetchWithRetry(
  url: string,
  retries = 3,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      });
      if (response.ok) return response;
      if (response.status === 429 || response.status >= 500) {
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
        continue;
      }
      return response; // 4xx — don't retry
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

// ============ Public API ============

/**
 * 法令名の正規化（略称→正式名称）
 */
export function normalizeLawName(name: string): string {
  const trimmed = name.trim();
  return LAW_ALIASES[trimmed] || trimmed;
}

/**
 * 法令検索
 */
export async function searchLaws(
  query: string,
  options: { limit?: number } = {}
): Promise<LawSearchResult[]> {
  const normalized = normalizeLawName(query);
  const limit = options.limit || 20;
  const cacheKey = `search:${normalized}:${limit}`;

  const cached = searchCache.get(cacheKey);
  if (cached) return cached as LawSearchResult[];

  const params = new URLSearchParams({
    law_title: normalized,
    limit: String(limit),
    offset: "0",
  });

  const url = `${BASE_URL}/laws?${params}`;
  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`e-Gov API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    laws?: Array<{
      law_info: { law_id: string; law_num: string; law_type: string; promulgation_date?: string };
      revision_info: { law_revision_id: string; law_title: string; category?: string };
    }>;
  };

  const results: LawSearchResult[] = (data.laws || []).map((l) => ({
    lawId: l.law_info.law_id,
    lawRevisionId: l.revision_info.law_revision_id,
    lawNum: l.law_info.law_num,
    lawTitle: l.revision_info.law_title,
    lawType: l.law_info.law_type,
    promulgationDate: l.law_info.promulgation_date,
    category: l.revision_info.category,
  }));

  searchCache.set(cacheKey, results);
  return results;
}

/**
 * キーワード検索
 */
export async function searchByKeyword(
  keyword: string,
  options: { limit?: number } = {}
): Promise<LawSearchResult[]> {
  const limit = options.limit || 20;
  const cacheKey = `keyword:${keyword}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached as LawSearchResult[];

  const params = new URLSearchParams({
    keyword,
    limit: String(limit),
    offset: "0",
  });

  const url = `${BASE_URL}/laws?${params}`;
  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`e-Gov API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    laws?: Array<{
      law_info: { law_id: string; law_num: string; law_type: string; promulgation_date?: string };
      revision_info: { law_revision_id: string; law_title: string; category?: string };
    }>;
  };

  const results: LawSearchResult[] = (data.laws || []).map((l) => ({
    lawId: l.law_info.law_id,
    lawRevisionId: l.revision_info.law_revision_id,
    lawNum: l.law_info.law_num,
    lawTitle: l.revision_info.law_title,
    lawType: l.law_info.law_type,
    promulgationDate: l.law_info.promulgation_date,
    category: l.revision_info.category,
  }));

  searchCache.set(cacheKey, results);
  return results;
}

/**
 * 法令本文取得 (law_revision_id で取得)
 */
export async function getLawData(lawRevisionId: string): Promise<LawFullData> {
  const cacheKey = `content:${lawRevisionId}`;
  const cached = contentCache.get(cacheKey);
  if (cached) return cached as LawFullData;

  const url = `${BASE_URL}/law_data/${encodeURIComponent(lawRevisionId)}`;
  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`e-Gov API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    law_info: { law_id: string; law_num: string };
    revision_info: { law_revision_id: string; law_title: string };
    law_full_text: JsonNode;
  };

  const result: LawFullData = {
    lawId: data.law_info.law_id,
    lawRevisionId: data.revision_info.law_revision_id,
    lawTitle: data.revision_info.law_title,
    lawNum: data.law_info.law_num,
    lawFullText: data.law_full_text,
  };

  contentCache.set(cacheKey, result);
  return result;
}

/**
 * 法令改正履歴取得
 */
export async function getLawRevisions(lawId: string): Promise<LawRevision[]> {
  const cacheKey = `revisions:${lawId}`;
  const cached = contentCache.get(cacheKey);
  if (cached) return cached as LawRevision[];

  // Search all revisions by searching with the law_id
  const params = new URLSearchParams({
    law_title: "",
    limit: "100",
    offset: "0",
  });

  // e-Gov doesn't have a direct revisions endpoint — we get revisions from search
  // For now, return the current revision info from search
  const searchResults = await searchLaws("", { limit: 1 });
  // This is a limitation — we'll use the law_data endpoint's revision_info
  const results: LawRevision[] = [];
  contentCache.set(cacheKey, results);
  return results;
}

/**
 * 法令IDからlaw_revision_idを解決
 */
export async function resolveLawRevisionId(lawName: string): Promise<string | null> {
  const normalized = normalizeLawName(lawName);

  // Check common laws first
  const commonLaw = COMMON_LAWS[normalized];
  if (commonLaw) {
    // Search to get the current revision ID
    const results = await searchLaws(normalized, { limit: 5 });
    const match = results.find((r) => r.lawId === commonLaw.lawId);
    if (match) return match.lawRevisionId;
    if (results.length > 0) return results[0].lawRevisionId;
  }

  // Search via API
  const results = await searchLaws(normalized, { limit: 10 });
  if (results.length === 0) return null;

  // Exact title match first
  const exact = results.find(
    (r) => r.lawTitle === normalized || r.lawTitle.includes(normalized)
  );
  return exact?.lawRevisionId || results[0].lawRevisionId;
}

/**
 * 条文抽出（JSON tree から特定条文を抽出）
 */
export function extractArticle(
  lawFullText: JsonNode,
  articleNumber: string,
  lawTitle: string
): ArticleResult | null {
  const normalizedNum = normalizeArticleNumber(articleNumber);
  const cacheKey = `article:${lawTitle}:${normalizedNum}`;
  const cached = articleCache.get(cacheKey);
  if (cached) return cached as ArticleResult;

  const articleNode = findArticleNode(lawFullText, normalizedNum);
  if (!articleNode) return null;

  const result = parseArticleNode(articleNode, normalizedNum, lawTitle);
  if (result) {
    articleCache.set(cacheKey, result);
  }
  return result;
}

/**
 * 全条文抽出（Map<条文番号, テキスト>）
 */
export function extractAllArticles(lawFullText: JsonNode): Map<string, string> {
  const articles = new Map<string, string>();
  findAllArticleNodes(lawFullText, articles);
  return articles;
}

/**
 * 最大条文番号を取得
 */
export function findMaxArticleNumber(lawFullText: JsonNode): string | null {
  const articles = extractAllArticles(lawFullText);
  let max = 0;
  for (const key of articles.keys()) {
    const num = parseInt(key);
    if (!isNaN(num) && num > max) max = num;
  }
  return max > 0 ? String(max) : null;
}

// ============ Cache management ============

export function getCacheStats() {
  return {
    search: searchCache.stats(),
    content: contentCache.stats(),
    article: articleCache.stats(),
  };
}

export function clearCache(type?: "search" | "content" | "article" | "all") {
  switch (type) {
    case "search": searchCache.clear(); break;
    case "content": contentCache.clear(); break;
    case "article": articleCache.clear(); break;
    default:
      searchCache.clear();
      contentCache.clear();
      articleCache.clear();
  }
}

// ============ Internal helpers ============

function normalizeArticleNumber(input: string): string {
  let num = input.trim();
  num = num.replace(/^第/, "").replace(/条.*$/, "");
  num = num.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  num = kanjiToArabic(num);
  // Handle "X_Y" format for 条の2 etc.
  return num;
}

function kanjiToArabic(str: string): string {
  const kanjiDigits: Record<string, number> = {
    〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };

  // Check if it contains kanji numbers
  if (!/[〇一二三四五六七八九十百千万]/.test(str)) return str;

  let result = 0;
  let current = 0;

  for (const char of str) {
    if (char === "十") {
      result += (current || 1) * 10;
      current = 0;
    } else if (char === "百") {
      result += (current || 1) * 100;
      current = 0;
    } else if (char === "千") {
      result += (current || 1) * 1000;
      current = 0;
    } else if (kanjiDigits[char] !== undefined) {
      current = kanjiDigits[char];
    } else {
      return str; // Not a pure kanji number
    }
  }
  result += current;
  return result > 0 ? String(result) : str;
}

function findArticleNode(node: JsonNode | string, targetNum: string): JsonNode | null {
  if (typeof node === "string") return null;

  if (node.tag === "Article" && node.attr?.Num === targetNum) {
    return node;
  }

  // Handle 条の2 format: Num might be "709_2" or similar
  if (node.tag === "Article" && targetNum.includes("_")) {
    const [base, sub] = targetNum.split("_");
    if (node.attr?.Num === base) {
      // Check if this is the right sub-article
      // For now, simple match
    }
  }

  if (node.children) {
    for (const child of node.children) {
      if (typeof child !== "string") {
        const found = findArticleNode(child, targetNum);
        if (found) return found;
      }
    }
  }
  return null;
}

function findAllArticleNodes(node: JsonNode | string, result: Map<string, string>): void {
  if (typeof node === "string") return;

  if (node.tag === "Article" && node.attr?.Num) {
    result.set(node.attr.Num, extractTextFromNode(node));
  }

  if (node.children) {
    for (const child of node.children) {
      if (typeof child !== "string") {
        findAllArticleNodes(child, result);
      }
    }
  }
}

function parseArticleNode(node: JsonNode, articleNum: string, lawTitle: string): ArticleResult | null {
  // Extract caption (ArticleCaption tag)
  const captionNode = findChildByTag(node, "ArticleCaption");
  const titleNode = findChildByTag(node, "ArticleTitle");
  const caption = captionNode ? extractTextFromNode(captionNode) : undefined;

  // Extract paragraphs
  const paragraphs: ParagraphResult[] = [];
  if (node.children) {
    for (const child of node.children) {
      if (typeof child !== "string" && child.tag === "Paragraph") {
        const paraNum = child.attr?.Num || "1";
        const sentenceNode = findChildByTag(child, "ParagraphSentence");
        const paraText = sentenceNode ? extractTextFromNode(sentenceNode) : "";

        const items: ItemResult[] = [];
        if (child.children) {
          for (const itemChild of child.children) {
            if (typeof itemChild !== "string" && itemChild.tag === "Item") {
              const itemNum = itemChild.attr?.Num || "";
              const itemSentence = findChildByTag(itemChild, "ItemSentence");
              items.push({
                itemNum,
                itemText: itemSentence ? extractTextFromNode(itemSentence) : extractTextFromNode(itemChild),
              });
            }
          }
        }

        paragraphs.push({
          paragraphNum: paraNum,
          paragraphText: paraText,
          items: items.length > 0 ? items : undefined,
        });
      }
    }
  }

  // Build article text
  let articleText: string;
  if (paragraphs.length > 0) {
    articleText = paragraphs
      .map((p) => {
        const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
        const prefix = parseInt(p.paragraphNum) === 1 ? "" : (circled[parseInt(p.paragraphNum) - 2] || `(${p.paragraphNum})`) + " ";
        let text = `${prefix}${p.paragraphText}`;
        if (p.items) {
          text += "\n" + p.items.map((i) => `  ${i.itemNum} ${i.itemText}`).join("\n");
        }
        return text;
      })
      .join("\n");
  } else {
    articleText = extractTextFromNode(node);
  }

  // Clean up caption from article text
  const cleanCaption = caption?.replace(/[（）()]/g, "").trim();

  return {
    lawTitle,
    articleNumber: articleNum,
    articleCaption: cleanCaption || (titleNode ? extractTextFromNode(titleNode) : undefined),
    articleText,
    paragraphs: paragraphs.length > 0 ? paragraphs : undefined,
  };
}

function findChildByTag(node: JsonNode, tag: string): JsonNode | null {
  if (!node.children) return null;
  for (const child of node.children) {
    if (typeof child !== "string" && child.tag === tag) return child;
  }
  return null;
}

function extractTextFromNode(node: JsonNode | string): string {
  if (typeof node === "string") return node;
  if (!node.children) return "";
  return node.children.map((child) => {
    if (typeof child === "string") return child;
    return extractTextFromNode(child);
  }).join("");
}
