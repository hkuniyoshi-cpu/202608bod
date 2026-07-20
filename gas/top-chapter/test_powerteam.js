/**
 * ==========================================================
 * BNI TOP Chapter - Power Team Test Functions
 * ==========================================================
 * GASエディタから直接実行して結果を Logger で確認する。
 * すべての関数は _pt_assert* 系ヘルパーで失敗時に throw する。
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
// シートセットアップのテスト
// 事前: setupPowerTeamSheet を1回実行しておく
// ==========================================
function test_setupPowerTeamSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PT_SHEET_NAME);
  _pt_assertTruthy(sheet, 'シート「' + PT_SHEET_NAME + '」が存在する');

  var lastCol = sheet.getLastColumn();
  _pt_assertEquals(lastCol, 30, 'カラム数が30（A-AD）');

  var hdr = sheet.getRange(1, 1, 1, 30).getValues()[0];
  _pt_assertEquals(hdr[0], '提出ID', 'A列ヘッダーが「提出ID」');
  _pt_assertEquals(hdr[29], '備考', 'AD列ヘッダーが「備考」');
  _pt_assertEquals(hdr[20], 'ミッションの理由', 'U列ヘッダーが「ミッションの理由」');
  _pt_assertEquals(hdr[21], '紹介スクリプト', 'V列ヘッダーが「紹介スクリプト」');

  var frozenRows = sheet.getFrozenRows();
  _pt_assertEquals(frozenRows, 1, '1行目が固定');

  Logger.log('=== test_setupPowerTeamSheet: ALL PASS ===');
}

// ==========================================
// Drive画像保存ヘルパーのテスト（3枚）
// ==========================================
function test_saveImagesToDrive() {
  var TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  var images = [
    { base64: TINY_PNG, mime: 'image/png' },
    { base64: TINY_PNG, mime: 'image/png' },
    { base64: TINY_PNG, mime: 'image/png' }
  ];
  var urls = saveImagesToDrive_(images, 'テスト太郎');

  _pt_assertEquals(urls.length, 3, '3つのURLが返る');
  _pt_assertMatch(urls[0], /^https:\/\/lh3\.googleusercontent\.com\/d\//, 'URL1がGoogle thumbnail形式');
  _pt_assertMatch(urls[1], /^https:\/\/lh3\.googleusercontent\.com\/d\//, 'URL2がGoogle thumbnail形式');
  _pt_assertMatch(urls[2], /^https:\/\/lh3\.googleusercontent\.com\/d\//, 'URL3がGoogle thumbnail形式');

  var folder = getPowerTeamFolder_();
  _pt_assertTruthy(folder, 'Driveフォルダが取得できる');
  _pt_assertEquals(folder.getName(), PT_DRIVE_FOLDER_NAME, 'フォルダ名が正しい');

  Logger.log('URLs: ' + JSON.stringify(urls));
  Logger.log('=== test_saveImagesToDrive: ALL PASS ===');
  Logger.log('※ Drive の「' + PT_DRIVE_FOLDER_NAME + '」フォルダを開いてファイル3つが存在することを目視確認');
}

// ==========================================
// Gemini OCR呼び出しのテスト（3ページ）
// 事前:
//   1. GEMINI_API_KEY がスクリプトプロパティに保存されている
//   2. Drive「BNI-powerteam-images/_test/」に
//      sample_p3.jpg / sample_p4.jpg / sample_p5.jpg を配置
// ==========================================
function test_callGeminiOCR() {
  var folder = getPowerTeamFolder_();
  var testFolders = folder.getFoldersByName('_test');
  _pt_assertTruthy(testFolders.hasNext(), '_testフォルダが存在');
  var testFolder = testFolders.next();

  var p3Files = testFolder.getFilesByName('sample_p3.jpg');
  var p4Files = testFolder.getFilesByName('sample_p4.jpg');
  var p5Files = testFolder.getFilesByName('sample_p5.jpg');
  _pt_assertTruthy(p3Files.hasNext(), 'sample_p3.jpg が存在');
  _pt_assertTruthy(p4Files.hasNext(), 'sample_p4.jpg が存在');
  _pt_assertTruthy(p5Files.hasNext(), 'sample_p5.jpg が存在');
  var p3File = p3Files.next();
  var p4File = p4Files.next();
  var p5File = p5Files.next();

  var images = [
    { base64: Utilities.base64Encode(p3File.getBlob().getBytes()), mime: 'image/jpeg' },
    { base64: Utilities.base64Encode(p4File.getBlob().getBytes()), mime: 'image/jpeg' },
    { base64: Utilities.base64Encode(p5File.getBlob().getBytes()), mime: 'image/jpeg' }
  ];

  var result = callGeminiOCR_(images);
  Logger.log('Response: ' + JSON.stringify(result, null, 2));

  _pt_assertTruthy(result.p3_page, 'p3_page が返る');
  _pt_assertTruthy(result.p4_page, 'p4_page が返る');
  _pt_assertTruthy(result.p5_page, 'p5_page が返る');
  _pt_assertEquals(result.p3_page.detected, true, 'p.3 が検出される');
  _pt_assertEquals(result.p4_page.detected, true, 'p.4 が検出される');
  _pt_assertEquals(result.p5_page.detected, true, 'p.5 が検出される');
  _pt_assertTruthy(result.p4_page.mission, 'p.4 のミッションが空でない');
  _pt_assertTruthy(result.p5_page.mission_reason, 'p.5 のミッション理由が空でない');
  _pt_assertTruthy(Array.isArray(result.warnings), 'warnings 配列で返る');

  Logger.log('=== test_callGeminiOCR: ALL PASS ===');
}

// ==========================================
// シートCRUDのテスト
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
    additional_specialties: ['マーケター', 'デザイナー'],
    mission_reason: 'テストミッション理由',
    introduction_script: 'テスト紹介スクリプト'
  });
  _pt_assertTruthy(created.submission_id, '新規保存で submission_id が返る');

  // Read one
  var one = getPowerTeamOne_(uniqueName);
  _pt_assertTruthy(one, '名前で1件取得できる');
  _pt_assertEquals(one.submitter_name, uniqueName, '取得した submitter_name が一致');
  _pt_assertEquals(one.powerteam_name, '販促専門チーム', 'powerteam_name が一致');
  _pt_assertEquals(one.mission_reason, 'テストミッション理由', 'mission_reason が保存される');
  _pt_assertEquals(one.introduction_script, 'テスト紹介スクリプト', 'introduction_script が保存される');
  _pt_assertEquals(one.additional_specialties.length, 2, 'additional_specialties が配列で復元される');

  // Update
  var updated = updatePowerTeamRow_(created.submission_id, {
    mission: '更新後ミッション',
    mission_reason: '更新後の理由',
    status: PT_STATUS.CONFIRMED
  });
  _pt_assertTruthy(updated.updated_at, '更新で updated_at が返る');
  var afterUpdate = getPowerTeamOne_(uniqueName);
  _pt_assertEquals(afterUpdate.mission, '更新後ミッション', 'ミッションが更新されている');
  _pt_assertEquals(afterUpdate.mission_reason, '更新後の理由', 'mission_reasonが更新されている');
  _pt_assertEquals(afterUpdate.status, PT_STATUS.CONFIRMED, 'ステータスが confirmed に昇格');

  // Read all (confirmed)
  var all = getPowerTeamAll_(false);
  var found = all.some(function(x) { return x.submitter_name === uniqueName; });
  _pt_assertTruthy(found, '全件取得に含まれる');

  // Delete (soft)
  deletePowerTeamRow_(created.submission_id);
  var afterDelete = getPowerTeamOne_(uniqueName);
  _pt_assertEquals(afterDelete, null, '論理削除後は取得できない');

  Logger.log('=== test_powerTeamCRUD: ALL PASS ===');
  Logger.log('※ テスト行が残っています（status=deleted）。手動で削除してもOK。');
  Logger.log('   submitter_name: ' + uniqueName);
}
