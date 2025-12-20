# 小説家になろうビューワー

Amazon Kindle風の縦書き・横書き両対応の小説ビューワーです。

## 機能

-  縦書き/横書きの切り替え
-  3つのテーマ（セピア/ホワイト/ダーク）
-  フォントサイズ・行間・フォント種類の調整
-  目次から各話にジャンプ
-  読書進捗の自動保存
-  キーボード操作対応
-  スワイプでページめくり（モバイル対応）

## 使い方

1. 上部の入力欄に小説家になろうのURLまたはncodeを入力
2. 「読込」ボタンをクリック

例:
- `https://ncode.syosetu.com/n9669bk/`
- `n9669bk`

## ローカルで実行

```bash
cd novel-viewer
node server.js
```

ブラウザで `http://localhost:3000` を開く

## 既知の問題

- Vercelデプロイ時、Cloudflareによりなろうへのアクセスがブロックされる場合がある
- ローカル実行を推奨

## 技術スタック

- HTML/CSS/JavaScript（バニラ）
- Node.js（サーバー）
- Vercel Serverless Functions（使用を推奨しません）
