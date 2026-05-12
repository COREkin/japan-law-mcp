# japan-law-mcp

[![npm version](https://img.shields.io/npm/v/japan-law-mcp.svg)](https://www.npmjs.com/package/japan-law-mcp) [![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![CI](https://github.com/COREkin/japan-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/COREkin/japan-law-mcp/actions/workflows/ci.yml)

日本の法令を、AIアシスタントやターミナルから手軽に検索・活用できる MCP サーバーです。

韓国の [korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp) に触発されて開発しました。日本に住んでいても法令は難解で、必要な条文を探すだけで時間がかかります。このツールを使えば、Claude や Kiro などの AI アシスタントに「民法709条を教えて」「この文章の法令引用は正しい？」と聞くだけで、e-Gov（デジタル庁）の公式法令データベースから即座に正確な情報を取得できます。

**できること:**
- 法令の検索（法律・政令・府省令・規則、約9,000件。略称にも対応）
- 条文のピンポイント取得（条・項・号レベル）+ e-Gov リンク付き
- LLM が生成した法令引用が実在するか検証（ハルシネーション防止）
- 法令の改正履歴の確認

**検索できる法令の種類:**
| 種類 | 例 |
|------|-----|
| 憲法 | 日本国憲法 |
| 法律 | 民法、刑法、会社法、労働基準法、道路交通法 等 |
| 政令（施行令） | 民法施行令、道路交通法施行令 等 |
| 府省令（施行規則） | 道路交通法施行規則、建築基準法施行規則 等 |
| 規則 | 人事院規則、会計検査院規則 等 |

> e-Gov に収録されている法令がすべて対象です。告示・通達は対象外。

---

## クイックスタート

### インストール

インストール不要。MCP クライアントの設定に以下を追加するだけで使えます:

```json
{
  "mcpServers": {
    "japan-law": {
      "command": "npx",
      "args": ["japan-law-mcp"]
    }
  }
}
```

API キー不要。e-Gov 法令API v2 は公開APIのため、設定するだけですぐ使えます。

### ローカルビルド（開発用）

```bash
git clone https://github.com/COREkin/japan-law-mcp.git
cd japan-law-mcp
npm install
npm run build
```

```json
{
  "mcpServers": {
    "japan-law": {
      "command": "node",
      "args": ["/path/to/japan-law-mcp/dist/index.js"]
    }
  }
}
```

---

## 使い方（自然言語で聞くだけ）

MCP クライアント上で、普通に日本語で質問すれば OK です。

### 条文を調べる

**質問:**
```
民法709条について教えて
```

**応答:**
```
## 民法 第709条（不法行為による損害賠償）

故意又は過失によって他人の権利又は法律上保護される利益を侵害した者は、
これによって生じた損害を賠償する責任を負う。

第709条を e-Gov で見る: https://laws.e-gov.go.jp/law/129AC0000000089#709
```

### 法令引用が正しいか検証する

**質問:**
```
この文章の法令引用が正しいか検証して:
「民法第709条に基づき損害賠償を請求し、刑法第9999条により加重処罰される」
```

**応答:**
```
## 引用検証結果

検出: 2件 | 実在: 1 | 不在: 1

[OK] 民法 第709条 — 実在（不法行為による損害賠償）| 第709条を e-Gov で見る
[NG] 刑法 第9999条 — 存在しません（範囲: 第1条〜第264条）

[HALLUCINATION_DETECTED] 1件の引用が実在しません。
```

### 法律トラブルの相談

**質問:**
```
敷金を返してもらえない。どうすればいい？
```

**応答:**
```
## 実行ガイド

STEP 1: 状況診断 — 借地借家法を自動特定
STEP 2: 権利・救済手段
STEP 3: 申請先・期限 — 法テラス、弁護士会
STEP 4: 必要書類 — 契約書、やり取り記録
STEP 5: 注意点 — 時効（3年）、証拠保全
```

### その他の質問例

```
憲法第9条の改正履歴を見せて
労基法で有給休暇の規定は？
会社法と民法の条文をまとめて調べて
```

---

## ツール一覧

| ツール | 機能 | 説明 |
|--------|------|------|
| `search_laws` | 法令名検索 | 略称対応（労基法→労働基準法） |
| `search_by_keyword` | キーワード全文検索 | 法令本文からキーワードで探す |
| `find_article` | 条文取得 | 条・項・号レベルで正確に取得 |
| `get_law_content` | 法令全文 | 法令のテキスト全体を取得 |
| `get_law_revisions` | 改正履歴 | いつ、どう改正されたか |
| `batch_find_articles` | 一括検索 | 複数条文をまとめて取得（最大20件） |
| `verify_citations` | 引用検証 | LLMの法令引用が実在するか確認 |
| `action_plan` | 実行ガイド | 相談内容→5ステップの行動計画 |
| `get_cache_stats` | キャッシュ統計 | パフォーマンス確認 |
| `clear_cache` | キャッシュクリア | キャッシュの手動リセット |

---

## 特徴

### 基本機能
- **法令検索** — 法律名・略称・キーワードで検索（60以上の略称に対応）
- **条文取得** — 条・項・号レベルの精密取得 + e-Gov へのリンク付き
- **法令全文** — 構造化テキスト取得
- **改正履歴** — 法令の沿革情報

### 高度な機能

#### `verify_citations` — 引用検証（ハルシネーション防止）
LLMが生成した法令引用を e-Gov API で実在確認。存在しない条文を即座に検出し、条文の存在範囲まで報告します。

#### `action_plan` — 市民向け実行ガイド
自然言語の相談を、法的根拠 + 手続き + 必要書類 + 期限 + 注意点の5ステップに構造化。

---

## 技術スタック

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.x
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Data Source**: e-Gov 法令API v2 (`https://laws.e-gov.go.jp/api/2`)
- **Cache**: In-memory LRU (3-tier TTL: 検索2h / 本文1h / 条文30m)

## ライセンス

MIT License © 2026 金 棟植 (Dongsik Kim)

## 謝辞

- [e-Gov](https://laws.e-gov.go.jp/) — 法令API提供
- [korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp) — 設計インスピレーション
- [Model Context Protocol](https://modelcontextprotocol.io/) — プロトコル仕様
