/**
 * ==========================================================
 * BNI TOP Chapter - Power Team Worksheet Feature
 * ==========================================================
 * パワーチームワークショップの3種類のワークシート
 * （p.3ターゲット・マーケット / p.4パワーチーム専門分野 / p.5「2つの説明文」）を
 * スマホで撮影→Gemini APIで自動書き起こし→チャプター全員で共有する機能。
 *
 * 関連: docs/superpowers/specs/2026-07-20-bni-powerteam-worksheet-design.md
 */

// ==========================================
// CONFIG
// ==========================================
var PT_SHEET_NAME = 'パワーチーム提出';
var PT_DRIVE_FOLDER_NAME = 'BNI-powerteam-images';

// Geminiモデル（フォールバック順）: 最初のモデルが503等で全リトライ失敗した場合、次のモデルを試行
var PT_MODELS = [
  'gemini-3.5-flash',      // 推奨（2026年5月GA、シャットダウン予定なし）
  'gemini-2.5-flash'       // フォールバック（2026-10-16 シャットダウン予定だがそれまで安定）
];
var PT_GEMINI_ENDPOINT_TMPL =
  'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent';

var PT_STATUS = { DRAFT: 'draft', CONFIRMED: 'confirmed', DELETED: 'deleted' };

// シートのカラム定義（1-indexed、A列=1、全30列 A-AD）
var PT_COL = {
  submission_id: 1,         // A
  submitted_at: 2,          // B
  updated_at: 3,            // C
  submitter_name: 4,        // D
  powerteam_name: 5,        // E
  mission: 6,               // F
  self_specialty: 7,        // G
  target: 8,                // H
  specialty_1: 9,           // I
  specialty_2: 10,          // J
  specialty_3: 11,          // K
  specialty_4: 12,          // L
  specialty_5: 13,          // M
  specialty_6: 14,          // N
  specialty_7: 15,          // O
  additional_specialties: 16, // P
  emotional_why: 17,        // Q
  emotional_joys: 18,       // R
  target_needs: 19,         // S
  target_definition: 20,    // T
  mission_reason: 21,       // U  (新: なぜミッションを大事にしているのか)
  introduction_script: 22,  // V  (新: 紹介スクリプト)
  image_1_url: 23,          // W (画像URL 1）
  image_2_url: 24,          // X (画像URL 2）
  image_3_url: 25,          // Y (画像URL 3、任意)
  p3_raw_text: 26,          // Z
  p4_raw_text: 27,          // AA
  p5_raw_text: 28,          // AB (新)
  status: 29,               // AC
  notes: 30                 // AD
};

var PT_HEADERS = [
  'submission_id', 'submitted_at', 'updated_at', 'submitter_name',
  'powerteam_name', 'mission', 'self_specialty', 'target',
  'specialty_1', 'specialty_2', 'specialty_3', 'specialty_4',
  'specialty_5', 'specialty_6', 'specialty_7', 'additional_specialties',
  'emotional_why', 'emotional_joys', 'target_needs', 'target_definition',
  'mission_reason', 'introduction_script',
  'image_1_url', 'image_2_url', 'image_3_url',
  'p3_raw_text', 'p4_raw_text', 'p5_raw_text',
  'status', 'notes'
];

var PT_HEADERS_JP = [
  '提出ID', '提出日時', '更新日時', '提出者名',
  'パワーチーム名', 'ミッション', 'あなたの専門', 'ターゲット',
  '専門分野1', '専門分野2', '専門分野3', '専門分野4',
  '専門分野5', '専門分野6', '専門分野7', '追加専門分野',
  'なぜこの仕事', '得られる喜び', 'ターゲットのニーズ', '私のターゲット',
  'ミッションの理由', '紹介スクリプト',
  '画像URL 1', '画像URL 2', '画像URL 3',
  'p.3全文', 'p.4全文', 'p.5全文',
  'ステータス', '備考'
];

var PT_COL_WIDTHS = [
  200, 130, 130, 120,      // A-D
  160, 300, 150, 150,      // E-H
  120, 120, 120, 120,      // I-L
  120, 120, 120, 200,      // M-P
  260, 260, 260, 260,      // Q-T
  300, 300,                // U-V (mission_reason, introduction_script)
  200, 200, 200,           // W-Y (image URLs)
  260, 260, 260,           // Z-AB (raw texts)
  100, 200                 // AC-AD
];

// ==========================================
// シートセットアップ
// GASエディタからも、スプレッドシートのメニューからも実行可能
// （getUi() が使えない場合は Logger 出力にフォールバック）
// ==========================================
function _pt_notify(message) {
  Logger.log(message);
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    // UI context がない（GASエディタ直接実行等）→ Logger 出力のみで済ませる
  }
}

function setupPowerTeamSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var existing = ss.getSheetByName(PT_SHEET_NAME);
  if (existing) {
    _pt_notify(
      'シート「' + PT_SHEET_NAME + '」は既に存在します。\n\n' +
      'スキーマ変更後の再作成が必要な場合、まず既存シートを右クリック→削除し、\n' +
      '再度この関数を実行してください。'
    );
    return;
  }
  var sheet = ss.insertSheet(PT_SHEET_NAME);
  sheet.setTabColor('#8B5CF6');

  var hdrRange = sheet.getRange(1, 1, 1, PT_HEADERS.length);
  hdrRange.setValues([PT_HEADERS_JP]);
  hdrRange.setBackground('#8B5CF6')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11);

  var i;
  for (i = 0; i < PT_COL_WIDTHS.length; i++) {
    sheet.setColumnWidth(i + 1, PT_COL_WIDTHS[i]);
  }

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([PT_STATUS.DRAFT, PT_STATUS.CONFIRMED, PT_STATUS.DELETED], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, PT_COL.status, 500, 1).setDataValidation(statusRule);

  sheet.getRange(1, 1, 501, PT_HEADERS.length)
    .setBorder(true, true, true, true, true, true);

  _pt_notify(
    'シート「' + PT_SHEET_NAME + '」を作成しました（全30列 A-AD）。\n\n' +
    '次のステップ:\n' +
    '- Gemini APIキーがスクリプトプロパティに保存されているか確認\n' +
    '- test_callGeminiOCR を実行して動作確認'
  );
}

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
// 画像を Drive に保存、公開URL配列を返却
// images: [{base64, mime}, ...] (任意個数)
// ==========================================
function saveImagesToDrive_(images, submitterName) {
  if (!images || !images.length) {
    throw new Error('images 配列は1要素以上必須');
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
    var fileId = file.getId();
    urls.push('https://lh3.googleusercontent.com/d/' + fileId + '=w1600');
  }
  return urls;
}

// ==========================================
// Gemini OCR プロンプト（3ページ対応）
// ==========================================
var PT_PROMPT_TEXT =
  'あなたは日本語の手書きワークシートを読み取るOCRアシスタントです。\n' +
  '3枚の画像はBNIパワーチームワークショップのワークシートです。\n' +
  '通常、ユーザーは以下の順序で画像をアップロードします（ヒント）：\n' +
  '  画像1 = 「ターゲット・マーケットワークシート」（前半 p.3）\n' +
  '  画像2 = 「パワーチームに必要な専門分野」（前半 p.4）\n' +
  '  画像3 = 「2つの説明文」（後半 p.3）\n' +
  'ただし、ユーザーが順序を間違える場合や、1枚の画像に複数ページが写っている場合もあります。\n' +
  '必ず内容から実際のページを判定してください。\n' +
  '合計で3種類のページ（p.3 / p.4 / p.5）を全て検出・抽出してください。\n\n' +
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
  '- powerteam_name: パワーチーム名欄。取り消し線がある場合は最終案（残された方）を採用。空欄なら空文字\n' +
  '- self_specialty: 「あなた」の赤い円内のテキスト\n' +
  '- target: 「ターゲット」の赤い円内のテキスト\n' +
  '- specialty_1〜7: 「専門分野1」〜「専門分野7」の各円内のテキスト（空欄なら空文字）\n' +
  '- additional_specialties: 円の外側に書かれた項目の配列\n' +
  '  例: ["マーケター","デザイナー","ポスティング"]\n\n' +
  '■ p.5「2つの説明文」の識別特徴\n' +
  '- タイトルに「2つの説明文」\n' +
  '- ■なぜ私はこのミッションを大事にしているのか？（このミッションの理由）\n' +
  '- ■メンバーがビジター候補者へあなたを紹介するスクリプト\n' +
  '- 主に横罫線上に手書きテキスト\n\n' +
  '【抽出項目】\n' +
  '- mission_reason: 「なぜ私はこのミッションを大事にしているのか？」の回答全文\n' +
  '- introduction_script: 「メンバーがビジター候補者へあなたを紹介するスクリプト」の回答全文\n\n' +
  '■ 共通ルール\n' +
  '1. 手書き原文のまま忠実に書き起こす。要約・解釈・整形は禁止\n' +
  '2. 読めない文字は「?」で置き換え、warnings 配列に「〇〇の一部が読めません」を追加\n' +
  '3. 取り消し線・二重線の文字は除外、代替として書かれた文字を採用\n' +
  '4. 各ページの raw_text にはそのページ全体の書き起こし全文を\n' +
  '   レイアウト無視で上→下・左→右の順で1つの文字列に\n' +
  '5. 該当ページが見つからなければ detected: false、warnings に理由を記述\n' +
  '6. 複数の画像が同じページと判定された場合、より鮮明な方を優先し\n' +
  '   warnings に「同じページの可能性: p.X」を記述\n' +
  '7. ページ枠外の走り書き・メモは無視して良い';

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
    p5_page: {
      type: 'object',
      properties: {
        detected: { type: 'boolean' },
        mission_reason: { type: 'string' },
        introduction_script: { type: 'string' },
        raw_text: { type: 'string' }
      },
      required: ['detected', 'raw_text']
    },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['p3_page', 'p4_page', 'p5_page', 'warnings']
};

// ==========================================
// Gemini API 呼び出し（複数画像を1回で処理）
// images: [{base64, mime}, ...] (任意個数、通常3枚)
// モデルフォールバック: PT_MODELS の順に試行、全ダメなら例外
// ==========================================
function callGeminiOCR_(images) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY がスクリプトプロパティに設定されていません');
  }
  if (!images || !images.length) {
    throw new Error('images 配列は1要素以上必須');
  }

  var parts = [{ text: PT_PROMPT_TEXT }];
  var i;
  for (i = 0; i < images.length; i++) {
    parts.push({ inline_data: { mime_type: images[i].mime, data: images[i].base64 }});
  }

  var payload = {
    contents: [{ parts: parts }],
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

  // モデルフォールバックループ
  var lastError = null;
  var m;
  for (m = 0; m < PT_MODELS.length; m++) {
    var modelName = PT_MODELS[m];
    var endpoint = PT_GEMINI_ENDPOINT_TMPL.replace('{MODEL}', modelName);
    Logger.log('Gemini: trying model ' + modelName);

    var result = _pt_callGeminiSingleModel(endpoint, options, modelName);
    if (result.ok) {
      Logger.log('Gemini: success with model ' + modelName);
      return result.data;
    }
    lastError = result.error;
    Logger.log('Gemini: model ' + modelName + ' failed, ' +
      (m < PT_MODELS.length - 1 ? 'trying next model' : 'no more fallbacks'));
  }
  throw lastError || new Error('All Gemini models failed');
}

// 単一モデルで最大5回リトライ（指数バックオフ）
// 戻り値: {ok: true, data: parsed} または {ok: false, error: Error}
function _pt_callGeminiSingleModel(endpoint, options, modelLabel) {
  var lastError = null;
  var maxAttempts = 5;
  var attempt;
  for (attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      var waitMs = Math.pow(2, attempt) * 1000;
      Logger.log('[' + modelLabel + '] retry attempt ' + (attempt + 1) + ' after ' + waitMs + 'ms wait');
      Utilities.sleep(waitMs);
    }
    try {
      var res = UrlFetchApp.fetch(endpoint, options);
      var code = res.getResponseCode();
      var body = res.getContentText();
      if (code === 200) {
        var wrapped = JSON.parse(body);
        var jsonText = wrapped.candidates &&
                       wrapped.candidates[0] &&
                       wrapped.candidates[0].content &&
                       wrapped.candidates[0].content.parts &&
                       wrapped.candidates[0].content.parts[0] &&
                       wrapped.candidates[0].content.parts[0].text;
        if (!jsonText) {
          lastError = new Error('[' + modelLabel + '] response に text がない: ' + body.substring(0, 500));
          continue;
        }
        return { ok: true, data: JSON.parse(jsonText) };
      }
      var retryable = (code === 429 || code === 500 || code === 502 || code === 503 || code === 504);
      lastError = new Error('[' + modelLabel + '] HTTP ' + code + ': ' + body.substring(0, 500));
      if (!retryable) {
        Logger.log('[' + modelLabel + '] non-retryable error, aborting: HTTP ' + code);
        break;
      }
      Logger.log('[' + modelLabel + '] retryable HTTP ' + code + ', will retry');
    } catch (e) {
      lastError = e;
      Logger.log('[' + modelLabel + '] attempt ' + (attempt + 1) + ' threw: ' + e);
    }
  }
  return { ok: false, error: lastError };
}

// ==========================================
// シート CRUD 内部ヘルパー
// ==========================================
function _pt_rowToObject(row) {
  var obj = {};
  var i;
  for (i = 0; i < PT_HEADERS.length; i++) {
    obj[PT_HEADERS[i]] = _pt_normalizeCell(row[i]);
  }
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
    throw new Error('シート「' + PT_SHEET_NAME +
      '」が見つかりません。setupPowerTeamSheet を実行してください。');
  }
  return sheet;
}

// ==========================================
// シート CRUD
// ==========================================
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
      obj._rowIndex = i + 2;
      return obj;
    }
  }
  return null;
}

// 全書き込み可能フィールドのリスト
var PT_WRITABLE_FIELDS = [
  'submitter_name', 'powerteam_name', 'mission', 'self_specialty', 'target',
  'specialty_1', 'specialty_2', 'specialty_3', 'specialty_4',
  'specialty_5', 'specialty_6', 'specialty_7', 'additional_specialties',
  'emotional_why', 'emotional_joys', 'target_needs', 'target_definition',
  'mission_reason', 'introduction_script',
  'image_1_url', 'image_2_url', 'image_3_url',
  'p3_raw_text', 'p4_raw_text', 'p5_raw_text',
  'notes'
];

function savePowerTeamRow_(fields) {
  if (!fields.submitter_name) throw new Error('submitter_name が必須');
  var sheet = _pt_getSheet();
  var now = new Date();

  var existing = getPowerTeamOne_(fields.submitter_name);
  if (existing) {
    return updatePowerTeamRow_(existing.submission_id, fields);
  }

  var row = new Array(PT_HEADERS.length).fill('');
  row[PT_COL.submission_id - 1] = Utilities.getUuid();
  row[PT_COL.submitted_at - 1] = now;
  row[PT_COL.updated_at - 1] = now;
  row[PT_COL.status - 1] = fields.status || PT_STATUS.DRAFT;

  var i;
  for (i = 0; i < PT_WRITABLE_FIELDS.length; i++) {
    var key = PT_WRITABLE_FIELDS[i];
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

  // status は writable にはあるが、undefined 時は上書きしない
  var updatableWithStatus = PT_WRITABLE_FIELDS.concat(['status']);
  for (i = 0; i < updatableWithStatus.length; i++) {
    var key = updatableWithStatus[i];
    var val = fields[key];
    if (val === undefined) continue;
    if (key === 'additional_specialties' && Array.isArray(val)) {
      val = val.join(', ');
    }
    if (val === null) val = '';
    sheet.getRange(rowIndex, PT_COL[key]).setValue(val);
  }
  return {
    submission_id: submissionId,
    updated_at: Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  };
}

function deletePowerTeamRow_(submissionId) {
  return updatePowerTeamRow_(submissionId, { status: PT_STATUS.DELETED });
}

// ==========================================
// doPost ハンドラ
// ==========================================
function pt_handleSubmit_(body) {
  if (!body.submitter_name) throw new Error('submitter_name is required');
  if (!body.image1_base64 || !body.image2_base64 || !body.image3_base64) {
    throw new Error('3 images required (image1: p.3 ターゲットマーケット, ' +
      'image2: p.4 パワーチーム専門, image3: p.5 2つの説明文)');
  }

  if (!body.confirm_overwrite) {
    var existing = getPowerTeamOne_(body.submitter_name);
    if (existing) {
      return {
        needsConfirm: true,
        message: body.submitter_name + 'さんの提出は既にあります。上書きしますか？'
      };
    }
  }

  var images = [
    { base64: body.image1_base64, mime: body.image1_mime || 'image/jpeg' },
    { base64: body.image2_base64, mime: body.image2_mime || 'image/jpeg' },
    { base64: body.image3_base64, mime: body.image3_mime || 'image/jpeg' }
  ];

  var urls = saveImagesToDrive_(images, body.submitter_name);

  var ocr;
  var warnings = [];
  try {
    ocr = callGeminiOCR_(images);
    warnings = ocr.warnings || [];
  } catch (e) {
    ocr = {
      p3_page: { detected: false, raw_text: '' },
      p4_page: { detected: false, raw_text: '' },
      p5_page: { detected: false, raw_text: '' }
    };
    warnings = ['AI書き起こしに失敗しました（' + String(e).substring(0, 200) +
                '）。手入力で完成させてください。'];
  }

  var p3 = ocr.p3_page || {};
  var p4 = ocr.p4_page || {};
  var p5 = ocr.p5_page || {};

  var fields = {
    submitter_name: body.submitter_name,
    powerteam_name: p4.powerteam_name || '',
    mission: p4.mission || '',
    self_specialty: p4.self_specialty || '',
    target: p4.target || '',
    specialty_1: p4.specialty_1 || '',
    specialty_2: p4.specialty_2 || '',
    specialty_3: p4.specialty_3 || '',
    specialty_4: p4.specialty_4 || '',
    specialty_5: p4.specialty_5 || '',
    specialty_6: p4.specialty_6 || '',
    specialty_7: p4.specialty_7 || '',
    additional_specialties: p4.additional_specialties || [],
    emotional_why: p3.emotional_why || '',
    emotional_joys: p3.emotional_joys || '',
    target_needs: p3.target_needs || '',
    target_definition: p3.target_definition || '',
    mission_reason: p5.mission_reason || '',
    introduction_script: p5.introduction_script || '',
    image_1_url: urls[0] || '',
    image_2_url: urls[1] || '',
    image_3_url: urls[2] || '',
    p3_raw_text: p3.raw_text || '',
    p4_raw_text: p4.raw_text || '',
    p5_raw_text: p5.raw_text || '',
    status: PT_STATUS.DRAFT
  };

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

// include も template として評価（PT_WEBAPP_URL 等の scriptlet を処理するため）
function pt_include_(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

// ==========================================
// google.script.run から呼ぶ API ラッパー
// クライアントJS から fetch は cross-origin で使えないため、
// google.script.run 経由でこれらのラッパーを呼び出す
// ==========================================
function pt_api_getConfirmedAll() {
  return getPowerTeamAll_(false);
}

function pt_api_getAllWithDraft() {
  return getPowerTeamAll_(true);
}

function pt_api_getOne(name) {
  return getPowerTeamOne_(name);
}

function pt_api_submit(body) {
  return pt_handleSubmit_(body);
}

function pt_api_update(body) {
  return pt_handleUpdate_(body);
}

function pt_api_delete(body) {
  return pt_handleDelete_(body);
}

// Webapp の公開 URL（テンプレートから呼ぶ）
function pt_getWebappUrl() {
  return ScriptApp.getService().getUrl();
}
