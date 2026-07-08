// ================================================================
// BNI ビジネスオープンデー 2026 — スプレッドシート初期セットアップ
// ================================================================
// 【使い方】
// 1. gas.gs と同じ GAS プロジェクトにこのコードを貼り付ける
// 2. 関数 "runSetup" を選択して▶ 実行
// 3. 完了後、このファイルは削除してOK（gas.gs だけ残す）
// ================================================================

const SETUP_SPREADSHEET_ID = '1DW6PjBuuRpI3fpre5DhEWlIqaydqGGpbScq9RXpVMcs';
const SETUP_SHEET_NAME     = '申込者';

function runSetup() {
  setupSheet();
  setupReminderTrigger();
  Logger.log('✅ セットアップ完了！スプレッドシートとトリガーを確認してください。');
}

// ----------------------------------------------------------------
// シート作成 & ヘッダー整形
// ----------------------------------------------------------------
function setupSheet() {
  const ss = SpreadsheetApp.openById(SETUP_SPREADSHEET_ID);

  // シートが既存なら削除して再作成（クリーンアップ）
  let sheet = ss.getSheetByName(SETUP_SHEET_NAME);
  if (sheet) {
    const confirm = Browser.msgBox(
      '確認',
      `「${SETUP_SHEET_NAME}」シートが既に存在します。\n上書きリセットしますか？（データが消えます）`,
      Browser.Buttons.YES_NO
    );
    if (confirm !== 'yes') {
      Logger.log('シートのリセットをキャンセルしました。ヘッダーのみ確認します。');
      ensureHeaders(sheet);
      return;
    }
    ss.deleteSheet(sheet);
  }

  // 新規シート作成
  sheet = ss.insertSheet(SETUP_SHEET_NAME);

  // ── ヘッダー設定 ──────────────────────────────────────
  const headers = [
    '受付日時',
    'お名前',
    'フリガナ',
    '会社名',
    '会社名フリガナ',
    '業種',
    '紹介者',
    'メールアドレス',
    '電話番号',
    '懇親会',
    '決裁権',
    '参加目的',
  ];

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);

  // スタイル
  headerRange
    .setBackground('#BF0000')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // 行の高さ
  sheet.setRowHeight(1, 36);

  // 列幅の調整
  const colWidths = [140, 100, 100, 160, 160, 140, 120, 200, 120, 80, 140, 240];
  colWidths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // 先頭行を固定
  sheet.setFrozenRows(1);

  // フィルター設定
  sheet.getRange(1, 1, 1, headers.length).createFilter();

  Logger.log(`✅ シート「${SETUP_SHEET_NAME}」を作成しました（列数: ${headers.length}）`);
}

function ensureHeaders(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('既存ヘッダー: ' + headers.join(', '));
}

// ----------------------------------------------------------------
// リマインダー用 日次トリガーを登録
// ----------------------------------------------------------------
function setupReminderTrigger() {
  // 既存の dailyReminderCheck トリガーを削除（重複防止）
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'dailyReminderCheck') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('既存のリマインダートリガーを削除しました');
    }
  });

  // 毎日 午前9時に実行
  ScriptApp.newTrigger('dailyReminderCheck')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  Logger.log('✅ リマインダートリガーを登録しました（毎日 午前9時）');
  Logger.log('   → 8/11（1週間前）と 8/17（前日）に自動メール送信されます');
}

// ----------------------------------------------------------------
// 登録済みトリガー一覧を確認したいとき
// ----------------------------------------------------------------
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    Logger.log('トリガーは登録されていません');
    return;
  }
  triggers.forEach(t => {
    Logger.log(`関数: ${t.getHandlerFunction()} | タイプ: ${t.getEventType()}`);
  });
}
