# BNI パワーチーム機能 運用マニュアル

## URL構成

- **一覧**: `<WEBAPP_URL>?page=view`
- **提出**: `<WEBAPP_URL>?page=submit`
- **編集**: `<WEBAPP_URL>?page=edit`
- **管理**: `<WEBAPP_URL>?page=admin`
- **Sites（推奨）**: https://sites.google.com/search-mania.net/top-training/パワーチーム

WEBAPP_URL は GASの「デプロイを管理」から取得できます。
現在の運用中デプロイ ID: `AKfycbyDgUVWq1WkOGsEs-S6Hq84nD-gXYGcqpgj0ahP7imFhVUlQXNBuXTdVhmhrGhKu7I`（総合サイト002）

## メンバー案内テンプレ

LINE / メール送信用：

```
BNIパワーチームワークショップで書いた
ワークシート（p.3・p.4の2枚）を、
スマホで写真を撮って以下のURLから送信してください。
AIが自動で書き起こしします（約30秒）。

【提出】<SITES_URL>

やり方：
1. 「📄 提出する」をタップ
2. お名前を入力
3. p.3とp.4の写真を撮影（順不同OK）
4. 送信 → AI書き起こし結果を確認・修正 → 保存
```

## 管理者操作

| やりたいこと | 手順 |
|---|---|
| パワーチーム名の表記ゆれ統一 | スプレッドシートの E列（パワーチーム名）を直接編集して統一 |
| draft を confirmed に昇格 | `?page=admin` から「確定」ボタン |
| 誤提出の削除 | `?page=admin` から「削除」ボタン（論理削除） |
| 復元 | `?page=admin` から「復元」ボタン |
| 全提出の一括確認 | スプレッドシート「パワーチーム提出」シートを直接開く |

## デプロイ更新（コード変更後）

⚠️ **絶対に「新規デプロイ」を選ばないこと**（URL変わって既存カレンダー壊れる）

1. ローカルで `clasp push` 実行
2. GASエディタ →「デプロイ」→「デプロイを管理」
3. **既存デプロイの ✏️ 編集**
4. バージョンを「新バージョン」に変更
5. デプロイ

## トラブル対応

### AI書き起こしの精度が低い
- 原因：撮影が暗い/斜め/ボケている
- 対応：再撮影を依頼、明るい場所で真上から撮る

### モデル差し替え
- `powerteam.js` の `PT_MODEL_NAME` 定数を変更（例：`gemini-3.5-flash` → 別モデル）
- `clasp push` → デプロイ更新

### APIキー再発行
- Google AI Studio（h.kuniyoshi@search-mania.net）で新規発行
- GASエディタ →「⚙️ プロジェクトの設定」→「スクリプトプロパティ」→
  `GEMINI_API_KEY` を新しい値で更新
- 古いキーは Google AI Studio で無効化

### 送信エラー / タイムアウト
- 画像サイズが大きすぎる可能性 → クライアント圧縮は長辺2000px設定済み。
  それでも失敗する場合は `powerteam.js` の `PT_GEMINI_ENDPOINT` タイムアウトを確認
- Gemini APIレート制限：無料枠 1日1500回、100万トークン/日
  BNIチャプター規模なら十分だが、超えたら Google Cloud Console で課金化

### 表示権限
- 現状「全員公開」
- 変更したい場合：`appsscript.json` の `"access"` を変更し、
  Sites側も公開範囲を合わせる

## ログ確認

- GASエディタ「実行数」タブで doPost/doGet の実行状況・エラーを確認
- スタックトレースは Logger 出力＋GAS の実行ログに残る
- Gemini API のリクエスト内容は `Logger.log('Gemini call attempt...')` の周辺で確認可能

## ファイル構成

```
gas/top-chapter/
  appsscript.json      # スコープ設定
  コード.js             # 既存API（events/members） + doGet/doPost ルーティング
  powerteam.js         # 全パワーチーム機能（config, sheet, drive, gemini, CRUD）
  test_powerteam.js    # テスト関数群（本番でも残す、実行しない）
  include.html         # 共通CSS/JS
  view.html            # 一覧表示ページ
  submit.html          # 提出フォーム
  edit.html            # 編集ページ
  admin.html           # 管理画面
```

## リンク集

- 設計書: `docs/superpowers/specs/2026-07-20-bni-powerteam-worksheet-design.md`
- 実装計画: `docs/superpowers/plans/2026-07-20-bni-powerteam-worksheet-plan.md`
- スプレッドシート: https://docs.google.com/spreadsheets/d/1JXRUNTMrAlueXKknv0b8-ofMJTnPBeUdg9CjX4Mp1Bc/
- GASエディタ: https://script.google.com/home/projects/1vMZ-EGCC9X2t27Osfd4UYWPpde62z-j7dEI9nGfBrv6sqD33bRCBx1ez/edit
- Google Sites: https://sites.google.com/search-mania.net/top-training/home
