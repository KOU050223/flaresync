# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

開発環境は Nix + direnv で管理している。`direnv allow` 済みであれば `node`, `pnpm`, `wrangler` が自動で PATH に入る。

```bash
# 依存インストール
pnpm install

# テスト（packages/server）
pnpm --filter flaresync test

# テストをウォッチ
pnpm --filter flaresync test:watch

# 型チェック（全パッケージ）
pnpm --filter flaresync tsc --noEmit
pnpm --filter flaresync-example-basic tsc --noEmit

# ローカル動作確認
cd examples/basic && pnpm dev
```

## Architecture

pnpm workspace 構成で `packages/server`（npm: `flaresync` — サーバー用エントリと `flaresync/client` サブパスを両方提供）を持つ。`examples/basic` は `wrangler dev` で動かす動作確認用サンプル。

詳細はドキュメント参照

アーキテクト： ＠docs/architecture.md
設計判断： @docs/decisions.md
タスク一覧： @docs/todo.md

## 開発方針

**TDD で進める。** フェーズごとに：

1. `feat/phase-N` ブランチでテストを先に実装（全 RED）→ コードレビュー
2. 同一ブランチで実装し全 GREEN にする → PR を作成

テストは `packages/server/src/*.test.ts` に置き、`DurableObjectState` のモックは `makeCtx()` ヘルパーで作る（[`DurableSync.test.ts`](packages/server/src/DurableSync.test.ts) を参照）。
