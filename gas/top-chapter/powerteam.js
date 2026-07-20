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

// ==========================================
// シートセットアップ（Task 5）
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

  // ヘッダー行（日本語ラベル）
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
// 画像2枚を Drive に保存、公開URL返却（Task 6）
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
    var fileId = file.getId();
    urls.push('https://lh3.googleusercontent.com/d/' + fileId + '=w1600');
  }
  return urls;
}

// ==========================================
// Gemini OCR プロンプト（Task 7）
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
      // Gemini構造: candidates[0].content.parts[0].text にJSON文字列
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

// ==========================================
// シート CRUD 内部ヘルパー（Task 8）
// ==========================================
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
    throw new Error('シート「' + PT_SHEET_NAME +
      '」が見つかりません。setupPowerTeamSheet を実行してください。');
  }
  return sheet;
}

// ==========================================
// シート CRUD（Task 8）
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
  return {
    submission_id: submissionId,
    updated_at: Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  };
}

function deletePowerTeamRow_(submissionId) {
  return updatePowerTeamRow_(submissionId, { status: PT_STATUS.DELETED });
}

// ==========================================
// doPost ハンドラ（Task 9）
// ==========================================
function pt_handleSubmit_(body) {
  if (!body.submitter_name) throw new Error('submitter_name is required');
  if (!body.image1_base64 || !body.image2_base64) throw new Error('2 images required');

  // 事前チェック: needsConfirm （既存者への上書き）
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
    ocr = {
      p3_page: { detected: false, raw_text: '' },
      p4_page: { detected: false, raw_text: '' }
    };
    warnings = ['AI書き起こしに失敗しました（' + String(e).substring(0, 200) +
                '）。手入力で完成させてください。'];
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
// HTMLページ返却（Task 9）
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
