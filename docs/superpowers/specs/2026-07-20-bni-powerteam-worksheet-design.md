# BNI TOPチャプター パワーチーム ワークシート共有機能 設計書

- **プロジェクト**: BNI TOP Chapter 総合サイト機能拡張
- **対象システム**: TOPチャプター総合サイト（既存 GAS Web App + Google Sites 埋め込み）
- **スプレッドシート**: `1JXRUNTMrAlueXKknv0b8-ofMJTnPBeUdg9CjX4Mp1Bc`
- **既存Sites URL**: https://sites.google.com/search-mania.net/top-training/home
- **作成日**: 2026-07-20
- **管理者**: h.kuniyoshi@search-mania.net

---

## 1. 目的と背景

BNI TOPチャプターで実施しているパワーチームワークショップにおいて、各メンバーが記入する2種類のワークシート（ターゲット・マーケットワークシート / パワーチームに必要な専門分野）を、**スマホで撮影→AIで自動書き起こし→チャプター全員で共有**できる仕組みを既存Sitesに追加する。

**目的**：ワークショップ後の紙資料を死蔵させず、チャプター全員がお互いのミッションと専門分野を確認できる状態にし、ビジネス連携（1to1、リファーラル）につなげる。

---

## 2. 前提と確認済み要件

| # | 項目 | 決定内容 |
|---|---|---|
| 1 | 統合先 | 既存GASプロジェクト「TOPチャプター総合サイト」に追加のみ。新規プロジェクトは作らない |
| 2 | データ単位 | 1メンバー＝1提出。ワークシート2枚（p.3, p.4）を1セットとして扱う |
| 3 | ワークシート種類 | **2種類固定**（p.3ターゲット・マーケット / p.4パワーチーム専門分野） |
| 4 | OCR方式 | **A+B ハイブリッド**：構造化JSON抽出＋全文書き起こしの両方をGeminiで1回取得 |
| 5 | 提出者認証 | **名前入力のみ**（Google認証なし）、同姓同名なし前提 |
| 6 | 再編集方式 | 名前検索 → **本人確認ダイアログ**（「〇〇さんの入力を編集しますか？」）→ 編集 |
| 7 | 閲覧範囲 | **全員公開**（既存Sites・GAS Webアプリと同じ扱い） |
| 8 | 表示グルーピング | **パワーチーム名でグループ化**して表示 |
| 9 | 通知 | **なし**（提出時のメール通知は実装しない） |
| 10 | Gemini モデル | `gemini-3.5-flash`（2026年5月GA、シャットダウン予定なし） |
| 11 | 画像保存先 | 既存スプレッドシートと同じDrive直下「BNI-powerteam-images」フォルダ |
| 12 | 画像圧縮 | **クライアント側で必須**（Live Photo・高解像度対策）、長辺2000px・JPEG品質0.85 |
| 13 | HEIC対応 | `heic2any` ライブラリでJPEG変換 |

---

## 3. アーキテクチャ全体像

```
[既存] TOPチャプター総合サイト（Google Sites）
   ├─ [既存] home / カレンダー / メンバー一覧
   └─ [追加] 「パワーチーム」ページ

[既存] GAS プロジェクト「TOPチャプター総合サイト」
   ├─ [既存] doGet(action=events|members|all)
   ├─ [追加] doGet(action=powerteam|powerteam-one|powerteam-all)
   ├─ [追加] doGet(page=view|submit|edit|admin)  ← HTMLServiceで返却
   ├─ [追加] doPost(action=submit|update|delete)
   └─ [追加] callGeminiOCR_(image1, image2)

[既存] スプレッドシート 1JXRUNTMrAlueXKknv0b8-ofMJTnPBeUdg9CjX4Mp1Bc
   ├─ [既存] 特別イベント / トレーニング / ランチ会 / 1toMany /
   │        コーヒーMTG勉強会 / TOPメンバーリスト
   └─ [追加] シート「パワーチーム提出」

[追加] Google Drive「BNI-powerteam-images」フォルダ
   └─ 各提出の画像2枚を保存（リンクを知っている全員が閲覧可）

[追加] Gemini API（gemini-3.5-flash）
   └─ 画像2枚 → 構造化JSON + 全文書き起こし を1回で返却
```

**設計原則**：
- 既存GAS/スプレッドシート/デプロイ設定を**一切壊さない追加のみ**
- 新規シートは1枚だけ（1提出＝1行）
- HTML/CSS/JSはGAS内 HTMLService で返却、Google Sites に iframe 埋め込み
- APIキーは `PropertiesService.getScriptProperties()` に保存、**コードや設計書に平文で書かない**
- `MODEL_NAME` を定数化し、将来のモデル差し替え時は1箇所修正で済むように

---

## 4. データ設計

### 4-1. 追加シート `パワーチーム提出`

**1行 = 1メンバーの提出**。`submitter_name` を実質の主キーとして扱う（同姓同名なし前提）。

| 列 | フィールド名 | 型 | 内容 | 由来 |
|---|---|---|---|---|
| A | `submission_id` | 文字列(UUID) | ユニークID | システム自動 |
| B | `submitted_at` | 日時 | 初回提出日時 | システム自動 |
| C | `updated_at` | 日時 | 最終更新日時 | システム自動 |
| D | `submitter_name` | 文字列 | 提出者名（実質主キー） | フォーム入力 |
| E | `powerteam_name` | 文字列 | パワーチーム名（**Web表示のグルーピングキー**） | p.4 AI抽出 |
| F | `mission` | 文字列（複数行） | ミッション | p.4 AI抽出 |
| G | `self_specialty` | 文字列 | あなたの専門 | p.4「あなた」円 |
| H | `target` | 文字列 | ターゲット | p.4「ターゲット」円 |
| I | `specialty_1` | 文字列 | 専門分野1 | p.4 |
| J | `specialty_2` | 文字列 | 専門分野2 | p.4 |
| K | `specialty_3` | 文字列 | 専門分野3 | p.4 |
| L | `specialty_4` | 文字列 | 専門分野4 | p.4 |
| M | `specialty_5` | 文字列 | 専門分野5 | p.4 |
| N | `specialty_6` | 文字列 | 専門分野6 | p.4 |
| O | `specialty_7` | 文字列 | 専門分野7 | p.4 |
| P | `additional_specialties` | 文字列（カンマ区切り） | 追加専門分野（円の外） | p.4 |
| Q | `emotional_why` | 文字列（複数行） | なぜこの仕事をしているのか | p.3 AI抽出 |
| R | `emotional_joys` | 文字列（複数行） | 得られる喜び | p.3 AI抽出 |
| S | `target_needs` | 文字列（複数行） | ターゲットの困りごと・ニーズ | p.3 AI抽出 |
| T | `target_definition` | 文字列（複数行） | 私のターゲットは | p.3 AI抽出 |
| U | `p3_image_url` | 文字列 | p.3画像の公開URL | Drive |
| V | `p4_image_url` | 文字列 | p.4画像の公開URL | Drive |
| W | `p3_raw_text` | 文字列 | p.3全文書き起こし（保険用） | Gemini raw |
| X | `p4_raw_text` | 文字列 | p.4全文書き起こし（保険用） | Gemini raw |
| Y | `status` | 文字列 | `draft` / `confirmed` / `deleted` | システム |
| Z | `notes` | 文字列 | 備考・管理メモ（任意） | 手入力 |

### 4-2. 運用ルール

- **同姓同名の扱い**：発生しない前提。もし将来発生した場合は `submitter_name` に会社名等を追記して区別（例：「山田太郎（〇〇社）」）
- **再提出**：同じ `submitter_name` で提出された場合、既存行を**上書き**（新規行は作らない）。上書き前に「〇〇さんの提出は既にあります。上書きしますか？」ダイアログを表示
- **削除**：`status = deleted` の**論理削除**のみ。物理削除はしない
- **W/X列の全文書き起こし**：主に保険＆管理者確認用。Web表示は E〜T の構造化フィールドを使用
- **表記ゆれ対応**（例：「販促チーム」「販促専門チーム」）：管理者が E列を手動で統一

### 4-3. シート見た目

- ヘッダー行の色：`#8B5CF6`（パープル系、既存 `1toMany` シートと同系）
- 1行目固定・A列固定
- Y列（status）：プルダウン `draft` / `confirmed` / `deleted`
- E列（powerteam_name）：自由入力（プルダウン化しない）

### 4-4. セットアップ

- 既存 `setupSpreadsheet()` に `setupPowerTeamSheet()` を追加、初回1回実行で自動作成
- 既存メニュー「BNI TOPツール」に「パワーチームシートをセットアップ（初回のみ）」を追加

---

## 5. API設計

### 5-1. HTML返却エンドポイント（Sites iframe埋め込み用）

`HtmlService` で返却、`.setXFrameOptionsMode(ALLOWALL)` で Sites 埋め込み許可。

| URL | 用途 |
|---|---|
| `?page=view` | 一覧表示ページ（パワーチーム別グルーピング、閲覧のみ） |
| `?page=submit` | 提出フォーム（名前入力＋画像2枚アップロード） |
| `?page=edit` | 編集ページ（名前で検索→本人確認→修正） |
| `?page=admin` | 管理画面（**任意**：全件編集、status変更、論理削除） |

### 5-2. JSON API（doGet）

| URL | 返却 |
|---|---|
| `?action=all` / `events` / `members` | 既存（変更なし） |
| `?action=powerteam` | 全 `status=confirmed` の提出を配列で返却 |
| `?action=powerteam-one&name=<encoded_name>` | 該当1件を返却。存在しなければ `{found: false}` |
| `?action=powerteam-all` | draft含む全件（管理画面用、任意） |

### 5-3. 更新系API（doPost）

`e.postData.contents` にJSONを載せる。`action` はクエリパラメータで指定。

| URL | ペイロード | 処理内容 |
|---|---|---|
| `?action=submit` | `{submitter_name, image1_base64, image1_mime, image2_base64, image2_mime}` | ①画像2枚をDrive保存 → ②Gemini API呼び出し → ③シート新規行（`status=draft`）→ ④`{submission_id, ...parsedFields, image_urls}` 返却。**同名既存があれば先に `{needsConfirm: true}` を返し、クライアントで上書き確認** |
| `?action=update` | `{submission_id, submitter_name, ...allFields, status?}` | シート該当行を全フィールド更新、`updated_at` を現在時刻に、`status` は指定なければ `confirmed` に昇格 |
| `?action=delete` | `{submission_id}` | 論理削除（`status=deleted`）、管理画面から呼ぶ |

### 5-4. 実装上の注意

- **画像サイズ**：クライアント側で長辺2000px・JPEG品質0.85に圧縮してからbase64送信。2枚合計 payload 約1.5〜2MB（GAS POST上限50MB、Gemini inline上限20MB内）
- **タイムアウト**：GAS実行制限6分。Gemini通常5〜30秒。UI側は「AI書き起こし中…」プログレス表示
- **CORS**：`ContentService.MimeType.JSON` で返却。Sites の iframe 内 fetch は同一ドメイン扱いのため追加設定不要
- **重複防止**：`submit` 実行前にクライアントから `?action=powerteam-one&name=<name>` で存在確認 → 存在すれば「上書きしますか？」ダイアログ

### 5-5. 内部ヘルパー関数

```
doGet(e)                              // ルーティング
doPost(e)                             // ルーティング
setupPowerTeamSheet()                 // シート初期化
getPowerTeamAll_(includeDraft)        // 全件取得
getPowerTeamOne_(name)                // 名前で1件取得
savePowerTeamRow_(fields)             // 新規行追加
updatePowerTeamRow_(id, fields)       // 既存行更新
deletePowerTeamRow_(id)               // 論理削除
saveImagesToDrive_(images, name)      // 画像2枚Drive保存＆公開URL返却
callGeminiOCR_(imageBase64Array)      // Gemini API呼び出し
renderHtml_(pageName)                 // HTML返却ヘルパー
include_(filename)                    // HTMLテンプレート include
```

---

## 6. 画面設計

**モバイルファースト**（幅375px基準）、既存Sites に馴染む配色（`#1E3040` / `#0EA5E9` / `#8B5CF6`）。

### 6-1. 表示ページ `?page=view`

- 上部にナビボタン：「📄 提出する」「✏️ 編集する」「🎯 一覧を見る」
- 検索窓（名前・ミッション・専門分野を横断、クライアント側フィルタ）
- パワーチーム名でセクション分け、セクション順は「メンバー数の多い順」→「五十音順」
- メンバーカード：提出者名 / 自分の専門 / ターゲット / [詳細]ボタン
- [詳細]モーダル：全フィールド表示 ＋ p.3/p.4の原本画像（タップ拡大）

### 6-2. 提出フォーム `?page=submit`

ステップ制で誘導：

1. **Step 1**：お名前入力
2. **Step 2**：画像2枚アップロード（p.3 / p.4）、カメラ・ライブラリ両対応
3. **Step 2.5**：送信中プログレス（圧縮中→AI書き起こし中→保存中）
4. **Step 3**：AI書き起こし結果の確認・修正（全フィールド編集可能、原本画像プレビュー付き）
5. **Step 4**：完了画面（「編集ページから名前検索で修正できます」の案内）

- カメラ入力：`<input type="file" accept="image/*" capture="environment">`
- 同名既存時：Step 2 送信時に「〇〇さんの提出は既にあります。上書きしますか？」
- 保存時：`?action=update` を呼び `status=confirmed` に昇格

### 6-3. 編集ページ `?page=edit`

1. **Step 1**：名前検索
2. **Step 2**：本人確認ダイアログ「〇〇さんの入力を編集します。よろしいですか？」（提出日時等表示）
3. **Step 3**：編集画面（提出フォームStep 3と同じUI、画像も差し替え可能）
4. **Step 4**：完了 → 一覧へ

### 6-4. 管理画面 `?page=admin`（任意・後回しOK）

- 全件テーブル表示（draft含む、status列付き）
- 各行から編集・論理削除・statusを `confirmed` に昇格
- 「AI再書き起こし」ボタン（失敗行の再処理）

### 6-5. 実装形態

- HTMLは**ページ毎に別ファイル**（`view.html` / `submit.html` / `edit.html` / `admin.html`）
- 共通CSS/JSは `include.html` にまとめ `<?!= include_('include'); ?>` で埋め込み
- 外部CDN依存：`heic2any` のみ
- レスポンシブ：`grid-template-columns` でモバイル1カラム/PC複数カラム自動切替

---

## 7. Gemini OCRフロー

### 7-1. API呼び出し概要

- **モデル**：`gemini-3.5-flash`（定数 `MODEL_NAME` で管理）
- **エンドポイント**：`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`
- **1回で両画像を渡す**：AIが p.3/p.4 を自動判定できる、順序が逆でも問題なし
- **構造化出力**：`response_mime_type: "application/json"` + `response_schema` でJSON Schema指定

### 7-2. リクエスト構造

```javascript
{
  contents: [{
    parts: [
      { text: PROMPT_TEXT },
      { inline_data: { mime_type: "image/jpeg", data: base64_image1 }},
      { inline_data: { mime_type: "image/jpeg", data: base64_image2 }}
    ]
  }],
  generationConfig: {
    response_mime_type: "application/json",
    response_schema: RESPONSE_SCHEMA,
    temperature: 0.1
  }
}
```

APIキーはヘッダで送信：`X-goog-api-key: <PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')>`

### 7-3. プロンプト（`PROMPT_TEXT` 定数）

```
あなたは日本語の手書きワークシートを読み取るOCRアシスタントです。
2枚の画像はBNIパワーチームワークショップのワークシートです。
それぞれが以下のどちらかです（画像の順序は不定、内容から自動判定してください）：

■ p.3「ターゲット・マーケットワークシート」の識別特徴
- タイトルに「ターゲット・マーケットワークシート」
- 【感情的なつながり】【具体的なターゲット】のセクション
- 横罫線上に手書きテキスト

【抽出項目】
- emotional_why: 「私は、なぜこの仕事をしているのか？」の回答全文
- emotional_joys: 「その人からどんな喜びを得られるのか？」の回答全文
- target_needs: 「その人は、どんな困りごと・悩み（ニーズ）があるのか？」の回答全文
- target_definition: 「私のターゲットは？」の回答全文

■ p.4「パワーチームに必要な専門分野」の識別特徴
- タイトルに「パワーチームに必要な専門分野」
- 上部に「ミッション」欄、その下に「パワーチーム名」欄
- 中央部に円形配置された「専門分野1〜7」「あなた」「ターゲット」

【抽出項目】
- mission: ミッション欄の全文（複数行OK）
- powerteam_name: パワーチーム名欄。取り消し線がある場合は最終案（残された方）を採用
- self_specialty: 「あなた」の赤い円内のテキスト
- target: 「ターゲット」の赤い円内のテキスト
- specialty_1〜7: 「専門分野1」〜「専門分野7」の各円内のテキスト
- additional_specialties: 円の外側に書かれた項目の配列
  （例: ["マーケター","デザイナー","ポスティング"]）

■ 共通ルール
1. 手書き原文のまま忠実に書き起こす。要約・解釈・整形は禁止
2. 読めない文字は「?」で置き換え、warnings 配列に「〇〇の一部が読めません」を追加
3. 取り消し線・二重線の文字は除外、代替として書かれた文字を採用
4. 各ページの raw_text にはそのページ全体の書き起こし全文を
   レイアウト無視で上→下・左→右の順で1つの文字列に
5. 該当ページが見つからなければ detected: false、warnings に理由を記述
6. 両方とも同じページと判定した場合、より鮮明な方を優先し
   warnings に「同じページの可能性」を記述
```

### 7-4. レスポンススキーマ（`RESPONSE_SCHEMA`）

```json
{
  "type": "object",
  "properties": {
    "p3_page": {
      "type": "object",
      "properties": {
        "detected": { "type": "boolean" },
        "emotional_why": { "type": "string" },
        "emotional_joys": { "type": "string" },
        "target_needs": { "type": "string" },
        "target_definition": { "type": "string" },
        "raw_text": { "type": "string" }
      },
      "required": ["detected", "raw_text"]
    },
    "p4_page": {
      "type": "object",
      "properties": {
        "detected": { "type": "boolean" },
        "mission": { "type": "string" },
        "powerteam_name": { "type": "string" },
        "self_specialty": { "type": "string" },
        "target": { "type": "string" },
        "specialty_1": { "type": "string" },
        "specialty_2": { "type": "string" },
        "specialty_3": { "type": "string" },
        "specialty_4": { "type": "string" },
        "specialty_5": { "type": "string" },
        "specialty_6": { "type": "string" },
        "specialty_7": { "type": "string" },
        "additional_specialties": {
          "type": "array",
          "items": { "type": "string" }
        },
        "raw_text": { "type": "string" }
      },
      "required": ["detected", "raw_text"]
    },
    "warnings": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["p3_page", "p4_page", "warnings"]
}
```

### 7-5. エラーハンドリング

| ケース | 挙動 |
|---|---|
| APIタイムアウト（>60秒） | 「AI書き起こしに失敗しました。画像だけ保存し、後で編集画面から手入力できます」表示。画像URLと空フィールドで `status=draft` 行作成 |
| JSONパース失敗 | 1回だけ自動リトライ、それでも失敗なら上記と同じ扱い |
| 両画像とも `detected: false` | 「画像がワークシートとして認識されませんでした」。行は作らない、Drive画像も削除 |
| 片方だけ検出 | 検出側のフィールドは埋め、未検出側は空 + warnings 表示。ユーザーがStep 3で手入力可能 |
| warnings 発生 | Step 3上部に黄色バナー警告（保存はブロックしない、ユーザー判断） |

### 7-6. 画像圧縮フロー（クライアントJS）

```javascript
async function compressImage(file) {
  // 1. HEIC対策
  if (file.type === 'image/heic' || /\.heic$/i.test(file.name)) {
    file = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  }
  // 2. <img> 読み込み、サイズ判定
  const img = await loadImage(URL.createObjectURL(file));
  const maxSide = 2000;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  // 3. Canvas縮小 + EXIF回転補正
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  applyExifRotation(ctx, img, w, h, exifData);
  ctx.drawImage(img, 0, 0, w, h);
  // 4. JPEG再エンコード
  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  );
  // 5. base64化
  return await blobToBase64(blob);
}
```

### 7-7. コスト試算

- **1画像あたり入力トークン**：約1200
- **2画像＋プロンプト**：約3000トークン入力
- **出力**：構造化JSON約1000トークン
- **Gemini 3.5 Flash 単価（2026年7月時点、要再確認）**：入力$0.10/1M, 出力$0.40/1M
- **1回あたり**：約$0.0007 ≒ **0.1円**
- **チャプター30名想定**：合計 **約3円/イベント**
- **無料枠内（1日1500回、100万トークン/日）に余裕で収まる**

---

## 8. テスト計画

### 8-1. GAS内部テスト関数

カスタムメニュー「BNI TOPツール」に追加、1クリックで実行。

| 関数 | 内容 | 期待結果 |
|---|---|---|
| `test_setupPowerTeamSheet()` | シート作成→カラム/プルダウン/色確認 | 正しく作成 |
| `test_saveImagesToDrive()` | サンプル画像2枚をDrive保存、公開URL取得 | `lh3.googleusercontent.com/d/...` 形式URL取得 |
| `test_callGeminiOCR()` | サンプル手書き画像2枚でGemini呼び出し | JSON構造準拠、主要フィールド埋め |
| `test_savePowerTeamRow()` | ダミーデータで新規行追加 | 1行追加、ID・日時自動セット |
| `test_updatePowerTeamRow()` | 既存行を編集 | フィールド更新、`updated_at` 更新 |
| `test_getPowerTeamAll()` | 全件取得 | `status=deleted` 除外、JSON配列 |
| `test_endToEnd()` | 実画像で通しテスト | エラーなし、データ整合性 |

### 8-2. 手動E2Eテストシナリオ（デプロイ後）

| # | シナリオ | 期待結果 |
|---|---|---|
| 1 | 新規提出（サンプル画像） | AI書き起こし後 Step 3 に主要フィールド反映 |
| 2 | Step 3で修正して保存 | シートに `status=confirmed` で保存、一覧表示 |
| 3 | Sitesページから一覧確認 | パワーチーム名でグループ化、[詳細] で内容＋原本画像表示 |
| 4 | 再編集（本人確認込み） | 該当行更新、`updated_at` 更新 |
| 5 | 同名重複時 | 上書き確認ダイアログ→上書き実行 |
| 6 | 画像順序逆（p.4→p.3） | AI自動判定で正しくフィールド分け |
| 7 | 大サイズ画像（4032×3024） | 圧縮後800KB前後、送信成功 |
| 8 | HEIC画像 | JPEG変換→送信成功 |
| 9 | ワークシート以外の画像 | 「認識されませんでした」表示、行未作成 |
| 10 | ネット断状態で送信 | 「送信失敗」表示、シート未更新 |

---

## 9. デプロイ手順

```
① 事前準備
   □ 既存スプレッドシートのバックアップ（ファイル > コピーを作成）
   □ 既存GASコードのバックアップ（コード.gs 全文をローカル保存）
   □ Gemini APIキーを Google AI Studio から発行済（h.kuniyoshi@search-mania.net）
   □ GASエディタ「プロジェクトの設定」→「スクリプトプロパティ」
      → GEMINI_API_KEY を追加、値を貼り付け

② コード追加
   □ 既存コード.gsに powerteam系関数を追記
   □ 新規HTMLファイル追加：view.html / submit.html / edit.html / admin.html / include.html
   □ 保存（Ctrl+S）

③ セットアップ実行
   □ setupPowerTeamSheet を GAS エディタから実行
      → シート「パワーチーム提出」自動作成
   □ Driveに「BNI-powerteam-images」フォルダ自動作成（初回submit時、または手動）

④ テスト
   □ test_saveImagesToDrive 実行
   □ test_callGeminiOCR 実行（サンプル画像で結果確認）
   □ test_endToEnd 実行

⑤ デプロイ
   □ 「デプロイ」→「デプロイを管理」→ 既存デプロイの「編集」
      → バージョンを「新バージョン」に更新 → デプロイ
   ⚠️ 「新規デプロイ」ではなくかならず「既存デプロイの編集」を選ぶ
      （URL が変わって既存カレンダーが動かなくなるため）

⑥ Sites 埋め込み
   □ https://sites.google.com/search-mania.net/top-training/ を開く
   □ 右サイドバー「ページ」→「＋」→新規ページ「パワーチーム」作成、上部ナビに配置
   □ 「挿入」→「埋め込み」→「URL」→ GAS Webアプリ URL + ?page=view
   □ サイズ：幅100% × 高さ2000px
   □ ページを公開

⑦ 実運用テスト
   □ スマホで自分の p.3/p.4 を提出→修正→保存
   □ Sites「パワーチーム」ページで表示確認
   □ 別ブラウザから編集ページで自分の入力を検索→修正→保存

⑧ チャプター展開
   □ Sites URLをチャプターに共有
   □ 使い方案内（画像2枚を撮って名前を入れて送信、あとはAIがやります）
```

---

## 10. 想定リスクと対策

| リスク | 対策 |
|---|---|
| Gemini APIキー漏洩 | スクリプトプロパティ保存＋コード・設計書・コミットに平文で残さない。有事はGoogle AI Studio で即キー再発行 |
| デプロイURL変更で既存機能破損 | 「新規デプロイ」ではなく「既存デプロイの編集→新バージョン」を厳守。手順書に明記 |
| パワーチーム名の表記ゆれ | 管理者がシートE列を直接編集で統一 |
| 大量トラフィックでGAS制限抵触 | 想定：30名×1回=30リクエスト/イベント。GASの1日6時間制限に桁違いに余裕 |
| 提出画像に個人情報が写る | 全員公開が前提。ユーザー側で撮影時に注意する運用ルールで対応 |
| Gemini モデル差し替え | `MODEL_NAME` 定数化で1箇所修正で対応可能 |
| 同姓同名メンバーが将来加入 | `submitter_name` に会社名等を追記する運用（例：「山田太郎（〇〇社）」） |

---

## 11. 将来拡張の余地（今回スコープ外）

- **管理画面のパスコード保護**：現状は全員公開。将来センシティブになれば追加検討
- **ワークシート種別マスタ化**：ページ構成が変わる時は「種別」テーブルを持たせて拡張
- **他ワークシート追加**：p.1/p.2 等が必要になった場合、シート列とプロンプトを拡張
- **提出者通知メール**：今回は不要と判断、必要になれば `MailApp.sendEmail()` で追加
- **既存 TOPメンバーリスト との自動紐付け**：`submitter_name` 一致で既存メンバー情報とマージ表示

---

## 12. 完了の定義（Definition of Done）

- [ ] 新規シート「パワーチーム提出」が正しく作成される
- [ ] Drive「BNI-powerteam-images」フォルダに画像が保存され、公開URL取得できる
- [ ] Gemini APIで p.3 と p.4 が自動判定され、構造化JSONが返る
- [ ] 提出→AI書き起こし→修正→保存 の一連フローがスマホで完結
- [ ] 名前検索での再編集ができ、本人確認ダイアログが表示される
- [ ] Sites「パワーチーム」ページで、チーム別グルーピング表示され、原本画像も確認できる
- [ ] 既存の doGet(action=events|members|all) が変わらず動作する
- [ ] E2Eテストシナリオ #1〜#10 が全て通る
