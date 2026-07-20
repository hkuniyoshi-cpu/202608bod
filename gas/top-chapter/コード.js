/**
 * ==========================================================
 *  BNI TOP Chapter - Google Apps Script API v2
 *  Spreadsheet Data API for Web Page
 * ==========================================================
 *
 * セットアップ手順:
 * 1. 対象スプレッドシートの「拡張機能」->「Apps Script」を開く
 * 2. このコードを全て貼り付けて保存（Ctrl+S）
 * 3. SPREADSHEET_ID を自分のIDに変更
 * 4. 上部ドロップダウンで「setupSpreadsheet」を選択 -> 実行
 * 5. 「デプロイ」->「新しいデプロイ」->「ウェブアプリ」
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 * 6. 表示されたURLをHTMLの GAS_API_URL に貼り付け
 */

// ==========================================
// CONFIG
// ==========================================
var SPREADSHEET_ID = '1JXRUNTMrAlueXKknv0b8-ofMJTnPBeUdg9CjX4Mp1Bc';

var SHEET_NAMES = {
  special:  '特別イベント',
  training: 'トレーニング',
  lunch:    'ランチ会',
  one2many: '1toMany',
  coffee:   'コーヒーMTG勉強会',
  members:  'TOPメンバーリスト'
};

// 業種カテゴリー: 日本語 -> 英語コード 変換マップ
// E列は日本語でプルダウン入力 -> GASが英語コードに変換してWebへ送信
var INDUSTRY_JP_TO_CODE = {
  '不動産・建築':        'realestate',
  '美容・健康':          'beauty',
  '士業・専門家':        'professional',
  '金融・コンサル':      'consulting',
  '飲食・グルメ':        'food',
  '広告・IT・メディア':  'media',
  'イベント・その他':    'event',
  '建設・設備':          'construction'
};

// 英語コード -> 日本語 逆引きマップ
var INDUSTRY_CODE_TO_JP = {
  'realestate':   '不動産・建築',
  'beauty':       '美容・健康',
  'professional': '士業・専門家',
  'consulting':   '金融・コンサル',
  'food':         '飲食・グルメ',
  'media':        '広告・IT・メディア',
  'event':        'イベント・その他',
  'construction': '建設・設備'
};

// 時間プルダウン用リスト（06:00〜23:30 を30分刻み）
var TIME_OPTIONS = (function() {
  var times = [];
  var h, hh;
  for (h = 6; h <= 23; h++) {
    hh = (h < 10) ? ('0' + h) : String(h);
    times.push(hh + ':00');
    if (h < 23) {
      times.push(hh + ':30');
    }
  }
  times.push('23:30');
  return times;
}());

// ==========================================
// API エントリーポイント
// ==========================================
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'all';
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

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// イベントデータ取得（全カテゴリー統合）
// ==========================================
/*
  シート別カラム定義

  特別イベント / トレーニング / 1toMany
    A: 日付  B: イベント名  C: 開始時間  D: 終了時間  E: リンクURL  F: メモ

  ランチ会
    A: 日付  B: イベント名  C: 開始時間  D: 終了時間
    E: 場所  F: リンクURL  G: メモ

  コーヒーMTG勉強会
    A: 日付  B: タイトル/テーマ  C: 開始時間  D: 終了時間
    E: 場所・URL  F: 開催形式  G: リンクURL  H: メモ
*/
function getAllEvents() {
  var allEvents = [];
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet, rows, i, row;

  // -- 標準イベント（特別イベント・トレーニング・1toMany）--
  var standardCats = ['special', 'training', 'one2many'];
  var sci;
  for (sci = 0; sci < standardCats.length; sci++) {
    var cat = standardCats[sci];
    try {
      sheet = ss.getSheetByName(SHEET_NAMES[cat]);
      if (!sheet) { continue; }
      rows = sheet.getDataRange().getValues();
      for (i = 1; i < rows.length; i++) {
        row = rows[i];
        if (!row[0] || !row[1]) { continue; }
        allEvents.push({
          date:      toDateStr(row[0]),
          name:      toStr(row[1]),
          timeStart: toTimeStr(row[2]),
          timeEnd:   toTimeStr(row[3]),
          link:      toStr(row[4]),
          memo:      toStr(row[5]),
          location:  '',
          format:    '',
          category:  cat
        });
      }
    } catch (err) {
      Logger.log('Error ' + cat + ': ' + err);
    }
  }

  // -- ランチ会（場所あり）--
  try {
    sheet = ss.getSheetByName(SHEET_NAMES.lunch);
    if (sheet) {
      rows = sheet.getDataRange().getValues();
      for (i = 1; i < rows.length; i++) {
        row = rows[i];
        if (!row[0] || !row[1]) { continue; }
        allEvents.push({
          date:      toDateStr(row[0]),
          name:      toStr(row[1]),
          timeStart: toTimeStr(row[2]),
          timeEnd:   toTimeStr(row[3]),
          location:  toStr(row[4]),
          link:      toStr(row[5]),
          memo:      toStr(row[6]),
          format:    '',
          category:  'lunch'
        });
      }
    }
  } catch (err) {
    Logger.log('Error lunch: ' + err);
  }

  // -- コーヒーMTG勉強会（場所＋開催形式あり）--
  try {
    sheet = ss.getSheetByName(SHEET_NAMES.coffee);
    if (sheet) {
      rows = sheet.getDataRange().getValues();
      for (i = 1; i < rows.length; i++) {
        row = rows[i];
        if (!row[0] || !row[1]) { continue; }
        allEvents.push({
          date:      toDateStr(row[0]),
          name:      toStr(row[1]),
          timeStart: toTimeStr(row[2]),
          timeEnd:   toTimeStr(row[3]),
          location:  toStr(row[4]),
          format:    toStr(row[5]),
          link:      toStr(row[6]),
          memo:      toStr(row[7]),
          category:  'coffee'
        });
      }
    }
  } catch (err) {
    Logger.log('Error coffee: ' + err);
  }

  // 日付順ソート
  allEvents.sort(function(a, b) {
    if (a.date < b.date) { return -1; }
    if (a.date > b.date) { return 1; }
    return 0;
  });
  return allEvents;
}

// ==========================================
// メンバーデータ取得
// ==========================================
function getMembers() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAMES.members);
    if (!sheet) { return []; }
    var rows = sheet.getDataRange().getValues();
    var members = [];
    var i, row, industryLabel, industryCode;
    for (i = 1; i < rows.length; i++) {
      row = rows[i];
      if (!row[0]) { continue; }
      // E列: 日本語ラベル -> 英語コードに変換
      industryLabel = toStr(row[4]);
      industryCode  = INDUSTRY_JP_TO_CODE[industryLabel] || industryLabel;
      members.push({
        name:     toStr(row[0]),
        kana:     toStr(row[1]),
        company:  toStr(row[2]),
        category: toStr(row[3]),
        industry: industryCode,
        role:     toStr(row[5]),
        strength: toStr(row[6]),
        comment:  toStr(row[7]),
        referral: toStr(row[8]),
        image:    toStr(row[9]),
        phone:    toStr(row[10]),
        sns:      toStr(row[11])
      });
    }
    return members;
  } catch (err) {
    Logger.log('Error members: ' + err);
    return [];
  }
}

// ==========================================
// ユーティリティ
// ==========================================
function toStr(v) {
  if (v === null || v === undefined) { return ''; }
  return String(v).trim();
}

function toDateStr(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return toStr(v);
}

// 時間専用変換: スプレッドシートの時間型(Date)を "HH:MM" 文字列に変換
function toTimeStr(v) {
  if (!v && v !== 0) { return ''; }
  // Date型（スプレッドシートのTIME型はDateとして渡される）
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'HH:mm');
  }
  var s = String(v).trim();
  if (!s || s === '0') { return ''; }
  // "HH:MM" 形式
  if (/^[0-9]{1,2}:[0-9]{2}$/.test(s)) { return s; }
  // "HH:MM:SS" 形式 -> HH:MM に切り詰め
  var m = s.match(/^([0-9]{1,2}):([0-9]{2}):[0-9]{2}/);
  if (m) { return m[1] + ':' + m[2]; }
  return '';
}

// ==========================================
// セットアップ（初回1回だけ実行）
// ==========================================
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result, i;

  // -- 1. 標準イベントシート --
  var STANDARD_HEADERS = ['日付', 'イベント名', '開始時間', '終了時間', 'リンクURL', 'メモ・備考'];
  var STANDARD_WIDTHS  = [120, 220, 110, 110, 260, 200];
  var standardDefs = [
    { name: '特別イベント', color: '#F59E0B' },
    { name: 'トレーニング', color: '#0EA5E9' },
    { name: '1toMany',      color: '#8B5CF6' }
  ];
  for (i = 0; i < standardDefs.length; i++) {
    result = getOrCreateSheet(ss, standardDefs[i].name, standardDefs[i].color);
    if (result.isNew) {
      setupEventSheet(result.sheet, STANDARD_HEADERS, STANDARD_WIDTHS, standardDefs[i].color);
      addTimePulldown(result.sheet, 'C2:C200');
      addTimePulldown(result.sheet, 'D2:D200');
      addDateValidation(result.sheet, 'A2:A200');
      addSampleRow(result.sheet, standardDefs[i].name);
    }
  }

  // -- 2. ランチ会 --
  var LUNCH_HEADERS = ['日付', 'イベント名', '開始時間', '終了時間', '場所', 'リンクURL', 'メモ・備考'];
  var LUNCH_WIDTHS  = [120, 220, 110, 110, 200, 260, 180];
  result = getOrCreateSheet(ss, 'ランチ会', '#10B981');
  if (result.isNew) {
    setupEventSheet(result.sheet, LUNCH_HEADERS, LUNCH_WIDTHS, '#10B981');
    addTimePulldown(result.sheet, 'C2:C200');
    addTimePulldown(result.sheet, 'D2:D200');
    addDateValidation(result.sheet, 'A2:A200');
    addSampleRow(result.sheet, 'ランチ会');
  }

  // -- 3. コーヒーMTG勉強会 --
  var COFFEE_HEADERS = ['日付', 'タイトル/テーマ', '開始時間', '終了時間', '場所・URL', '開催形式', 'リンクURL', 'メモ・備考'];
  var COFFEE_WIDTHS  = [120, 220, 110, 110, 220, 110, 240, 180];
  result = getOrCreateSheet(ss, 'コーヒーMTG勉強会', '#06B6D4');
  if (result.isNew) {
    setupEventSheet(result.sheet, COFFEE_HEADERS, COFFEE_WIDTHS, '#06B6D4');
    addTimePulldown(result.sheet, 'C2:C200');
    addTimePulldown(result.sheet, 'D2:D200');
    addDateValidation(result.sheet, 'A2:A200');
    var formatRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['オンライン', '対面', 'ハイブリッド'], true)
      .setAllowInvalid(false)
      .build();
    result.sheet.getRange('F2:F200').setDataValidation(formatRule);
    addSampleRow(result.sheet, 'コーヒーMTG勉強会');
  }

  // -- 4. TOPメンバーリスト --
  var MEMBER_HEADERS = [
    '名前', 'フリガナ', '会社名', '業種・カテゴリー名（表示用）', '業種カテゴリー',
    '役職', '強み', '紹介コメント（こんな人です）', 'ベストリファーラル', '写真URL',
    '電話番号', 'SNS URL'
  ];
  var MEMBER_WIDTHS = [120, 130, 200, 190, 150, 180, 300, 300, 300, 280, 130, 200];
  var INDUSTRY_LABELS = [
    '不動産・建築', '美容・健康', '士業・専門家', '金融・コンサル',
    '飲食・グルメ', '広告・IT・メディア', 'イベント・その他', '建設・設備'
  ];
  result = getOrCreateSheet(ss, 'TOPメンバーリスト', '#64748B');
  if (result.isNew) {
    var mHdr = result.sheet.getRange(1, 1, 1, MEMBER_HEADERS.length);
    mHdr.setValues([MEMBER_HEADERS]);
    mHdr.setBackground('#1E3040').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);
    for (i = 0; i < MEMBER_WIDTHS.length; i++) {
      result.sheet.setColumnWidth(i + 1, MEMBER_WIDTHS[i]);
    }
    result.sheet.setFrozenRows(1);
    result.sheet.setFrozenColumns(1);
    var industryRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(INDUSTRY_LABELS, true)
      .setAllowInvalid(false)
      .build();
    result.sheet.getRange('E2:E500').setDataValidation(industryRule);
    result.sheet.getRange(1, 1, 501, MEMBER_HEADERS.length).setBorder(true, true, true, true, true, true);
  }

  // -- 5. 使い方ガイド --
  result = getOrCreateSheet(ss, '使い方ガイド', '#334155');
  if (result.isNew) {
    buildGuideSheet(result.sheet);
  }

  SpreadsheetApp.getUi().alert(
    'セットアップ完了！\n\n' +
    '作成・確認されたシート:\n' +
    '  特別イベント\n' +
    '  トレーニング\n' +
    '  ランチ会（場所列あり）\n' +
    '  1toMany\n' +
    '  コーヒーMTG勉強会（場所・開催形式列あり）\n' +
    '  TOPメンバーリスト\n' +
    '  使い方ガイド\n\n' +
    '時間列（C/D列）: プルダウンで06:00〜23:30選択可\n' +
    '業種カテゴリー（E列）: 日本語でプルダウン選択可\n\n' +
    '次のステップ:\n' +
    '「デプロイ」->「新しいデプロイ」-> ウェブアプリとして公開'
  );
}

// ==========================================
// シート共通セットアップ
// ==========================================
function setupEventSheet(sheet, headers, widths, color) {
  sheet.setTabColor(color);
  var hdr = sheet.getRange(1, 1, 1, headers.length);
  hdr.setValues([headers]);
  hdr.setBackground(color).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);
  var i;
  for (i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 201, headers.length).setBorder(true, true, true, true, true, true);
  sheet.getRange(2, 1, 200, headers.length).setFontSize(10);
}

function addTimePulldown(sheet, range) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(TIME_OPTIONS, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(range).setDataValidation(rule);
}

function addDateValidation(sheet, range) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .build();
  sheet.getRange(range).setDataValidation(rule);
}

function addSampleRow(sheet, sheetName) {
  sheet.getRange(2, 1).setValue(new Date());
  sheet.getRange(2, 2).setValue('サンプル行（削除してOK）');
  sheet.getRange(2, 3).setValue('14:00');
  sheet.getRange(2, 4).setValue('17:00');
  if (sheetName === 'ランチ会') {
    sheet.getRange(2, 5).setValue('--レストラン 那覇市--');
    sheet.getRange(2, 6).setValue('https://example.com');
    sheet.getRange(2, 7).setValue('参考にして入力してください（この行は削除してOK）');
  } else if (sheetName === 'コーヒーMTG勉強会') {
    sheet.getRange(2, 5).setValue('Zoom ID: 929 1040 8810');
    sheet.getRange(2, 6).setValue('オンライン');
    sheet.getRange(2, 7).setValue('https://example.com');
    sheet.getRange(2, 8).setValue('参考にして入力してください（この行は削除してOK）');
  } else {
    sheet.getRange(2, 5).setValue('https://example.com');
    sheet.getRange(2, 6).setValue('参考にして入力してください（この行は削除してOK）');
  }
}

function getOrCreateSheet(ss, name, color) {
  var sheet = ss.getSheetByName(name);
  var isNew = !sheet;
  if (isNew) {
    sheet = ss.insertSheet(name);
    sheet.setTabColor(color);
  }
  return { sheet: sheet, isNew: isNew };
}

// ==========================================
// 使い方ガイドシート作成
// ==========================================
function buildGuideSheet(sheet) {
  var data = [
    ['BNI TOPチャプター スプレッドシート入力ガイド v2', '', ''],
    ['', '', ''],
    ['共通: 特別イベント / トレーニング / 1toMany', '', ''],
    ['列', '項目名', '入力方法'],
    ['A', '日付', 'カレンダーから選択（クリックで日付ピッカーが開きます）'],
    ['B', 'イベント名', 'テキスト入力　例: マインドセットトレーニング'],
    ['C', '開始時間', 'プルダウンから選択（06:00〜23:30 / 30分刻み）'],
    ['D', '終了時間', 'プルダウンから選択（同上）'],
    ['E', 'リンクURL', '申込先URLを貼り付け（なければ空欄でOK）'],
    ['F', 'メモ・備考', '任意　例: ZOOM開催、定員20名 など'],
    ['', '', ''],
    ['ランチ会（場所列あり）', '', ''],
    ['列', '項目名', '入力方法'],
    ['A', '日付', 'カレンダーから選択'],
    ['B', 'イベント名', 'テキスト入力'],
    ['C', '開始時間', 'プルダウンから選択'],
    ['D', '終了時間', 'プルダウンから選択'],
    ['E', '場所', '場所名・住所を入力　例: --レストラン 那覇市--'],
    ['F', 'リンクURL', '申込先URL（任意）'],
    ['G', 'メモ・備考', '任意'],
    ['', '', ''],
    ['コーヒーMTG勉強会（場所＋開催形式あり）', '', ''],
    ['列', '項目名', '入力方法'],
    ['A', '日付', 'カレンダーから選択'],
    ['B', 'タイトル/テーマ', 'テキスト入力　例: マーケティング勉強会'],
    ['C', '開始時間', 'プルダウンから選択'],
    ['D', '終了時間', 'プルダウンから選択'],
    ['E', '場所・URL', '対面の場合は場所名 / オンラインはZoom URLや「Zoom ID: --」'],
    ['F', '開催形式', 'プルダウンから選択: オンライン / 対面 / ハイブリッド'],
    ['G', 'リンクURL', '申込先URL（任意）'],
    ['H', 'メモ・備考', '任意'],
    ['', '', ''],
    ['業種カテゴリー一覧（TOPメンバーリストのE列でプルダウン選択）', '', ''],
    ['プルダウン選択肢（日本語）', '内部コード（自動変換）', '対象業種例'],
    ['不動産・建築', 'realestate', '不動産売買、オフィス内装、空調、リフォームなど'],
    ['美容・健康', 'beauty', '鍼灸、エステ、脱毛、パーソナルトレーニングなど'],
    ['士業・専門家', 'professional', '弁護士、行政書士、司法書士、社労士、税理士など'],
    ['金融・コンサル', 'consulting', '保険、FP、経営コンサル、助成金など'],
    ['飲食・グルメ', 'food', '飲食店、食品製造、バー、カフェなど'],
    ['広告・IT・メディア', 'media', 'WEB制作、広告、SNS、映像、システムなど'],
    ['イベント・その他', 'event', 'イベント企画、観光、占い、デコレーターなど'],
    ['建設・設備', 'construction', '太陽光、建設求人など'],
    ['', '', ''],
    ['注意事項', '', ''],
    ['・', '1行目のヘッダーは削除・編集しないでください', ''],
    ['・', '空行は自動的にスキップされます', ''],
    ['・', '時間はプルダウン以外に手入力も可能です（例: 13:15）', ''],
    ['・', 'Webページはリロードすると最新データが反映されます', ''],
    ['・', '写真URLはGoogleドライブの場合「共有->リンクを知っている全員が閲覧可」に設定してください', '']
  ];

  sheet.getRange(1, 1, data.length, 3).setValues(data);

  var titleRange = sheet.getRange(1, 1, 1, 3);
  titleRange.merge();
  titleRange.setBackground('#0F1923').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13);

  var sectionRows = [3, 12, 21, 32, 43];
  var sri, sr;
  for (sri = 0; sri < sectionRows.length; sri++) {
    sr = sheet.getRange(sectionRows[sri], 1, 1, 3);
    sr.merge();
    sr.setBackground('#1E3040').setFontColor('#FFFFFF').setFontWeight('bold');
  }

  var subHeaderRows = [4, 13, 22, 33];
  var shri;
  for (shri = 0; shri < subHeaderRows.length; shri++) {
    sheet.getRange(subHeaderRows[shri], 1, 1, 3).setBackground('#E2E8F0').setFontWeight('bold');
  }

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 230);
  sheet.setColumnWidth(3, 350);
  sheet.setFrozenRows(1);
}

// ==========================================
// メニュー追加
// ==========================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BNI TOPツール')
    .addItem('シートをセットアップ（初回のみ）', 'setupSpreadsheet')
    .addItem('データをプレビュー', 'previewData')
    .addItem('時間プルダウンを再設定', 'resetTimePulldowns')
    .addItem('業種カテゴリーのプルダウンを再設定', 'resetIndustryPulldown')
    .addItem('写真URLを一括変換（J列）', 'convertAllPhotoUrls')
    .addToUi();
}

// ==========================================
// データプレビュー（動作確認）
// ==========================================
function previewData() {
  var events  = getAllEvents();
  var members = getMembers();
  var cats = {};
  var i, ev, k, lines, catStr, msg, limit, loc, fmt;

  for (i = 0; i < events.length; i++) {
    ev = events[i];
    cats[ev.category] = (cats[ev.category] || 0) + 1;
  }
  lines = [];
  for (k in cats) {
    lines.push('  ' + k + ': ' + cats[k] + '件');
  }
  catStr = lines.join('\n');

  msg = 'データ確認\n\n' +
    'イベント合計: ' + events.length + '件\n' + catStr + '\n\n' +
    'メンバー合計: ' + members.length + '名\n\n' +
    '直近イベント（最大5件）:\n';

  limit = Math.min(5, events.length);
  for (i = 0; i < limit; i++) {
    ev = events[i];
    loc = ev.location ? ' @ ' + ev.location : '';
    fmt = ev.format ? ' (' + ev.format + ')' : '';
    msg += ev.date + ' [' + ev.category + '] ' + ev.name + loc + fmt + '\n';
  }

  SpreadsheetApp.getUi().alert(msg);
}

// ==========================================
// 時間プルダウン再設定
// ==========================================
function resetTimePulldowns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = [
    SHEET_NAMES.special, SHEET_NAMES.training, SHEET_NAMES.lunch,
    SHEET_NAMES.one2many, SHEET_NAMES.coffee
  ];
  var count = 0;
  var i, sheet;
  for (i = 0; i < sheetNames.length; i++) {
    sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) { continue; }
    addTimePulldown(sheet, 'C2:C200');
    addTimePulldown(sheet, 'D2:D200');
    count++;
  }
  SpreadsheetApp.getUi().alert(
    '時間プルダウンを ' + count + ' シートに再設定しました。\n' +
    'C列（開始時間）D列（終了時間）に\n' +
    '06:00〜23:30（30分刻み）のプルダウンが設定されています。'
  );
}

// ==========================================
// 業種カテゴリープルダウン再設定
// ==========================================
function resetIndustryPulldown() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.members);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('TOPメンバーリストシートが見つかりません。');
    return;
  }
  var INDUSTRY_LABELS = [
    '不動産・建築', '美容・健康', '士業・専門家', '金融・コンサル',
    '飲食・グルメ', '広告・IT・メディア', 'イベント・その他', '建設・設備'
  ];
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(INDUSTRY_LABELS, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange('E2:E500').setDataValidation(rule);
  sheet.getRange('E1').setValue('業種カテゴリー');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('業種カテゴリーのプルダウンを日本語に再設定しました。');
    return;
  }
  var dataRange = sheet.getRange(2, 5, lastRow - 1, 1);
  var values = dataRange.getValues();
  var newValues = [];
  var converted = 0;
  var i, v, jpLabel;
  for (i = 0; i < values.length; i++) {
    v = values[i][0];
    jpLabel = INDUSTRY_CODE_TO_JP[v];
    if (jpLabel) {
      newValues.push([jpLabel]);
      converted++;
    } else {
      newValues.push([v]);
    }
  }
  dataRange.setValues(newValues);

  SpreadsheetApp.getUi().alert(
    '業種カテゴリーのプルダウンを日本語に再設定しました。\n\n' +
    '英語コードを日本語に変換: ' + converted + '件\n\n' +
    'E列でプルダウンから日本語で選択できます。\n' +
    '例: realestate -> 不動産・建築'
  );
}

// ==========================================
// onEdit: J列に貼ったGoogle Drive共有URLを自動変換
// ==========================================
function onEdit(e) {
  var sheet = e.range.getSheet();
  // TOPメンバーリストシートのみ対象
  if (sheet.getName() !== SHEET_NAMES.members) { return; }
  // J列（10列目）のみ対象
  if (e.range.getColumn() !== 10) { return; }
  // ヘッダー行は除外
  if (e.range.getRow() < 2) { return; }

  var val = e.range.getValue();
  if (!val) { return; }

  var converted = convertDriveUrl(String(val).trim());
  if (converted && converted !== String(val).trim()) {
    e.range.setValue(converted);
  }
}

// ==========================================
// Google Drive URL を直接表示URLに変換
// 対応形式:
//   https://drive.google.com/file/d/FILE_ID/view...
//   https://drive.google.com/open?id=FILE_ID
//   https://docs.google.com/uc?id=FILE_ID
//   https://drive.google.com/uc?export=view&id=FILE_ID (変換済み -> そのまま)
// ==========================================
function convertDriveUrl(url) {
  if (!url) { return url; }

  // すでに変換済み（thumbnail形式）ならそのまま返す
  if (url.indexOf('lh3.googleusercontent.com/d/') !== -1) {
    return url;
  }
  // 旧形式(uc?export=view)も新形式に変換し直す
  var oldMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (url.indexOf('drive.google.com/uc') !== -1 && oldMatch) {
    return 'https://lh3.googleusercontent.com/d/' + oldMatch[1] + '=w400';
  }

  var fileId = null;

  // パターン1: /file/d/FILE_ID/
  var m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) { fileId = m1[1]; }

  // パターン2: ?id=FILE_ID または &id=FILE_ID
  if (!fileId) {
    var m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) { fileId = m2[1]; }
  }

  // パターン3: /open?id=FILE_ID
  if (!fileId) {
    var m3 = url.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
    if (m3) { fileId = m3[1]; }
  }

  if (!fileId) {
    // Drive URLっぽくなければそのまま返す
    return url;
  }

  // thumbnail形式: ブラウザからの直接表示に最も安定している
  return 'https://lh3.googleusercontent.com/d/' + fileId + '=w400';
}

// ==========================================
// J列の写真URLを一括変換（既存データ対応）
// メニューから手動実行も可能
// ==========================================
function convertAllPhotoUrls() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.members);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('TOPメンバーリストシートが見つかりません。');
    return;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('データがありません。');
    return;
  }
  var range = sheet.getRange(2, 10, lastRow - 1, 1);
  var values = range.getValues();
  var newValues = [];
  var converted = 0;
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i][0] || '').trim();
    if (!v) { newValues.push(['']); continue; }
    var c = convertDriveUrl(v);
    if (c !== v) { converted++; }
    newValues.push([c]);
  }
  range.setValues(newValues);
  SpreadsheetApp.getUi().alert('写真URLの変換が完了しました。\n\n変換件数: ' + converted + '件\n\n今後はJ列にGoogle Driveの共有URLを貼るだけで自動的に変換されます。');
}