# BNIパワーチーム ワークシート共有機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BNI TOPチャプターのパワーチームワークショップで書いた2枚のワークシート（p.3・p.4）をスマホで撮影し、Gemini APIで自動書き起こし→本人が修正確定→チャプター全員でSites上で共有できる機能を、既存の TOPチャプター総合サイト GASプロジェクトに追加する。

**Architecture:** 既存GASプロジェクトに新規シート1枚と新規APIエンドポイント／HTMLページ4つを追加のみ。データは同一スプレッドシート、画像は新規Driveフォルダ、OCRは `gemini-3.5-flash`。Google Sitesには新規ページ1枚を作り GAS Webapp `?page=view` を iframe埋め込み。

**Tech Stack:** Google Apps Script (V8 runtime), HtmlService, DriveApp, UrlFetchApp, PropertiesService, Gemini API (gemini-3.5-flash), 素のHTML/CSS/JS（フレームワークなし）, heic2any(CDN)

**参考仕様書:** `docs/superpowers/specs/2026-07-20-bni-powerteam-worksheet-design.md`

---

## 事前準備（1回のみ）

### 前提

- 対象GASプロジェクト：既存「TOPチャプター総合サイト」
- スプレッドシートID: `1JXRUNTMrAlueXKknv0b8-ofMJTnPBeUdg9CjX4Mp1Bc`
- Gemini APIキー：ユーザーから受領済み（GASスクリプトプロパティに保存する運用）
- ローカル作業ディレクトリ：`C:\Users\endle\.claude\202608BOD\gas\top-chapter\`
- clasp（Google Apps Script CLI）を使用してローカル⇄GAS を同期

### File Structure

```
202608BOD/
  gas/
    top-chapter/                    ← clasp管理下
      appsscript.json               (既存、変更あり: oauthScopes追加)
      .clasp.json                   (gitignore、Script ID保持)
      code.gs                       (既存、末尾に powerteam系を追加)
      powerteam.gs                  (新規、パワーチーム機能を分離)
      view.html                     (新規、一覧表示)
      submit.html                   (新規、提出フォーム)
      edit.html                     (新規、編集ページ)
      admin.html                    (新規、管理画面)
      include.html                  (新規、共通CSS/JS)
      test_powerteam.gs             (新規、テスト関数)
    .gitignore                      (新規または更新、.clasp.json除外)
```

**分離方針:**
- 既存 `code.gs` は変更を最小限に（ルーティング拡張のみ）
- パワーチーム関連の全ロジックは新規ファイル `powerteam.gs` に集約（既存機能と混ざらない）
- HTMLは各ページ独立ファイル、共通CSS/JSは `include.html` に集約
- テスト関数は `test_powerteam.gs` に分離（本番デプロイ時も残すが実行しない）

---

## Task 1: clasp セットアップ＋既存プロジェクトのクローン

**目的:** ローカルで GAS プロジェクトを編集し `clasp push` で同期できる状態を作る。既存コードを破壊しないよう先にクローンで完全コピーを取得。

**Files:**
- 作成: `202608BOD/gas/top-chapter/.clasp.json`（自動生成、gitignore対象）
- 作成: `202608BOD/gas/top-chapter/appsscript.json`（クローンで取得）
- 作成: `202608BOD/gas/top-chapter/code.gs`（クローンで取得＝既存コード）
- 作成: `202608BOD/.gitignore`（`.clasp.json` を除外）

- [ ] **Step 1: clasp のインストール確認**

コマンド:
```powershell
clasp --version
```

期待出力: `2.x.x` 以上。未インストールなら `npm install -g @google/clasp`。

- [ ] **Step 2: clasp ログイン**

コマンド:
```powershell
clasp login
```

ブラウザが開いて h.kuniyoshi@search-mania.net で認証。成功すると `~/.clasprc.json` に認証情報が保存される。

- [ ] **Step 3: 既存プロジェクトの Script ID を確認**

GAS エディタ左サイドバー「プロジェクトの設定」→「スクリプトID」をコピー。以降 `<SCRIPT_ID>` と表記。

- [ ] **Step 4: ローカルディレクトリ作成 & クローン**

コマンド:
```powershell
mkdir C:\Users\endle\.claude\202608BOD\gas\top-chapter
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp clone <SCRIPT_ID>
```

期待: `code.gs` と `appsscript.json` がローカルにダウンロードされる。

- [ ] **Step 5: .gitignore 作成**

作成: `C:\Users\endle\.claude\202608BOD\.gitignore`

```
# clasp
gas/**/.clasp.json
gas/**/.clasprc.json

# OS
Thumbs.db
.DS_Store

# Editor
.vscode/
.idea/
```

- [ ] **Step 6: クローン内容の確認**

コマンド:
```powershell
ls C:\Users\endle\.claude\202608BOD\gas\top-chapter\
```

期待: `code.gs`, `appsscript.json`, `.clasp.json` の3ファイル。`code.gs` を開いて既存の `doGet`, `setupSpreadsheet`, etc. が含まれることを確認。

- [ ] **Step 7: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add .gitignore gas/top-chapter/code.gs gas/top-chapter/appsscript.json
git commit -m "chore: clasp clone existing top-chapter GAS project as baseline"
```

---

## Task 2: appsscript.json のスコープ追加

**目的:** Gemini API を UrlFetchApp で呼び出すため、`https://www.googleapis.com/auth/script.external_request` スコープを明示的に有効化。またスクリプトプロパティ利用のため `https://www.googleapis.com/auth/script.storage` も念のため確認。

**Files:**
- 修正: `202608BOD/gas/top-chapter/appsscript.json`

- [ ] **Step 1: 現在の appsscript.json 内容確認**

ファイルを開いて内容を確認。既存が概ね以下のような形になっているはず：

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

- [ ] **Step 2: oauthScopes 追加**

以下に書き換え（既存 `webapp` セクションがあればそのまま残す）：

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.container.ui",
    "https://www.googleapis.com/auth/script.scriptapp"
  ],
  "webapp": {
    "access": "ANYONE",
    "executeAs": "USER_DEPLOYING"
  }
}
```

⚠️ 既存の `webapp` セクションが `"access": "ANYONE_ANONYMOUS"` や別の値の場合はそちらを維持。触るのは `oauthScopes` のみ。

- [ ] **Step 3: push して同期**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

期待: `Pushed 2 files.` GASエディタで appsscript.json が更新される。

- [ ] **Step 4: 動作影響なしを確認**

既存の Web アプリ URL（Sites のカレンダーが動いているURL）にブラウザで `?action=all` を付けてアクセス、既存の events + members JSON が返ることを確認。

- [ ] **Step 5: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/appsscript.json
git commit -m "chore: add oauth scopes for Gemini API and Drive access"
```

---

## Task 3: Gemini API キーをスクリプトプロパティに保存

**目的:** APIキーをコードから完全に分離。`PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')` で参照する。

**Files:** なし（GASエディタ UI 操作のみ）

- [ ] **Step 1: GASエディタでスクリプトプロパティを開く**

GASエディタ左サイドバー「プロジェクトの設定」（歯車アイコン）→ 下部「スクリプト プロパティ」→ 「スクリプト プロパティを追加」

- [ ] **Step 2: キーを追加**

- プロパティ: `GEMINI_API_KEY`
- 値: （ユーザー提供済みキー。この計画書やコードには絶対に平文で書かない）

保存。

- [ ] **Step 3: 確認関数を GAS エディタで実行**

一時的に GAS エディタで以下を貼り付けて実行（実行後削除）：

```javascript
function _tempCheckApiKey() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  Logger.log('Key exists: ' + (key ? 'YES (length ' + key.length + ')' : 'NO'));
}
```

Logger出力で `Key exists: YES (length ...)` が出れば成功。関数は削除。

- [ ] **Step 4: コミット不要（コード変更なし）**

---

## Task 4: 定数と設定を powerteam.gs に定義

**目的:** パワーチーム機能で使う定数を一箇所にまとめ、後の関数から参照できるようにする。

**Files:**
- 作成: `202608BOD/gas/top-chapter/powerteam.gs`

- [ ] **Step 1: powerteam.gs を新規作成、定数セクションを記述**

作成: `C:\Users\endle\.claude\202608BOD\gas\top-chapter\powerteam.gs`

```javascript
/**
 * ==========================================================
 * BNI TOP Chapter - Power Team Worksheet Feature
 * ==========================================================
 * パワーチームワークショップのワークシート（p.3/p.4）を
 * スマホで撮影→Gemini APIで自動書き起こし→チャプター全員で共有する機能。
 *
 * 関連: docs/superpowers/specs/2026-07-20-bni-powerteam-worksheet-design.md
 */

// ==========================================
// CONFIG
// ==========================================
var PT_SHEET_NAME = 'パワーチーム提出';
var PT_DRIVE_FOLDER_NAME = 'BNI-powerteam-images';
var PT_MODEL_NAME = 'gemini-3.5-flash';
var PT_GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/' +
  PT_MODEL_NAME + ':generateContent';

var PT_STATUS = { DRAFT: 'draft', CONFIRMED: 'confirmed', DELETED: 'deleted' };

// シートのカラム定義（1-indexed、A列=1）
var PT_COL = {
  submission_id: 1,      // A
  submitted_at: 2,       // B
  updated_at: 3,         // C
  submitter_name: 4,     // D
  powerteam_name: 5,     // E
  mission: 6,            // F
  self_specialty: 7,     // G
  target: 8,             // H
  specialty_1: 9,        // I
  specialty_2: 10,       // J
  specialty_3: 11,       // K
  specialty_4: 12,       // L
  specialty_5: 13,       // M
  specialty_6: 14,       // N
  specialty_7: 15,       // O
  additional_specialties: 16, // P
  emotional_why: 17,     // Q
  emotional_joys: 18,    // R
  target_needs: 19,      // S
  target_definition: 20, // T
  p3_image_url: 21,      // U
  p4_image_url: 22,      // V
  p3_raw_text: 23,       // W
  p4_raw_text: 24,       // X
  status: 25,            // Y
  notes: 26              // Z
};

var PT_HEADERS = [
  'submission_id', 'submitted_at', 'updated_at', 'submitter_name',
  'powerteam_name', 'mission', 'self_specialty', 'target',
  'specialty_1', 'specialty_2', 'specialty_3', 'specialty_4',
  'specialty_5', 'specialty_6', 'specialty_7', 'additional_specialties',
  'emotional_why', 'emotional_joys', 'target_needs', 'target_definition',
  'p3_image_url', 'p4_image_url', 'p3_raw_text', 'p4_raw_text',
  'status', 'notes'
];

var PT_HEADERS_JP = [
  '提出ID', '提出日時', '更新日時', '提出者名',
  'パワーチーム名', 'ミッション', 'あなたの専門', 'ターゲット',
  '専門分野1', '専門分野2', '専門分野3', '専門分野4',
  '専門分野5', '専門分野6', '専門分野7', '追加専門分野',
  'なぜこの仕事', '得られる喜び', 'ターゲットのニーズ', '私のターゲット',
  'p.3画像URL', 'p.4画像URL', 'p.3全文', 'p.4全文',
  'ステータス', '備考'
];

var PT_COL_WIDTHS = [
  200, 130, 130, 120,      // A-D
  160, 300, 150, 150,      // E-H
  120, 120, 120, 120,      // I-L
  120, 120, 120, 200,      // M-P
  260, 260, 260, 260,      // Q-T
  200, 200, 260, 260,      // U-X
  100, 200                 // Y-Z
];
```

- [ ] **Step 2: push で同期**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

- [ ] **Step 3: GASエディタで構文エラーがないことを確認**

エディタで `powerteam.gs` を開き、上部の関数プルダウンに何か（例: なし＝定数のみでもOK）が表示される、エラー赤下線がないことを目視確認。

- [ ] **Step 4: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/powerteam.gs
git commit -m "feat(powerteam): add config constants and column definitions"
```

---

## Task 5: シートセットアップ関数

**目的:** `setupPowerTeamSheet()` を実装。初回1回実行で「パワーチーム提出」シートを作成、ヘッダーとプルダウンを設定。

**Files:**
- 修正: `202608BOD/gas/top-chapter/powerteam.gs`（末尾に追加）
- 作成: `202608BOD/gas/top-chapter/test_powerteam.gs`

- [ ] **Step 1: setupPowerTeamSheet 関数を追加**

`powerteam.gs` の末尾に追加：

```javascript
// ==========================================
// シートセットアップ
// ==========================================
function setupPowerTeamSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var existing = ss.getSheetByName(PT_SHEET_NAME);
  if (existing) {
    SpreadsheetApp.getUi().alert(
      'シート「' + PT_SHEET_NAME + '」は既に存在します。\n' +
      '再セットアップは行いません。'
    );
    return;
  }
  var sheet = ss.insertSheet(PT_SHEET_NAME);
  sheet.setTabColor('#8B5CF6');

  // ヘッダー行（英語名＋日本語ラベルを2行構成）
  var hdrRange = sheet.getRange(1, 1, 1, PT_HEADERS.length);
  hdrRange.setValues([PT_HEADERS_JP]);
  hdrRange.setBackground('#8B5CF6')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11);

  // 列幅
  var i;
  for (i = 0; i < PT_COL_WIDTHS.length; i++) {
    sheet.setColumnWidth(i + 1, PT_COL_WIDTHS[i]);
  }

  // 固定行・列
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // status列プルダウン
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([PT_STATUS.DRAFT, PT_STATUS.CONFIRMED, PT_STATUS.DELETED], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, PT_COL.status, 500, 1).setDataValidation(statusRule);

  // 全体の枠線
  sheet.getRange(1, 1, 501, PT_HEADERS.length)
    .setBorder(true, true, true, true, true, true);

  SpreadsheetApp.getUi().alert(
    'シート「' + PT_SHEET_NAME + '」を作成しました。\n\n' +
    '次のステップ:\n' +
    '- Gemini APIキーがスクリプトプロパティに保存されているか確認\n' +
    '- test_setupPowerTeamSheet を実行して動作確認'
  );
}
```

- [ ] **Step 2: test_powerteam.gs を新規作成、テスト関数を追加**

作成: `C:\Users\endle\.claude\202608BOD\gas\top-chapter\test_powerteam.gs`

```javascript
/**
 * ==========================================================
 * BNI TOP Chapter - Power Team Test Functions
 * ==========================================================
 * GASエディタから直接実行して結果を Logger で確認する。
 * すべての関数は _assert_ 系ヘルパーで失敗時に throw する。
 */

// ==========================================
// アサーションヘルパー
// ==========================================
function _pt_assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      '[FAIL] ' + message +
      '\n  expected: ' + JSON.stringify(expected) +
      '\n  actual:   ' + JSON.stringify(actual)
    );
  }
  Logger.log('[PASS] ' + message);
}

function _pt_assertTruthy(value, message) {
  if (!value) {
    throw new Error('[FAIL] ' + message + ' — got: ' + JSON.stringify(value));
  }
  Logger.log('[PASS] ' + message);
}

function _pt_assertMatch(actual, pattern, message) {
  if (!pattern.test(String(actual))) {
    throw new Error(
      '[FAIL] ' + message +
      '\n  pattern: ' + pattern +
      '\n  actual:  ' + JSON.stringify(actual)
    );
  }
  Logger.log('[PASS] ' + message);
}

// ==========================================
// Task 5: シートセットアップのテスト
// ==========================================
function test_setupPowerTeamSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PT_SHEET_NAME);
  _pt_assertTruthy(sheet, 'シート「' + PT_SHEET_NAME + '」が存在する');

  var lastCol = sheet.getLastColumn();
  _pt_assertEquals(lastCol, 26, 'カラム数が26（A-Z）');

  var hdr = sheet.getRange(1, 1, 1, 26).getValues()[0];
  _pt_assertEquals(hdr[0], '提出ID', 'A列ヘッダーが「提出ID」');
  _pt_assertEquals(hdr[25], '備考', 'Z列ヘッダーが「備考」');

  var frozenRows = sheet.getFrozenRows();
  _pt_assertEquals(frozenRows, 1, '1行目が固定');

  Logger.log('=== test_setupPowerTeamSheet: ALL PASS ===');
}
```

- [ ] **Step 3: push**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

- [ ] **Step 4: GASエディタで setupPowerTeamSheet を実行**

- 関数プルダウンで `setupPowerTeamSheet` を選択 → 実行
- 初回は権限承認ダイアログが出る → 承認
- 「シート『パワーチーム提出』を作成しました」アラートが出る
- スプレッドシートを開いて新規シートの見た目を目視確認（パープル色タブ、26列、ヘッダー、プルダウン）

- [ ] **Step 5: GASエディタで test_setupPowerTeamSheet を実行**

Logger（実行ログ）で `[PASS]` が3つ、最後に `=== test_setupPowerTeamSheet: ALL PASS ===` が出れば成功。

- [ ] **Step 6: 既存メニュー onOpen に項目を追加**

`code.gs` の `onOpen()` を修正。既存のコードの `onOpen` を探し、`.addItem('写真URLを一括変換（J列）', 'convertAllPhotoUrls')` の後ろに追加：

```javascript
    .addSeparator()
    .addItem('パワーチームシートをセットアップ（初回のみ）', 'setupPowerTeamSheet')
    .addToUi();
```

（末尾の `.addToUi()` は元々あったものを移動、追記後の状態）

- [ ] **Step 7: push＆コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/powerteam.gs gas/top-chapter/test_powerteam.gs gas/top-chapter/code.gs
git commit -m "feat(powerteam): add setupPowerTeamSheet with menu integration and test"
```

---

## Task 6: Drive画像保存ヘルパー

**目的:** `saveImagesToDrive_(images, submitterName)` を実装。base64 画像2枚を Drive フォルダに保存し、公開URLを返す。

**Files:**
- 修正: `202608BOD/gas/top-chapter/powerteam.gs`
- 修正: `202608BOD/gas/top-chapter/test_powerteam.gs`

- [ ] **Step 1: フォルダ取得＆保存関数を追加**

`powerteam.gs` の末尾に追加：

```javascript
// ==========================================
// Drive フォルダ取得（なければ作成）
// ==========================================
function getPowerTeamFolder_() {
  var folders = DriveApp.getFoldersByName(PT_DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  var folder = DriveApp.createFolder(PT_DRIVE_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

// ==========================================
// 画像2枚を Drive に保存、公開URL返却
// images: [{base64: 'AAA...', mime: 'image/jpeg'}, {...}]
// ==========================================
function saveImagesToDrive_(images, submitterName) {
  if (!images || images.length !== 2) {
    throw new Error('images 配列は2要素必須');
  }
  var folder = getPowerTeamFolder_();
  var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
  var safeName = String(submitterName || 'unknown').replace(/[^\p{L}\p{N}_-]/gu, '_');

  var urls = [];
  var i;
  for (i = 0; i < images.length; i++) {
    var img = images[i];
    var bytes = Utilities.base64Decode(img.base64);
    var blob = Utilities.newBlob(bytes, img.mime, safeName + '_' + ts + '_' + (i + 1) + '.jpg');
    var file = folder.createFile(blob);
    // 公開URLを thumbnail 形式に変換（既存 convertDriveUrl と同じロジック）
    var fileId = file.getId();
    urls.push('https://lh3.googleusercontent.com/d/' + fileId + '=w1600');
  }
  return urls;
}
```

- [ ] **Step 2: テスト関数を test_powerteam.gs に追加**

```javascript
// ==========================================
// Task 6: 画像保存ヘルパーのテスト
// ==========================================
function test_saveImagesToDrive() {
  // 1x1 の透明PNG（base64）でテスト（実画像ではないが Drive 保存フロー確認用）
  var TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  var images = [
    { base64: TINY_PNG, mime: 'image/png' },
    { base64: TINY_PNG, mime: 'image/png' }
  ];
  var urls = saveImagesToDrive_(images, 'テスト太郎');

  _pt_assertEquals(urls.length, 2, '2つのURLが返る');
  _pt_assertMatch(urls[0], /^https:\/\/lh3\.googleusercontent\.com\/d\//, 'URL1がGoogle thumbnail形式');
  _pt_assertMatch(urls[1], /^https:\/\/lh3\.googleusercontent\.com\/d\//, 'URL2がGoogle thumbnail形式');

  var folder = getPowerTeamFolder_();
  _pt_assertTruthy(folder, 'Driveフォルダが取得できる');
  _pt_assertEquals(folder.getName(), PT_DRIVE_FOLDER_NAME, 'フォルダ名が正しい');

  Logger.log('URLs: ' + JSON.stringify(urls));
  Logger.log('=== test_saveImagesToDrive: ALL PASS ===');
  Logger.log('※ Drive の「' + PT_DRIVE_FOLDER_NAME + '」フォルダを開いてファイル2つが存在することを目視確認');
}
```

- [ ] **Step 3: push**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

- [ ] **Step 4: GASエディタで test_saveImagesToDrive を実行**

Logger出力を確認。3つの `[PASS]` と URL 2つのログ、Drive でフォルダとファイルを目視確認。

- [ ] **Step 5: 実際にブラウザで URL を開いて画像表示確認**

Loggerの URL をブラウザに貼って、画像（1x1透明）が404にならず開けることを確認。

- [ ] **Step 6: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/powerteam.gs gas/top-chapter/test_powerteam.gs
git commit -m "feat(powerteam): add Drive image save helper with public URL"
```

---

## Task 7: Gemini OCR 呼び出し関数

**目的:** `callGeminiOCR_(images)` を実装。画像2枚を Gemini に渡して構造化JSON+全文書き起こしを取得。

**Files:**
- 修正: `202608BOD/gas/top-chapter/powerteam.gs`
- 修正: `202608BOD/gas/top-chapter/test_powerteam.gs`

- [ ] **Step 1: プロンプト・スキーマ定数を powerteam.gs に追加**

`powerteam.gs` の末尾に追加：

```javascript
// ==========================================
// Gemini OCR
// ==========================================
var PT_PROMPT_TEXT =
  'あなたは日本語の手書きワークシートを読み取るOCRアシスタントです。\n' +
  '2枚の画像はBNIパワーチームワークショップのワークシートです。\n' +
  'それぞれが以下のどちらかです（画像の順序は不定、内容から自動判定してください）：\n\n' +
  '■ p.3「ターゲット・マーケットワークシート」の識別特徴\n' +
  '- タイトルに「ターゲット・マーケットワークシート」\n' +
  '- 【感情的なつながり】【具体的なターゲット】のセクション\n' +
  '- 横罫線上に手書きテキスト\n\n' +
  '【抽出項目】\n' +
  '- emotional_why: 「私は、なぜこの仕事をしているのか？」の回答全文\n' +
  '- emotional_joys: 「その人からどんな喜びを得られるのか？」の回答全文\n' +
  '- target_needs: 「その人は、どんな困りごと・悩み（ニーズ）があるのか？」の回答全文\n' +
  '- target_definition: 「私のターゲットは？」の回答全文\n\n' +
  '■ p.4「パワーチームに必要な専門分野」の識別特徴\n' +
  '- タイトルに「パワーチームに必要な専門分野」\n' +
  '- 上部に「ミッション」欄、その下に「パワーチーム名」欄\n' +
  '- 中央部に円形配置された「専門分野1〜7」「あなた」「ターゲット」\n\n' +
  '【抽出項目】\n' +
  '- mission: ミッション欄の全文（複数行OK）\n' +
  '- powerteam_name: パワーチーム名欄。取り消し線がある場合は最終案（残された方）を採用\n' +
  '- self_specialty: 「あなた」の赤い円内のテキスト\n' +
  '- target: 「ターゲット」の赤い円内のテキスト\n' +
  '- specialty_1〜7: 「専門分野1」〜「専門分野7」の各円内のテキスト\n' +
  '- additional_specialties: 円の外側に書かれた項目の配列\n' +
  '  例: ["マーケター","デザイナー","ポスティング"]\n\n' +
  '■ 共通ルール\n' +
  '1. 手書き原文のまま忠実に書き起こす。要約・解釈・整形は禁止\n' +
  '2. 読めない文字は「?」で置き換え、warnings 配列に「〇〇の一部が読めません」を追加\n' +
  '3. 取り消し線・二重線の文字は除外、代替として書かれた文字を採用\n' +
  '4. 各ページの raw_text にはそのページ全体の書き起こし全文を\n' +
  '   レイアウト無視で上→下・左→右の順で1つの文字列に\n' +
  '5. 該当ページが見つからなければ detected: false、warnings に理由を記述\n' +
  '6. 両方とも同じページと判定した場合、より鮮明な方を優先し\n' +
  '   warnings に「同じページの可能性」を記述';

var PT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    p3_page: {
      type: 'object',
      properties: {
        detected: { type: 'boolean' },
        emotional_why: { type: 'string' },
        emotional_joys: { type: 'string' },
        target_needs: { type: 'string' },
        target_definition: { type: 'string' },
        raw_text: { type: 'string' }
      },
      required: ['detected', 'raw_text']
    },
    p4_page: {
      type: 'object',
      properties: {
        detected: { type: 'boolean' },
        mission: { type: 'string' },
        powerteam_name: { type: 'string' },
        self_specialty: { type: 'string' },
        target: { type: 'string' },
        specialty_1: { type: 'string' },
        specialty_2: { type: 'string' },
        specialty_3: { type: 'string' },
        specialty_4: { type: 'string' },
        specialty_5: { type: 'string' },
        specialty_6: { type: 'string' },
        specialty_7: { type: 'string' },
        additional_specialties: {
          type: 'array',
          items: { type: 'string' }
        },
        raw_text: { type: 'string' }
      },
      required: ['detected', 'raw_text']
    },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['p3_page', 'p4_page', 'warnings']
};
```

- [ ] **Step 2: callGeminiOCR_ 関数を追加**

`powerteam.gs` の末尾に追加：

```javascript
// ==========================================
// Gemini API 呼び出し（両画像を1回で処理）
// images: [{base64, mime}, {base64, mime}]
// ==========================================
function callGeminiOCR_(images) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY がスクリプトプロパティに設定されていません');
  }
  if (!images || images.length !== 2) {
    throw new Error('images 配列は2要素必須');
  }

  var payload = {
    contents: [{
      parts: [
        { text: PT_PROMPT_TEXT },
        { inline_data: { mime_type: images[0].mime, data: images[0].base64 }},
        { inline_data: { mime_type: images[1].mime, data: images[1].base64 }}
      ]
    }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: PT_RESPONSE_SCHEMA,
      temperature: 0.1
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-goog-api-key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // 1回だけリトライ
  var lastError = null;
  var attempt;
  for (attempt = 0; attempt < 2; attempt++) {
    try {
      var res = UrlFetchApp.fetch(PT_GEMINI_ENDPOINT, options);
      var code = res.getResponseCode();
      var body = res.getContentText();
      if (code !== 200) {
        lastError = new Error('Gemini HTTP ' + code + ': ' + body.substring(0, 500));
        continue;
      }
      var wrapped = JSON.parse(body);
      // Gemini構造: candidates[0].content.parts[0].text にJSON文字列が入る
      var jsonText = wrapped.candidates &&
                     wrapped.candidates[0] &&
                     wrapped.candidates[0].content &&
                     wrapped.candidates[0].content.parts &&
                     wrapped.candidates[0].content.parts[0] &&
                     wrapped.candidates[0].content.parts[0].text;
      if (!jsonText) {
        lastError = new Error('Gemini response に text がない: ' + body.substring(0, 500));
        continue;
      }
      var parsed = JSON.parse(jsonText);
      return parsed;
    } catch (e) {
      lastError = e;
      Logger.log('Gemini call attempt ' + (attempt + 1) + ' failed: ' + e);
    }
  }
  throw lastError || new Error('Gemini call failed after retry');
}
```

- [ ] **Step 3: テスト関数を追加（実サンプル画像を使う）**

事前準備: Drive の `BNI-powerteam-images/_test/` に、ユーザーから受領した実サンプル画像2枚（p.3, p.4）を配置してファイル名を控える。

test_powerteam.gs に追加：

```javascript
// ==========================================
// Task 7: Gemini OCR呼び出しのテスト
// 事前: Drive「BNI-powerteam-images/_test/」に
//       sample_p3.jpg / sample_p4.jpg を配置
// ==========================================
function test_callGeminiOCR() {
  var folder = getPowerTeamFolder_();
  var testFolders = folder.getFoldersByName('_test');
  _pt_assertTruthy(testFolders.hasNext(), '_testフォルダが存在');
  var testFolder = testFolders.next();

  var p3File = testFolder.getFilesByName('sample_p3.jpg').next();
  var p4File = testFolder.getFilesByName('sample_p4.jpg').next();

  var images = [
    { base64: Utilities.base64Encode(p3File.getBlob().getBytes()), mime: 'image/jpeg' },
    { base64: Utilities.base64Encode(p4File.getBlob().getBytes()), mime: 'image/jpeg' }
  ];

  var result = callGeminiOCR_(images);
  Logger.log('Response: ' + JSON.stringify(result, null, 2));

  _pt_assertTruthy(result.p3_page, 'p3_page が返る');
  _pt_assertTruthy(result.p4_page, 'p4_page が返る');
  _pt_assertEquals(result.p3_page.detected, true, 'p.3 が検出される');
  _pt_assertEquals(result.p4_page.detected, true, 'p.4 が検出される');
  _pt_assertTruthy(result.p4_page.mission, 'p.4 のミッションが空でない');
  _pt_assertTruthy(result.p4_page.powerteam_name, 'p.4 のパワーチーム名が空でない');
  _pt_assertTruthy(Array.isArray(result.warnings), 'warnings 配列で返る');

  Logger.log('=== test_callGeminiOCR: ALL PASS ===');
}
```

- [ ] **Step 4: 実サンプル画像を Drive に配置**

Drive `BNI-powerteam-images/` フォルダを開き → 新規サブフォルダ `_test` を作成 → ユーザーから受領した p.3/p.4 のサンプル画像をアップロード、ファイル名を `sample_p3.jpg` / `sample_p4.jpg` に変更。

- [ ] **Step 5: push**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

- [ ] **Step 6: GASエディタで test_callGeminiOCR を実行**

- Logger にレスポンスJSONが出力される
- 主要フィールド（`mission`, `powerteam_name`, `specialty_1〜7`, `emotional_why` 等）が実サンプルの内容と概ね一致しているか目視確認
- 6つの `[PASS]` と `=== test_callGeminiOCR: ALL PASS ===` が出れば成功

- [ ] **Step 7: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/powerteam.gs gas/top-chapter/test_powerteam.gs
git commit -m "feat(powerteam): add Gemini OCR call with structured JSON output"
```

---

## Task 8: シート CRUD 関数

**目的:** シートに対する get / save / update / delete を実装。

**Files:**
- 修正: `202608BOD/gas/top-chapter/powerteam.gs`
- 修正: `202608BOD/gas/top-chapter/test_powerteam.gs`

- [ ] **Step 1: getPowerTeamAll_ / getPowerTeamOne_ を追加**

`powerteam.gs` の末尾に追加：

```javascript
// ==========================================
// シート CRUD
// ==========================================

// 行データを {key: value} オブジェクトに変換
function _pt_rowToObject(row) {
  var obj = {};
  var i;
  for (i = 0; i < PT_HEADERS.length; i++) {
    obj[PT_HEADERS[i]] = _pt_normalizeCell(row[i]);
  }
  // additional_specialties はカンマ区切り文字列 → 配列に
  if (obj.additional_specialties) {
    obj.additional_specialties = String(obj.additional_specialties)
      .split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
  } else {
    obj.additional_specialties = [];
  }
  return obj;
}

function _pt_normalizeCell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  }
  return String(v);
}

function _pt_getSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PT_SHEET_NAME);
  if (!sheet) {
    throw new Error('シート「' + PT_SHEET_NAME + '」が見つかりません。setupPowerTeamSheet を実行してください。');
  }
  return sheet;
}

function getPowerTeamAll_(includeDraft) {
  var sheet = _pt_getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var rows = sheet.getRange(2, 1, lastRow - 1, PT_HEADERS.length).getValues();
  var results = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row[PT_COL.submission_id - 1]) continue;
    var obj = _pt_rowToObject(row);
    if (obj.status === PT_STATUS.DELETED) continue;
    if (!includeDraft && obj.status === PT_STATUS.DRAFT) continue;
    results.push(obj);
  }
  return results;
}

function getPowerTeamOne_(name) {
  if (!name) return null;
  var sheet = _pt_getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var rows = sheet.getRange(2, 1, lastRow - 1, PT_HEADERS.length).getValues();
  var i;
  for (i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowName = String(row[PT_COL.submitter_name - 1] || '').trim();
    if (rowName === String(name).trim()) {
      var obj = _pt_rowToObject(row);
      if (obj.status === PT_STATUS.DELETED) return null;
      obj._rowIndex = i + 2; // シート行番号
      return obj;
    }
  }
  return null;
}
```

- [ ] **Step 2: savePowerTeamRow_ / updatePowerTeamRow_ / deletePowerTeamRow_ を追加**

```javascript
function savePowerTeamRow_(fields) {
  if (!fields.submitter_name) throw new Error('submitter_name が必須');
  var sheet = _pt_getSheet();
  var now = new Date();

  // 既存行チェック（同名は上書き）
  var existing = getPowerTeamOne_(fields.submitter_name);
  if (existing) {
    return updatePowerTeamRow_(existing.submission_id, fields);
  }

  var row = new Array(PT_HEADERS.length).fill('');
  row[PT_COL.submission_id - 1] = Utilities.getUuid();
  row[PT_COL.submitted_at - 1] = now;
  row[PT_COL.updated_at - 1] = now;
  row[PT_COL.status - 1] = fields.status || PT_STATUS.DRAFT;

  var writable = [
    'submitter_name', 'powerteam_name', 'mission', 'self_specialty', 'target',
    'specialty_1', 'specialty_2', 'specialty_3', 'specialty_4',
    'specialty_5', 'specialty_6', 'specialty_7',
    'additional_specialties',
    'emotional_why', 'emotional_joys', 'target_needs', 'target_definition',
    'p3_image_url', 'p4_image_url', 'p3_raw_text', 'p4_raw_text', 'notes'
  ];
  var i;
  for (i = 0; i < writable.length; i++) {
    var key = writable[i];
    var val = fields[key];
    if (val === undefined || val === null) continue;
    if (key === 'additional_specialties' && Array.isArray(val)) {
      val = val.join(', ');
    }
    row[PT_COL[key] - 1] = val;
  }

  sheet.appendRow(row);
  return {
    submission_id: row[PT_COL.submission_id - 1],
    submitted_at: Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  };
}

function updatePowerTeamRow_(submissionId, fields) {
  var sheet = _pt_getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('データがありません');
  var ids = sheet.getRange(2, PT_COL.submission_id, lastRow - 1, 1).getValues();
  var rowIndex = -1;
  var i;
  for (i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(submissionId)) {
      rowIndex = i + 2;
      break;
    }
  }
  if (rowIndex < 0) throw new Error('submission_id が見つかりません: ' + submissionId);

  var now = new Date();
  sheet.getRange(rowIndex, PT_COL.updated_at).setValue(now);

  var writable = [
    'submitter_name', 'powerteam_name', 'mission', 'self_specialty', 'target',
    'specialty_1', 'specialty_2', 'specialty_3', 'specialty_4',
    'specialty_5', 'specialty_6', 'specialty_7',
    'additional_specialties',
    'emotional_why', 'emotional_joys', 'target_needs', 'target_definition',
    'p3_image_url', 'p4_image_url', 'p3_raw_text', 'p4_raw_text', 'notes', 'status'
  ];
  for (i = 0; i < writable.length; i++) {
    var key = writable[i];
    var val = fields[key];
    if (val === undefined) continue;
    if (key === 'additional_specialties' && Array.isArray(val)) {
      val = val.join(', ');
    }
    if (val === null) val = '';
    sheet.getRange(rowIndex, PT_COL[key]).setValue(val);
  }
  return { submission_id: submissionId, updated_at: Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') };
}

function deletePowerTeamRow_(submissionId) {
  return updatePowerTeamRow_(submissionId, { status: PT_STATUS.DELETED });
}
```

- [ ] **Step 3: テスト関数を追加**

```javascript
// ==========================================
// Task 8: シートCRUDのテスト
// ==========================================
function test_powerTeamCRUD() {
  var uniqueName = 'テスト_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HHmmss');

  // Create
  var created = savePowerTeamRow_({
    submitter_name: uniqueName,
    powerteam_name: '販促専門チーム',
    mission: 'テストミッション',
    self_specialty: 'グーグル活用',
    target: '多角経営者',
    specialty_1: '新聞',
    specialty_2: 'ホームページ',
    additional_specialties: ['マーケター', 'デザイナー']
  });
  _pt_assertTruthy(created.submission_id, '新規保存で submission_id が返る');

  // Read one
  var one = getPowerTeamOne_(uniqueName);
  _pt_assertTruthy(one, '名前で1件取得できる');
  _pt_assertEquals(one.submitter_name, uniqueName, '取得した submitter_name が一致');
  _pt_assertEquals(one.powerteam_name, '販促専門チーム', 'powerteam_name が一致');
  _pt_assertEquals(one.additional_specialties.length, 2, 'additional_specialties が配列で復元される');

  // Update
  var updated = updatePowerTeamRow_(created.submission_id, {
    mission: '更新後ミッション',
    status: PT_STATUS.CONFIRMED
  });
  _pt_assertTruthy(updated.updated_at, '更新で updated_at が返る');
  var afterUpdate = getPowerTeamOne_(uniqueName);
  _pt_assertEquals(afterUpdate.mission, '更新後ミッション', 'ミッションが更新されている');
  _pt_assertEquals(afterUpdate.status, PT_STATUS.CONFIRMED, 'ステータスが confirmed に昇格');

  // Read all (confirmed) - 上で作った行が含まれるはず
  var all = getPowerTeamAll_(false);
  var found = all.some(function(x) { return x.submitter_name === uniqueName; });
  _pt_assertTruthy(found, '全件取得に含まれる');

  // Delete (soft)
  deletePowerTeamRow_(created.submission_id);
  var afterDelete = getPowerTeamOne_(uniqueName);
  _pt_assertEquals(afterDelete, null, '論理削除後は取得できない');

  Logger.log('=== test_powerTeamCRUD: ALL PASS ===');
  Logger.log('※ テスト行が残っています。手動でシートから削除してください。行の submitter_name: ' + uniqueName);
}
```

- [ ] **Step 4: push＆テスト実行**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

GASエディタで `test_powerTeamCRUD` を実行。Logger で `[PASS]` が7つ確認。実行後、シートを開いてテスト行を手動削除（またはstatus=deletedのまま放置OK）。

- [ ] **Step 5: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/powerteam.gs gas/top-chapter/test_powerteam.gs
git commit -m "feat(powerteam): add sheet CRUD (get/save/update/delete)"
```

---

## Task 9: doGet / doPost ルーティング拡張

**目的:** 既存 `doGet` を壊さず、`action=powerteam*` と `page=*` を追加。新規 `doPost` を実装。

**Files:**
- 修正: `202608BOD/gas/top-chapter/code.gs`（既存 doGet を差し替え）
- 修正: `202608BOD/gas/top-chapter/powerteam.gs`（ハンドラ追加）

- [ ] **Step 1: 既存 doGet を確認しつつバックアップ**

`code.gs` を開き、現在の `function doGet(e) {...}` の中身をコメントで保存しておく（万一のロールバック用）。

- [ ] **Step 2: code.gs の doGet を差し替え**

`code.gs` の既存 `doGet(e)` を以下に置換：

```javascript
function doGet(e) {
  var p = (e && e.parameter) || {};

  // HTMLページ返却
  if (p.page) {
    return pt_renderPage_(p.page);
  }

  var action = p.action || 'all';

  // パワーチーム系
  if (action === 'powerteam') {
    return _json({ items: getPowerTeamAll_(false) });
  }
  if (action === 'powerteam-all') {
    return _json({ items: getPowerTeamAll_(true) });
  }
  if (action === 'powerteam-one') {
    var one = getPowerTeamOne_(p.name);
    return _json(one ? { found: true, item: one } : { found: false });
  }

  // 既存
  var data;
  if (action === 'all') {
    data = { events: getAllEvents(), members: getMembers() };
  } else if (action === 'events') {
    data = { events: getAllEvents() };
  } else if (action === 'members') {
    data = { members: getMembers() };
  } else {
    data = { error: 'Unknown action' };
  }
  return _json(data);
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 3: doPost を code.gs 末尾に追加**

```javascript
function doPost(e) {
  var p = (e && e.parameter) || {};
  var body;
  try {
    body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (err) {
    return _json({ ok: false, error: 'Invalid JSON body' });
  }

  try {
    if (p.action === 'submit') {
      return _json(pt_handleSubmit_(body));
    }
    if (p.action === 'update') {
      return _json(pt_handleUpdate_(body));
    }
    if (p.action === 'delete') {
      return _json(pt_handleDelete_(body));
    }
    return _json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    Logger.log('doPost error: ' + err.stack);
    return _json({ ok: false, error: String(err) });
  }
}
```

- [ ] **Step 4: powerteam.gs にハンドラ関数を追加**

```javascript
// ==========================================
// doPost ハンドラ
// ==========================================
function pt_handleSubmit_(body) {
  if (!body.submitter_name) throw new Error('submitter_name is required');
  if (!body.image1_base64 || !body.image2_base64) throw new Error('2 images required');

  // 事前チェック: needsConfirm （既存者への上書き）
  if (!body.confirm_overwrite) {
    var existing = getPowerTeamOne_(body.submitter_name);
    if (existing) {
      return { needsConfirm: true, message: body.submitter_name + 'さんの提出は既にあります。上書きしますか？' };
    }
  }

  var images = [
    { base64: body.image1_base64, mime: body.image1_mime || 'image/jpeg' },
    { base64: body.image2_base64, mime: body.image2_mime || 'image/jpeg' }
  ];

  // Drive保存
  var urls = saveImagesToDrive_(images, body.submitter_name);

  // Gemini OCR
  var ocr;
  var warnings = [];
  try {
    ocr = callGeminiOCR_(images);
    warnings = ocr.warnings || [];
  } catch (e) {
    ocr = { p3_page: { detected: false, raw_text: '' }, p4_page: { detected: false, raw_text: '' } };
    warnings = ['AI書き起こしに失敗しました（' + String(e).substring(0, 200) + '）。手入力で完成させてください。'];
  }

  var fields = {
    submitter_name: body.submitter_name,
    powerteam_name: (ocr.p4_page && ocr.p4_page.powerteam_name) || '',
    mission: (ocr.p4_page && ocr.p4_page.mission) || '',
    self_specialty: (ocr.p4_page && ocr.p4_page.self_specialty) || '',
    target: (ocr.p4_page && ocr.p4_page.target) || '',
    specialty_1: (ocr.p4_page && ocr.p4_page.specialty_1) || '',
    specialty_2: (ocr.p4_page && ocr.p4_page.specialty_2) || '',
    specialty_3: (ocr.p4_page && ocr.p4_page.specialty_3) || '',
    specialty_4: (ocr.p4_page && ocr.p4_page.specialty_4) || '',
    specialty_5: (ocr.p4_page && ocr.p4_page.specialty_5) || '',
    specialty_6: (ocr.p4_page && ocr.p4_page.specialty_6) || '',
    specialty_7: (ocr.p4_page && ocr.p4_page.specialty_7) || '',
    additional_specialties: (ocr.p4_page && ocr.p4_page.additional_specialties) || [],
    emotional_why: (ocr.p3_page && ocr.p3_page.emotional_why) || '',
    emotional_joys: (ocr.p3_page && ocr.p3_page.emotional_joys) || '',
    target_needs: (ocr.p3_page && ocr.p3_page.target_needs) || '',
    target_definition: (ocr.p3_page && ocr.p3_page.target_definition) || '',
    p3_image_url: urls[0],
    p4_image_url: urls[1],
    p3_raw_text: (ocr.p3_page && ocr.p3_page.raw_text) || '',
    p4_raw_text: (ocr.p4_page && ocr.p4_page.raw_text) || '',
    status: PT_STATUS.DRAFT
  };

  // どっちがp3でどっちがp4かAI判定に基づいて image_url を入れ替える必要はあるか？
  // → Geminiは画像順序と検出結果を対応させないので、image_urls は「順不同で保存」で良い。
  //   ただしユーザーがp.3として撮ったつもりの画像がp.4として認識される場合もあるので、
  //   UI側で両画像プレビューを表示し「これがp.3, これがp.4」と目視確認可能にする。

  var result = savePowerTeamRow_(fields);
  return {
    ok: true,
    submission_id: result.submission_id,
    fields: fields,
    warnings: warnings
  };
}

function pt_handleUpdate_(body) {
  if (!body.submission_id) throw new Error('submission_id is required');
  var updated = updatePowerTeamRow_(body.submission_id, body);
  return { ok: true, updated_at: updated.updated_at };
}

function pt_handleDelete_(body) {
  if (!body.submission_id) throw new Error('submission_id is required');
  deletePowerTeamRow_(body.submission_id);
  return { ok: true };
}

// ==========================================
// HTMLページ返却
// ==========================================
function pt_renderPage_(pageName) {
  var allowed = { view: 1, submit: 1, edit: 1, admin: 1 };
  if (!allowed[pageName]) pageName = 'view';
  var tpl = HtmlService.createTemplateFromFile(pageName);
  return tpl.evaluate()
    .setTitle('BNI TOPチャプター パワーチーム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function pt_include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

- [ ] **Step 5: 空のHTMLファイル4つを暫定作成**

（次のTaskで中身を埋める。今は push が通るために空でも作る）

作成: `C:\Users\endle\.claude\202608BOD\gas\top-chapter\view.html`

```html
<!DOCTYPE html>
<html><body>View page placeholder</body></html>
```

同じ内容で `submit.html` / `edit.html` / `admin.html` / `include.html` も作成。

- [ ] **Step 6: push**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

- [ ] **Step 7: 既存機能の非破壊テスト**

既存の Web アプリ URL に以下を付けてブラウザでアクセスし、いずれもJSONが返ることを確認：
- `?action=all` → 既存 events + members
- `?action=events` → 既存
- `?action=members` → 既存
- `?action=powerteam` → `{items: []}` （まだ提出がないので空）
- `?page=view` → HTMLでプレースホルダ

- [ ] **Step 8: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/
git commit -m "feat(powerteam): add doGet/doPost routing and page rendering"
```

---

## Task 10: include.html（共通CSS/JS）

**目的:** 全ページ共通のスタイルとユーティリティ関数を集約。

**Files:**
- 修正: `202608BOD/gas/top-chapter/include.html`

- [ ] **Step 1: include.html の中身を書く**

```html
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif;
    color: #1F2937;
    background: #F9FAFB;
    -webkit-text-size-adjust: 100%;
  }
  h1 { color: #1E3040; margin: 8px 0 16px; font-size: 20px; }
  h2 { color: #1E3040; margin: 24px 0 8px; font-size: 16px; }
  .nav { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .btn {
    display: inline-block; padding: 10px 16px; border: none; border-radius: 6px;
    background: #0EA5E9; color: #FFF; font-size: 14px; font-weight: 600;
    text-decoration: none; cursor: pointer; text-align: center;
  }
  .btn:hover { background: #0284C7; }
  .btn.secondary { background: #6B7280; }
  .btn.danger { background: #DC2626; }
  .btn.purple { background: #8B5CF6; }
  .btn:disabled { background: #9CA3AF; cursor: not-allowed; }
  .card {
    background: #FFF; border: 1px solid #E5E7EB; border-radius: 8px;
    padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .field { margin-bottom: 12px; }
  .field label {
    display: block; font-size: 12px; font-weight: 600;
    color: #6B7280; margin-bottom: 4px;
  }
  .field input, .field textarea, .field select {
    width: 100%; padding: 8px 10px; border: 1px solid #D1D5DB;
    border-radius: 6px; font-size: 14px; font-family: inherit;
  }
  .field textarea { min-height: 60px; resize: vertical; }
  .warn {
    background: #FEF3C7; border-left: 4px solid #F59E0B;
    padding: 10px 12px; margin: 12px 0; border-radius: 4px; font-size: 13px;
  }
  .error {
    background: #FEE2E2; border-left: 4px solid #DC2626;
    padding: 10px 12px; margin: 12px 0; border-radius: 4px; font-size: 13px;
  }
  .success {
    background: #D1FAE5; border-left: 4px solid #10B981;
    padding: 10px 12px; margin: 12px 0; border-radius: 4px; font-size: 13px;
  }
  .team-section { margin-top: 24px; }
  .team-header {
    background: #8B5CF6; color: #FFF; padding: 8px 12px;
    border-radius: 6px; font-weight: 700; font-size: 14px;
  }
  .cards-grid {
    display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 12px;
  }
  @media (min-width: 640px) {
    .cards-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (min-width: 960px) {
    .cards-grid { grid-template-columns: repeat(3, 1fr); }
  }
  .member-name { font-size: 16px; font-weight: 700; color: #1E3040; }
  .member-sub { font-size: 12px; color: #6B7280; margin-top: 4px; }
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: none; align-items: center; justify-content: center;
    z-index: 1000; padding: 12px;
  }
  .modal-overlay.open { display: flex; }
  .modal-content {
    background: #FFF; border-radius: 8px; max-width: 720px; width: 100%;
    max-height: 90vh; overflow-y: auto; padding: 20px;
  }
  .modal-close {
    float: right; background: none; border: none;
    font-size: 24px; cursor: pointer; color: #6B7280;
  }
  .thumb {
    width: 100%; max-width: 400px; border: 1px solid #E5E7EB;
    border-radius: 4px; cursor: pointer;
  }
  .file-buttons { display: flex; gap: 8px; margin-top: 8px; }
  .file-buttons label {
    flex: 1; padding: 10px; background: #0EA5E9; color: #FFF;
    border-radius: 6px; text-align: center; cursor: pointer; font-size: 14px;
  }
  .file-buttons input[type="file"] { display: none; }
  .progress { text-align: center; padding: 30px 12px; color: #6B7280; }
  .progress-step { margin: 6px 0; font-size: 14px; }
  .spinner {
    display: inline-block; width: 24px; height: 24px;
    border: 3px solid #E5E7EB; border-top-color: #0EA5E9;
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

<script>
  // GAS Webapp のベースURL（現在のページから抽出）
  var PT_BASE = window.location.href.split('?')[0];

  // GET リクエスト
  function ptGet(action, params) {
    var qs = 'action=' + encodeURIComponent(action);
    if (params) {
      Object.keys(params).forEach(function(k) {
        qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      });
    }
    return fetch(PT_BASE + '?' + qs).then(function(r) { return r.json(); });
  }

  // POST リクエスト（GAS Webapp は Content-Type text/plain で受ける、CORS プリフライト回避）
  function ptPost(action, body) {
    return fetch(PT_BASE + '?action=' + encodeURIComponent(action), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }

  // ページ遷移
  function ptGoto(page) {
    window.location.href = PT_BASE + '?page=' + page;
  }

  // ファイル → base64（データURL部分を除いたbase64のみ）
  function ptFileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        var result = reader.result;
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.substring(comma + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 画像圧縮（長辺2000px、JPEG 0.85）
  async function ptCompressImage(file) {
    // HEIC対応（動的ロード）
    if (/^image\/heic$/i.test(file.type) || /\.heic$/i.test(file.name)) {
      await ptLoadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
      file = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    }
    var img = await ptLoadImage(URL.createObjectURL(file));
    var maxSide = 2000;
    var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    var w = Math.round(img.width * scale);
    var h = Math.round(img.height * scale);
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    var blob = await new Promise(function(resolve) {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    return {
      base64: await ptFileToBase64(blob),
      mime: 'image/jpeg',
      previewUrl: URL.createObjectURL(blob)
    };
  }

  function ptLoadImage(src) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function ptLoadScript(src) {
    return new Promise(function(resolve, reject) {
      if (document.querySelector('script[data-src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.dataset.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ptEscapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function ptNav() {
    return '<div class="nav">' +
      '<a class="btn purple" href="' + PT_BASE + '?page=view">🎯 一覧</a>' +
      '<a class="btn" href="' + PT_BASE + '?page=submit">📄 提出する</a>' +
      '<a class="btn secondary" href="' + PT_BASE + '?page=edit">✏️ 編集する</a>' +
      '</div>';
  }
</script>
```

- [ ] **Step 2: push**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

- [ ] **Step 3: 動作確認**

`?page=view` にアクセス→まだプレースホルダだが CSS/JS がインクルードされていることを（次のTaskで）確認する準備。今はエラーなくpushできればOK。

- [ ] **Step 4: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/include.html
git commit -m "feat(powerteam): add shared CSS/JS include with image compression"
```

---

## Task 11: submit.html（提出フォーム）

**目的:** 名前入力→画像2枚アップロード→AI書き起こし→修正→保存 の一連フローを1ページで実装。

**Files:**
- 修正: `202608BOD/gas/top-chapter/submit.html`

- [ ] **Step 1: submit.html を書く**

`submit.html` を以下で全置換：

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <?!= pt_include_('include') ?>
</head>
<body>
  <?!= '' ?>
  <h1>📄 パワーチーム ワークシート 提出</h1>
  <div id="nav-container"></div>

  <!-- Step 1: 名前入力 -->
  <div id="step1" class="card">
    <div class="field">
      <label>お名前（例: 山田太郎）</label>
      <input type="text" id="name-input" autocomplete="off">
    </div>
    <button class="btn" onclick="goStep2()">次へ →</button>
  </div>

  <!-- Step 2: 画像アップロード -->
  <div id="step2" class="card" style="display:none;">
    <div class="field">
      <label>📄 ワークシート画像1（p.3 または p.4）</label>
      <div class="file-buttons">
        <label>📷 撮影
          <input type="file" accept="image/*" capture="environment" onchange="handleFile(1, this)">
        </label>
        <label style="background:#6B7280;">🖼 選択
          <input type="file" accept="image/*,.heic" onchange="handleFile(1, this)">
        </label>
      </div>
      <img id="preview-1" class="thumb" style="display:none; margin-top:8px;">
    </div>
    <div class="field">
      <label>📄 ワークシート画像2</label>
      <div class="file-buttons">
        <label>📷 撮影
          <input type="file" accept="image/*" capture="environment" onchange="handleFile(2, this)">
        </label>
        <label style="background:#6B7280;">🖼 選択
          <input type="file" accept="image/*,.heic" onchange="handleFile(2, this)">
        </label>
      </div>
      <img id="preview-2" class="thumb" style="display:none; margin-top:8px;">
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn secondary" onclick="goStep1()">← 戻る</button>
      <button class="btn" id="submit-btn" onclick="doSubmit()" disabled>送信 →</button>
    </div>
    <div id="step2-error"></div>
  </div>

  <!-- Step 2.5: 処理中 -->
  <div id="step25" class="card progress" style="display:none;">
    <div class="spinner"></div>
    <div class="progress-step" id="prog-1">📤 画像を圧縮しています…</div>
    <div class="progress-step" id="prog-2" style="color:#9CA3AF;">🤖 AIが手書きを読み取っています…</div>
    <div class="progress-step" id="prog-3" style="color:#9CA3AF;">💾 保存しています…</div>
  </div>

  <!-- Step 3: 書き起こし結果の確認・修正 -->
  <div id="step3" style="display:none;">
    <div id="warnings-container"></div>
    <div class="card">
      <h2>✏️ AI書き起こし結果を確認・修正</h2>
      <p style="font-size:12px; color:#6B7280;">
        AIが読み取った内容です。誤字があれば修正してください。
      </p>
      <div class="field"><label>パワーチーム名</label><input type="text" id="f-powerteam_name"></div>
      <div class="field"><label>ミッション</label><textarea id="f-mission"></textarea></div>
      <div class="field"><label>あなたの専門</label><input type="text" id="f-self_specialty"></div>
      <div class="field"><label>ターゲット</label><input type="text" id="f-target"></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <div class="field"><label>専門分野1</label><input type="text" id="f-specialty_1"></div>
        <div class="field"><label>専門分野2</label><input type="text" id="f-specialty_2"></div>
        <div class="field"><label>専門分野3</label><input type="text" id="f-specialty_3"></div>
        <div class="field"><label>専門分野4</label><input type="text" id="f-specialty_4"></div>
        <div class="field"><label>専門分野5</label><input type="text" id="f-specialty_5"></div>
        <div class="field"><label>専門分野6</label><input type="text" id="f-specialty_6"></div>
        <div class="field"><label>専門分野7</label><input type="text" id="f-specialty_7"></div>
      </div>
      <div class="field">
        <label>追加専門分野（カンマ区切り）</label>
        <input type="text" id="f-additional_specialties">
      </div>
      <h2>ターゲット・マーケット（p.3）</h2>
      <div class="field"><label>なぜこの仕事をしているのか</label><textarea id="f-emotional_why"></textarea></div>
      <div class="field"><label>その人からどんな喜びを得られるのか</label><textarea id="f-emotional_joys"></textarea></div>
      <div class="field"><label>ターゲットの困りごと・ニーズ</label><textarea id="f-target_needs"></textarea></div>
      <div class="field"><label>私のターゲットは</label><textarea id="f-target_definition"></textarea></div>
    </div>
    <div class="card">
      <h2>📎 原本画像</h2>
      <p style="font-size:12px; color:#6B7280;">タップで拡大</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <img id="orig-1" class="thumb" onclick="window.open(this.src)">
        <img id="orig-2" class="thumb" onclick="window.open(this.src)">
      </div>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn secondary" onclick="goStep1()">キャンセル</button>
      <button class="btn purple" onclick="doConfirm()">✅ 保存する</button>
    </div>
  </div>

  <!-- Step 4: 完了 -->
  <div id="step4" class="card" style="display:none;">
    <div class="success">✅ 保存しました！</div>
    <p>内容を変更したい場合は「編集する」ページから、お名前で検索してください。</p>
    <div style="display:flex; gap:8px;">
      <a class="btn purple" href="#" id="to-view">🎯 パワーチーム一覧を見る</a>
    </div>
  </div>

<script>
  var state = { name: '', imgs: [null, null], submissionId: null, fields: null };

  document.getElementById('nav-container').innerHTML = ptNav();
  document.getElementById('to-view').href = PT_BASE + '?page=view';

  function show(id) {
    ['step1','step2','step25','step3','step4'].forEach(function(x) {
      document.getElementById(x).style.display = x === id ? 'block' : 'none';
    });
    window.scrollTo(0, 0);
  }

  function goStep1() { show('step1'); }

  function goStep2() {
    var name = document.getElementById('name-input').value.trim();
    if (!name) { alert('お名前を入力してください'); return; }
    state.name = name;
    show('step2');
  }

  async function handleFile(slot, input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    document.getElementById('step2-error').innerHTML =
      '<div style="color:#6B7280; font-size:12px; margin-top:8px;">圧縮中… ' + file.name + '</div>';
    try {
      var compressed = await ptCompressImage(file);
      state.imgs[slot - 1] = compressed;
      var preview = document.getElementById('preview-' + slot);
      preview.src = compressed.previewUrl;
      preview.style.display = 'block';
      document.getElementById('step2-error').innerHTML = '';
    } catch (e) {
      document.getElementById('step2-error').innerHTML =
        '<div class="error">画像を読み込めませんでした: ' + ptEscapeHtml(String(e)) + '</div>';
    }
    updateSubmitBtn();
  }

  function updateSubmitBtn() {
    document.getElementById('submit-btn').disabled = !(state.imgs[0] && state.imgs[1]);
  }

  async function doSubmit(confirmOverwrite) {
    show('step25');
    setTimeout(function() {
      document.getElementById('prog-1').style.color = '#10B981';
      document.getElementById('prog-2').style.color = '#1F2937';
    }, 500);
    try {
      var body = {
        submitter_name: state.name,
        image1_base64: state.imgs[0].base64, image1_mime: state.imgs[0].mime,
        image2_base64: state.imgs[1].base64, image2_mime: state.imgs[1].mime,
        confirm_overwrite: !!confirmOverwrite
      };
      var res = await ptPost('submit', body);
      if (res.needsConfirm) {
        if (confirm(res.message)) {
          return doSubmit(true);
        } else {
          show('step2');
          return;
        }
      }
      if (!res.ok) throw new Error(res.error || '送信失敗');
      document.getElementById('prog-2').style.color = '#10B981';
      document.getElementById('prog-3').style.color = '#1F2937';
      state.submissionId = res.submission_id;
      state.fields = res.fields;

      // フィールドに反映
      Object.keys(res.fields).forEach(function(k) {
        var el = document.getElementById('f-' + k);
        if (!el) return;
        if (k === 'additional_specialties' && Array.isArray(res.fields[k])) {
          el.value = res.fields[k].join(', ');
        } else {
          el.value = res.fields[k] || '';
        }
      });
      document.getElementById('orig-1').src = res.fields.p3_image_url;
      document.getElementById('orig-2').src = res.fields.p4_image_url;

      // 警告表示
      var wc = document.getElementById('warnings-container');
      wc.innerHTML = '';
      (res.warnings || []).forEach(function(w) {
        wc.innerHTML += '<div class="warn">⚠️ ' + ptEscapeHtml(w) + '</div>';
      });

      show('step3');
    } catch (e) {
      alert('送信に失敗しました: ' + e.message);
      show('step2');
    }
  }

  async function doConfirm() {
    var body = { submission_id: state.submissionId, submitter_name: state.name, status: 'confirmed' };
    var fieldKeys = [
      'powerteam_name','mission','self_specialty','target',
      'specialty_1','specialty_2','specialty_3','specialty_4',
      'specialty_5','specialty_6','specialty_7',
      'emotional_why','emotional_joys','target_needs','target_definition'
    ];
    fieldKeys.forEach(function(k) {
      body[k] = document.getElementById('f-' + k).value;
    });
    var addRaw = document.getElementById('f-additional_specialties').value;
    body.additional_specialties = addRaw.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s; });

    try {
      var res = await ptPost('update', body);
      if (!res.ok) throw new Error(res.error || '保存失敗');
      show('step4');
    } catch (e) {
      alert('保存に失敗しました: ' + e.message);
    }
  }
</script>
</body>
</html>
```

- [ ] **Step 2: push**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

- [ ] **Step 3: デプロイ更新（コードとHTMLを反映）**

GASエディタ → デプロイ → デプロイを管理 → 既存デプロイの ✏️ 編集 → バージョン「新バージョン」 → デプロイ

⚠️ 「新規デプロイ」は絶対に選ばない。

- [ ] **Step 4: 実機テスト（スマホ推奨）**

WebアプリURL `?page=submit` をスマホで開き：
1. 名前入力 → 次へ
2. サンプル画像2枚を「撮影」または「選択」でアップロード → プレビュー表示確認
3. 送信 → プログレス → Step 3に主要フィールドが埋まった状態で表示
4. 何項目か修正 → 保存 → Step 4 完了画面

- [ ] **Step 5: シート確認**

スプレッドシートの「パワーチーム提出」に1行増え、`status=confirmed` になっていることを確認。

- [ ] **Step 6: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/submit.html
git commit -m "feat(powerteam): implement submit form with AI transcription flow"
```

---

## Task 12: edit.html（編集ページ）

**目的:** 名前検索→本人確認→編集→保存 のフローを実装。submit.htmlのStep 3のフォーム部分を流用する。

**Files:**
- 修正: `202608BOD/gas/top-chapter/edit.html`

- [ ] **Step 1: edit.html を書く**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <?!= pt_include_('include') ?>
</head>
<body>
  <h1>✏️ パワーチーム 編集</h1>
  <div id="nav-container"></div>

  <!-- Step 1: 名前検索 -->
  <div id="step1" class="card">
    <div class="field">
      <label>お名前で検索（例: 山田太郎）</label>
      <input type="text" id="name-input" autocomplete="off">
    </div>
    <button class="btn" onclick="doSearch()">検索</button>
    <div id="search-msg"></div>
  </div>

  <!-- Step 2: 本人確認 -->
  <div id="step2" class="card" style="display:none;">
    <div class="warn">
      ⚠️ <strong id="confirm-name"></strong>さんの提出内容を編集します。よろしいですか？
      <div style="margin-top:6px; font-size:12px; color:#6B7280;" id="confirm-detail"></div>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn secondary" onclick="goStep1()">いいえ、戻る</button>
      <button class="btn purple" onclick="goStep3()">はい、編集する</button>
    </div>
  </div>

  <!-- Step 3: 編集フォーム（submit.htmlのStep3と同じ構造） -->
  <div id="step3" style="display:none;">
    <div class="card">
      <h2>✏️ 内容を編集</h2>
      <div class="field"><label>パワーチーム名</label><input type="text" id="f-powerteam_name"></div>
      <div class="field"><label>ミッション</label><textarea id="f-mission"></textarea></div>
      <div class="field"><label>あなたの専門</label><input type="text" id="f-self_specialty"></div>
      <div class="field"><label>ターゲット</label><input type="text" id="f-target"></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <div class="field"><label>専門分野1</label><input type="text" id="f-specialty_1"></div>
        <div class="field"><label>専門分野2</label><input type="text" id="f-specialty_2"></div>
        <div class="field"><label>専門分野3</label><input type="text" id="f-specialty_3"></div>
        <div class="field"><label>専門分野4</label><input type="text" id="f-specialty_4"></div>
        <div class="field"><label>専門分野5</label><input type="text" id="f-specialty_5"></div>
        <div class="field"><label>専門分野6</label><input type="text" id="f-specialty_6"></div>
        <div class="field"><label>専門分野7</label><input type="text" id="f-specialty_7"></div>
      </div>
      <div class="field">
        <label>追加専門分野（カンマ区切り）</label>
        <input type="text" id="f-additional_specialties">
      </div>
      <h2>ターゲット・マーケット（p.3）</h2>
      <div class="field"><label>なぜこの仕事をしているのか</label><textarea id="f-emotional_why"></textarea></div>
      <div class="field"><label>その人からどんな喜びを得られるのか</label><textarea id="f-emotional_joys"></textarea></div>
      <div class="field"><label>ターゲットの困りごと・ニーズ</label><textarea id="f-target_needs"></textarea></div>
      <div class="field"><label>私のターゲットは</label><textarea id="f-target_definition"></textarea></div>
    </div>
    <div class="card">
      <h2>📎 原本画像</h2>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <img id="orig-1" class="thumb" onclick="window.open(this.src)">
        <img id="orig-2" class="thumb" onclick="window.open(this.src)">
      </div>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn secondary" onclick="goStep1()">キャンセル</button>
      <button class="btn purple" onclick="doSave()">✅ 保存する</button>
    </div>
  </div>

  <!-- Step 4: 完了 -->
  <div id="step4" class="card" style="display:none;">
    <div class="success">✅ 保存しました！</div>
    <div style="display:flex; gap:8px;">
      <a class="btn purple" id="to-view">🎯 一覧を見る</a>
    </div>
  </div>

<script>
  var state = { item: null };

  document.getElementById('nav-container').innerHTML = ptNav();
  document.getElementById('to-view').href = PT_BASE + '?page=view';

  function show(id) {
    ['step1','step2','step3','step4'].forEach(function(x) {
      document.getElementById(x).style.display = x === id ? 'block' : 'none';
    });
    window.scrollTo(0, 0);
  }

  function goStep1() { show('step1'); document.getElementById('search-msg').innerHTML = ''; }

  async function doSearch() {
    var name = document.getElementById('name-input').value.trim();
    if (!name) { alert('お名前を入力してください'); return; }
    document.getElementById('search-msg').innerHTML =
      '<div style="color:#6B7280; margin-top:8px;">検索中…</div>';
    var res = await ptGet('powerteam-one', { name: name });
    if (!res.found) {
      document.getElementById('search-msg').innerHTML =
        '<div class="error">「' + ptEscapeHtml(name) + '」さんの提出は見つかりませんでした。</div>';
      return;
    }
    state.item = res.item;
    document.getElementById('confirm-name').textContent = res.item.submitter_name;
    document.getElementById('confirm-detail').textContent =
      'パワーチーム名: ' + (res.item.powerteam_name || '(未設定)') +
      ' / 提出日時: ' + res.item.submitted_at;
    show('step2');
  }

  function goStep3() {
    var item = state.item;
    var keys = [
      'powerteam_name','mission','self_specialty','target',
      'specialty_1','specialty_2','specialty_3','specialty_4',
      'specialty_5','specialty_6','specialty_7',
      'emotional_why','emotional_joys','target_needs','target_definition'
    ];
    keys.forEach(function(k) { document.getElementById('f-' + k).value = item[k] || ''; });
    document.getElementById('f-additional_specialties').value =
      (item.additional_specialties || []).join(', ');
    document.getElementById('orig-1').src = item.p3_image_url || '';
    document.getElementById('orig-2').src = item.p4_image_url || '';
    show('step3');
  }

  async function doSave() {
    var body = {
      submission_id: state.item.submission_id,
      submitter_name: state.item.submitter_name,
      status: 'confirmed'
    };
    var keys = [
      'powerteam_name','mission','self_specialty','target',
      'specialty_1','specialty_2','specialty_3','specialty_4',
      'specialty_5','specialty_6','specialty_7',
      'emotional_why','emotional_joys','target_needs','target_definition'
    ];
    keys.forEach(function(k) { body[k] = document.getElementById('f-' + k).value; });
    var addRaw = document.getElementById('f-additional_specialties').value;
    body.additional_specialties = addRaw.split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s; });

    try {
      var res = await ptPost('update', body);
      if (!res.ok) throw new Error(res.error || '保存失敗');
      show('step4');
    } catch (e) {
      alert('保存に失敗しました: ' + e.message);
    }
  }
</script>
</body>
</html>
```

- [ ] **Step 2: push & デプロイ更新**

```powershell
cd C:\Users\endle\.claude\202608BOD\gas\top-chapter
clasp push
```

GASエディタから「デプロイを管理→編集→新バージョン→デプロイ」。

- [ ] **Step 3: 動作確認**

`?page=edit` にアクセス：
1. Task 11 で作成した名前を入力→検索
2. 本人確認ダイアログ表示→「はい」
3. 全フィールドが prefill された状態で編集画面
4. 何項目か変更→保存
5. シートで `updated_at` が更新、値が変わっていることを確認

- [ ] **Step 4: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/edit.html
git commit -m "feat(powerteam): implement edit page with name search and identity confirmation"
```

---

## Task 13: view.html（一覧表示ページ）

**目的:** パワーチーム名でグルーピング表示、検索、[詳細]モーダル、原本画像表示を実装。

**Files:**
- 修正: `202608BOD/gas/top-chapter/view.html`

- [ ] **Step 1: view.html を書く**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <?!= pt_include_('include') ?>
</head>
<body>
  <h1>🎯 パワーチーム一覧</h1>
  <div id="nav-container"></div>

  <div class="card">
    <div class="field">
      <input type="text" id="search-input" placeholder="🔍 メンバー名・ミッション・専門分野で検索" oninput="renderList()">
    </div>
  </div>

  <div id="list-container">
    <div class="progress"><div class="spinner"></div><div class="progress-step">読み込み中…</div></div>
  </div>

  <!-- 詳細モーダル -->
  <div class="modal-overlay" id="modal">
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()">×</button>
      <div id="modal-body"></div>
    </div>
  </div>

<script>
  var allItems = [];

  document.getElementById('nav-container').innerHTML = ptNav();

  async function loadItems() {
    try {
      var res = await ptGet('powerteam', {});
      allItems = res.items || [];
      renderList();
    } catch (e) {
      document.getElementById('list-container').innerHTML =
        '<div class="error">読み込みに失敗しました: ' + ptEscapeHtml(String(e)) + '</div>';
    }
  }

  function renderList() {
    var q = document.getElementById('search-input').value.trim().toLowerCase();
    var filtered = allItems.filter(function(it) {
      if (!q) return true;
      var hay = [
        it.submitter_name, it.powerteam_name, it.mission,
        it.self_specialty, it.target,
        it.specialty_1, it.specialty_2, it.specialty_3, it.specialty_4,
        it.specialty_5, it.specialty_6, it.specialty_7,
        (it.additional_specialties || []).join(' ')
      ].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });

    if (filtered.length === 0) {
      document.getElementById('list-container').innerHTML =
        '<div class="card">該当するメンバーが見つかりません。</div>';
      return;
    }

    // グルーピング
    var groups = {};
    filtered.forEach(function(it) {
      var name = (it.powerteam_name || '(未設定)').trim();
      if (!groups[name]) groups[name] = [];
      groups[name].push(it);
    });

    // ソート: メンバー数多い順→五十音順
    var teamNames = Object.keys(groups).sort(function(a, b) {
      if (groups[b].length !== groups[a].length) return groups[b].length - groups[a].length;
      return a.localeCompare(b, 'ja');
    });

    var html = '';
    teamNames.forEach(function(team) {
      var members = groups[team];
      html += '<div class="team-section">';
      html += '<div class="team-header">▼ ' + ptEscapeHtml(team) +
              '（' + members.length + '名）</div>';
      html += '<div class="cards-grid">';
      members.forEach(function(m, idx) {
        html += '<div class="card">' +
          '<div class="member-name">' + ptEscapeHtml(m.submitter_name) + '</div>' +
          '<div class="member-sub">🎯 ' + ptEscapeHtml(m.self_specialty || '(専門未設定)') + '</div>' +
          '<div class="member-sub">👤 ターゲット: ' + ptEscapeHtml(m.target || '未設定') + '</div>' +
          '<button class="btn" style="margin-top:10px;" ' +
          'onclick="showDetail(\'' + ptEscapeHtml(m.submission_id) + '\')">📖 詳細を見る</button>' +
        '</div>';
      });
      html += '</div></div>';
    });
    document.getElementById('list-container').innerHTML = html;
  }

  function showDetail(subId) {
    var m = allItems.find(function(x) { return x.submission_id === subId; });
    if (!m) return;
    var html = '<h1 style="margin-top:0;">' + ptEscapeHtml(m.submitter_name) + '</h1>';
    html += '<div class="member-sub">パワーチーム: ' + ptEscapeHtml(m.powerteam_name || '(未設定)') + '</div>';
    html += '<h2>🎯 ミッション</h2><div>' + ptEscapeHtml(m.mission).replace(/\n/g, '<br>') + '</div>';
    html += '<h2>あなたの専門 / ターゲット</h2>';
    html += '<div><strong>専門:</strong> ' + ptEscapeHtml(m.self_specialty) + '</div>';
    html += '<div><strong>ターゲット:</strong> ' + ptEscapeHtml(m.target) + '</div>';
    html += '<h2>🔧 パワーチームに必要な専門分野</h2><ul>';
    ['specialty_1','specialty_2','specialty_3','specialty_4','specialty_5','specialty_6','specialty_7'].forEach(function(k, i) {
      if (m[k]) html += '<li>' + (i+1) + ': ' + ptEscapeHtml(m[k]) + '</li>';
    });
    html += '</ul>';
    if (m.additional_specialties && m.additional_specialties.length) {
      html += '<div><strong>追加:</strong> ' + m.additional_specialties.map(ptEscapeHtml).join(', ') + '</div>';
    }
    html += '<h2>💡 なぜこの仕事をしているのか</h2><div>' + ptEscapeHtml(m.emotional_why).replace(/\n/g, '<br>') + '</div>';
    html += '<h2>😊 得られる喜び</h2><div>' + ptEscapeHtml(m.emotional_joys).replace(/\n/g, '<br>') + '</div>';
    html += '<h2>🎯 ターゲットの困りごと・ニーズ</h2><div>' + ptEscapeHtml(m.target_needs).replace(/\n/g, '<br>') + '</div>';
    html += '<h2>👤 私のターゲット</h2><div>' + ptEscapeHtml(m.target_definition).replace(/\n/g, '<br>') + '</div>';
    html += '<h2>📎 原本画像</h2>';
    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">';
    html += '<img class="thumb" src="' + ptEscapeHtml(m.p3_image_url) + '" onclick="window.open(this.src)">';
    html += '<img class="thumb" src="' + ptEscapeHtml(m.p4_image_url) + '" onclick="window.open(this.src)">';
    html += '</div>';
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('open');
  }
  document.getElementById('modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  loadItems();
</script>
</body>
</html>
```

- [ ] **Step 2: push & デプロイ更新**

- [ ] **Step 3: 動作確認**

`?page=view` にアクセス、Task 11 で作った提出が表示されることを確認：
- パワーチーム名でグループ化されている
- 検索窓に部分文字列を入れると絞り込まれる
- [詳細] クリックでモーダル、全フィールド＋原本画像2枚が表示される
- 画像をクリックすると新規タブで拡大表示

- [ ] **Step 4: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/view.html
git commit -m "feat(powerteam): implement viewer with team grouping, search, and detail modal"
```

---

## Task 14: admin.html（管理画面・簡易版）

**目的:** draft含む全件一覧、status変更、論理削除、AI再書き起こしを可能にする。

**Files:**
- 修正: `202608BOD/gas/top-chapter/admin.html`

- [ ] **Step 1: admin.html を書く**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <?!= pt_include_('include') ?>
</head>
<body>
  <h1>🛠 パワーチーム 管理画面</h1>
  <div id="nav-container"></div>

  <div class="card">
    <p style="font-size:12px; color:#6B7280;">全提出（draft/deleted 含む）の管理画面です。</p>
  </div>

  <div id="list-container">
    <div class="progress"><div class="spinner"></div><div class="progress-step">読み込み中…</div></div>
  </div>

<script>
  document.getElementById('nav-container').innerHTML = ptNav();

  async function load() {
    var res = await ptGet('powerteam-all', {});
    var items = res.items || [];
    if (items.length === 0) {
      document.getElementById('list-container').innerHTML = '<div class="card">まだ提出がありません。</div>';
      return;
    }
    var html = '<table style="width:100%; border-collapse:collapse; font-size:13px;">' +
      '<tr style="background:#1E3040; color:#FFF;">' +
      '<th style="padding:8px; text-align:left;">提出者</th>' +
      '<th style="padding:8px; text-align:left;">チーム</th>' +
      '<th style="padding:8px;">status</th>' +
      '<th style="padding:8px;">提出</th>' +
      '<th style="padding:8px;">更新</th>' +
      '<th style="padding:8px;">操作</th></tr>';
    items.forEach(function(m) {
      var bg = m.status === 'draft' ? '#FEF3C7' :
               m.status === 'deleted' ? '#FEE2E2' : '#FFF';
      html += '<tr style="background:' + bg + '; border-bottom:1px solid #E5E7EB;">' +
        '<td style="padding:6px;">' + ptEscapeHtml(m.submitter_name) + '</td>' +
        '<td style="padding:6px;">' + ptEscapeHtml(m.powerteam_name || '-') + '</td>' +
        '<td style="padding:6px; text-align:center;">' + m.status + '</td>' +
        '<td style="padding:6px; font-size:11px;">' + m.submitted_at + '</td>' +
        '<td style="padding:6px; font-size:11px;">' + m.updated_at + '</td>' +
        '<td style="padding:6px;">' +
          (m.status !== 'confirmed'
            ? '<button class="btn purple" style="padding:4px 8px; font-size:11px;" onclick="doConfirm(\'' + m.submission_id + '\')">確定</button> '
            : '') +
          (m.status !== 'deleted'
            ? '<button class="btn danger" style="padding:4px 8px; font-size:11px;" onclick="doDelete(\'' + m.submission_id + '\', \'' + ptEscapeHtml(m.submitter_name) + '\')">削除</button>'
            : '<button class="btn secondary" style="padding:4px 8px; font-size:11px;" onclick="doRestore(\'' + m.submission_id + '\')">復元</button>') +
        '</td></tr>';
    });
    html += '</table>';
    document.getElementById('list-container').innerHTML = html;
  }

  async function doConfirm(id) {
    await ptPost('update', { submission_id: id, status: 'confirmed' });
    load();
  }

  async function doDelete(id, name) {
    if (!confirm(name + 'さんの提出を削除しますか？（論理削除なので後で復元可能）')) return;
    await ptPost('delete', { submission_id: id });
    load();
  }

  async function doRestore(id) {
    await ptPost('update', { submission_id: id, status: 'confirmed' });
    load();
  }

  load();
</script>
</body>
</html>
```

- [ ] **Step 2: push & デプロイ更新**

- [ ] **Step 3: 動作確認**

`?page=admin` にアクセス、テーブルで全提出が表示され、確定・削除・復元が動作することを確認。

- [ ] **Step 4: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/admin.html
git commit -m "feat(powerteam): implement admin page with status management"
```

---

## Task 15: E2Eテスト（10シナリオ）

**目的:** 設計書 §8-2 の10シナリオを実機で通す。

**Files:** なし（実行のみ、必要に応じて Bug fix コミット）

- [ ] **Step 1: シナリオ1〜10を順に実行**

各シナリオごとに結果を Logger または手元メモに記録。

| # | シナリオ | 実行 | 結果 |
|---|---|---|---|
| 1 | 新規提出（サンプル画像）| `?page=submit` から実施 | Step3にフィールド反映 |
| 2 | Step3で修正して保存 | 保存ボタン | シートに `status=confirmed` |
| 3 | Sites一覧確認 | Task 16 で Sites 埋め込み後、確認 | グルーピング表示、詳細モーダル、原本画像 |
| 4 | 再編集（本人確認） | `?page=edit` から実施 | 該当行更新、`updated_at`更新 |
| 5 | 同名重複 | 既存者名で再度 submit | 上書き確認ダイアログ→上書き |
| 6 | 画像順序逆 | p.4→p.3 の順でアップロード | AI自動判定、正しくフィールド分け |
| 7 | 大サイズ画像 | 4032×3024 のiPhone実写 | 圧縮後送信成功 |
| 8 | HEIC画像 | iPhone HEIC 直 | JPEG変換→送信成功 |
| 9 | ワークシート以外 | 全然関係ない写真 | 検出失敗、warnings、行未作成 |
| 10 | ネット断 | 送信途中でオフライン | エラー表示、シート未更新 |

- [ ] **Step 2: 失敗があれば修正**

シナリオごとの想定と乖離があれば powerteam.gs や HTML を修正、`clasp push` → デプロイ更新 → 再テスト。

- [ ] **Step 3: 全通過後にコミット（Bug fixがあれば）**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add gas/top-chapter/
git commit -m "fix(powerteam): E2E test findings"
```

---

## Task 16: Google Sites に「パワーチーム」ページを追加＆埋め込み

**目的:** BNI TOPチャプターメンバーが Sites 上からアクセスできる状態にする。

**Files:** なし（Sites UI 操作のみ）

- [ ] **Step 1: 現在のWebアプリURLを控える**

GASエディタ → デプロイ → デプロイを管理 → 既存デプロイの「ウェブアプリ URL」をコピー。以降 `<WEBAPP_URL>` と表記。

- [ ] **Step 2: Sites に新規ページを追加**

- https://sites.google.com/search-mania.net/top-training/ を編集モードで開く
- 右サイドバー「ページ」→「＋」→ ページ名「パワーチーム」を入力 → 完了
- 上部ナビにドラッグして配置（他のページと同列に）

- [ ] **Step 3: iframe 埋め込みを追加**

- 「パワーチーム」ページを選択
- 右サイドバー「挿入」→「埋め込み」→「URL」タブ
- URL に `<WEBAPP_URL>?page=view` を貼り付け → 挿入
- 埋め込み枠の右上「編集」→ サイズ「幅100% × 高さ2200px」（縦スクロールは iframe 側で吸収される）

- [ ] **Step 4: 公開**

- 右上「公開」ボタン → 変更を公開

- [ ] **Step 5: 実運用確認**

- ブラウザで https://sites.google.com/search-mania.net/top-training/ を開く
- 上部ナビ「パワーチーム」をクリック → 一覧が表示される
- 「提出する」「編集する」ボタンから submit/edit ページが iframe 内で切り替わる
- スマホでも同様に動作するか確認

- [ ] **Step 6: 使い方案内のテキストを Sites に追加（任意）**

Sites の「パワーチーム」ページの iframe の上に、テキストブロックで簡単な案内を追加：

```
【使い方】
1. 「📄 提出する」でお名前を入力し、p.3・p.4 の写真2枚を撮って送信
2. AIが手書きを読み取ります（約30秒）
3. 誤字があれば修正して「保存する」
4. 内容変更は「✏️ 編集する」からお名前で検索
```

---

## Task 17: ドキュメントと引き継ぎメモ

**目的:** 運用担当者向けの簡易マニュアルと、コード内コメントを整理。

**Files:**
- 作成: `202608BOD/docs/superpowers/plans/2026-07-20-bni-powerteam-operations.md`

- [ ] **Step 1: 運用マニュアル作成**

作成: `C:\Users\endle\.claude\202608BOD\docs\superpowers\plans\2026-07-20-bni-powerteam-operations.md`

```markdown
# BNI パワーチーム機能 運用マニュアル

## URL
- 一覧: <WEBAPP_URL>?page=view
- 提出: <WEBAPP_URL>?page=submit
- 編集: <WEBAPP_URL>?page=edit
- 管理: <WEBAPP_URL>?page=admin
- Sites: https://sites.google.com/search-mania.net/top-training/パワーチーム

## メンバー案内テンプレ（LINE/メール用）
「パワーチームワークショップで書いたシートを、
スマホで写真を撮って以下のURLから送信してください。
AIが自動で書き起こしします。
URL: <SITES_URL>」

## 管理者操作
- パワーチーム名の統一（表記ゆれ）: スプレッドシートのE列を直接編集
- draft を confirmed に昇格: 管理画面から確定ボタン
- 誤提出の削除: 管理画面から削除ボタン（論理削除）
- 復元: 管理画面から復元ボタン

## トラブル対応
- AI書き起こし精度低い: 撮影が暗い/斜めの可能性。再撮影を依頼
- モデル差し替え: powerteam.gs の PT_MODEL_NAME 定数を変更 → push → デプロイ更新
- APIキー再発行: Google AI Studio で新規発行 → GASスクリプトプロパティ GEMINI_API_KEY を更新
- デプロイ更新は必ず「デプロイを管理→編集→新バージョン」。新規デプロイはURL変わって既存カレンダー壊れるので絶対NG

## ログ確認
- GASエディタ「実行数」タブで doPost/doGet の実行状況確認
- エラーは Logger 出力＋GAS のスタックトレースに残る
```

- [ ] **Step 2: コミット**

```powershell
cd C:\Users\endle\.claude\202608BOD
git add docs/superpowers/plans/2026-07-20-bni-powerteam-operations.md
git commit -m "docs(powerteam): add operations manual"
```

- [ ] **Step 3: メモリ更新**

`C:\Users\endle\.claude\projects\C--Users-endle-OneDrive-------\memory\project_bni_powerteam_worksheet.md` の「進捗」セクションを更新：

```markdown
## 進捗
- 2026-07-20: ブレスト完了、設計書コミット
- 2026-07-XX: 実装完了、Sites統合、実運用開始
```

MEMORY.md も同期して更新：

```
- [BNI TOPチャプター パワーチーム ワークシート共有機能](project_bni_powerteam_worksheet.md) — 既存TOPチャプター総合サイト（GAS+Sites）に追加・Gemini 3.5 Flash OCR・実装完了＆Sites統合済（YYYY-MM-DD）
```

---

## 完了の定義（Definition of Done）

- [ ] 全17タスクのチェックボックスが埋まっている
- [ ] E2Eテストシナリオ #1〜#10 が全て通過
- [ ] Google Sites の「パワーチーム」ページから submit/edit/view が動作
- [ ] 既存の `?action=all|events|members` が変わらず動作（非破壊確認）
- [ ] 運用マニュアル作成完了
- [ ] メモリ更新完了

