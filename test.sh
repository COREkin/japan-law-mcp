#!/bin/bash
# japan-law-mcp 全ツール動作テスト
# 使い方: ./test.sh
# 前提: npm run build 済み

set -e

echo "🏛️ japan-law-mcp 全ツールテスト"
echo "================================"
echo ""

PASS=0
FAIL=0

run_test() {
  local name="$1"
  local id="$2"
  local input="$3"

  result=$(printf '%s\n%s\n%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
    "$input" \
    | node dist/index.js 2>/dev/null \
    | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    d = json.loads(line)
    if d.get('id') == 2:
        r = d.get('result', {})
        content = r.get('content', [{}])
        text = content[0].get('text', '') if content else ''
        is_err = r.get('isError', False)
        # verify_citations の isError は環覚検出時の正常動作
        if '${name}' == 'verify_citations' and 'HALLUCINATION_DETECTED' in text:
            is_err = False
        print('ERROR' if is_err else 'OK')
        print(text[:150])
" 2>/dev/null)

  status=$(echo "$result" | head -1)
  preview=$(echo "$result" | tail -n +2 | head -3)

  if [ "$status" = "OK" ]; then
    echo "✅ $name"
    PASS=$((PASS + 1))
  else
    echo "❌ $name"
    FAIL=$((FAIL + 1))
  fi
  echo "   $preview"
  echo ""
}

# 1. search_laws
run_test "search_laws" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_laws","arguments":{"query":"民法","limit":2}}}'

# 2. search_by_keyword
run_test "search_by_keyword" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_by_keyword","arguments":{"keyword":"損害賠償","limit":2}}}'

# 3. find_article
run_test "find_article" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"find_article","arguments":{"law_name":"民法","article":"709"}}}'

# 4. get_law_content
run_test "get_law_content" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_law_content","arguments":{"law_name":"少年法","format":"text"}}}'

# 5. get_law_revisions
run_test "get_law_revisions" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_law_revisions","arguments":{"law_name":"民法"}}}'

# 6. batch_find_articles
run_test "batch_find_articles" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"batch_find_articles","arguments":{"queries":[{"law_name":"民法","article":"709"},{"law_name":"刑法","article":"199"}]}}}'

# 7. verify_citations
run_test "verify_citations" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"verify_citations","arguments":{"text":"民法第709条に基づき損害賠償を請求し、刑法第9999条により処罰される"}}}'

# 8. action_plan
run_test "action_plan" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"action_plan","arguments":{"question":"残業代が払われない"}}}'

# 9. get_cache_stats
run_test "get_cache_stats" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_cache_stats","arguments":{}}}'

# 10. clear_cache
run_test "clear_cache" 2 \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"clear_cache","arguments":{"type":"all"}}}'

echo "================================"
echo "結果: ✅ $PASS 成功 / ❌ $FAIL 失敗 (全10ツール)"
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi
