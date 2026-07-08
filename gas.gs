// ================================================================
// BNI ビジネスオープンデー 2026 — 申込みフォーム GAS スクリプト
// ================================================================
// 【デプロイ手順】
// 1. script.google.com で新規プロジェクト作成
// 2. このコードを貼り付けて保存
// 3. 「デプロイ」→「新しいデプロイ」→ 種類: ウェブアプリ
//    - 次のユーザーとして実行: 自分
//    - アクセスできるユーザー: 全員
// 4. デプロイ URL をコピー → index.html の YOUR_GAS_URL に貼り付け
//
// 【リマインダーメール設定】
// 「トリガー」画面で以下を追加:
//   関数: dailyReminderCheck
//   イベントソース: 時間主導型
//   タイプ: 日付ベースのタイマー → 毎日 午前9時〜10時
//
// 【送信元メール設定 info@search-mania.net から送る場合】
// Gmailの設定 → 「名前とメールアドレス」→ 「他のメールアドレスを追加」で
// info@search-mania.net をエイリアスとして追加し確認してください。
// ================================================================

const SPREADSHEET_ID = '1DW6PjBuuRpI3fpre5DhEWlIqaydqGGpbScq9RXpVMcs';
const SHEET_NAME     = '申込者';
const FROM_EMAIL     = 'info@search-mania.net';  // Gmailエイリアス設定が必要
const FROM_NAME      = 'BNI 沖縄リージョン TOPチャプター';

const EVENT_NAME     = 'BNI ビジネスオープンデー 2026';
const EVENT_DATE_STR = '2026年8月18日（火）14:00〜17:00';
const EVENT_VENUE    = 'ノボテル沖縄那覇（〒902-0062 沖縄県那覇市松川40番地）';

// リマインダー送信日（MM/dd 形式）
const REMINDER_WEEK_BEFORE = '08/11';  // 1週間前
const REMINDER_DAY_BEFORE  = '08/17';  // 前日

// スプレッドシートの列定義
const HEADERS = [
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

// ----------------------------------------------------------------
// doPost — フォーム送信受け取り
// ----------------------------------------------------------------
function doPost(e) {
  try {
    const p = e.parameter;

    // シート取得（なければ作成）
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // ヘッダー行がなければ追加
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length)
        .setBackground('#BF0000')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // 受付日時
    const now = Utilities.formatDate(
      new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'
    );

    // データ行追加
    sheet.appendRow([
      now,
      p.name        || '',
      p.nameKana    || '',
      p.company     || '',
      p.companyKana || '',
      p.industry    || '',
      p.referrer    || '',
      p.email       || '',
      p.phone       || '',
      p.afterparty  || '',
      p.authority   || '',
      p.survey      || '',
    ]);

    // 確認メール送信
    if (p.email) {
      sendConfirmationEmail(p);
    }

    // 完了通知をiframeへ返す
    return HtmlService.createHtmlOutput(
      '<script>window.parent.postMessage("bni_success","*");</script>'
    );

  } catch (err) {
    console.error(err);
    return HtmlService.createHtmlOutput(
      '<script>window.parent.postMessage("bni_error","*");</script>'
    );
  }
}

// ----------------------------------------------------------------
// 確認メール送信
// ----------------------------------------------------------------
function sendConfirmationEmail(p) {
  const afterpartyLine = p.afterparty === '参加する'
    ? '懇親会　　：参加する（8,000円・当日受付払い）'
    : '懇親会　　：不参加';

  const subject = `【申込み完了】${EVENT_NAME}`;
  const body = `
${p.name} 様

この度は「${EVENT_NAME}」へのお申込みありがとうございます。
以下の内容で受け付けました。

━━━━━━━━━━━━━━━━━━━━━━━━━━
■ お申込み内容
━━━━━━━━━━━━━━━━━━━━━━━━━━
お名前　　：${p.name}（${p.nameKana}）
会社名　　：${p.company}
業種　　　：${p.industry}
${afterpartyLine}
決裁権　　：${p.authority}
参加目的　：${p.survey}
━━━━━━━━━━━━━━━━━━━━━━━━━━

■ イベント詳細
日時：${EVENT_DATE_STR}（参加費：無料）
会場：${EVENT_VENUE}

${p.afterparty === '参加する'
  ? '懇親会（18:00〜20:00 予定）参加費：8,000円（予定）\n当日受付にてお支払いください。\n\n'
  : ''}■ 当日のご準備
・お名刺を数枚ご持参ください
・14:00 開始ですが 13:45 にはお越しいただけますと幸いです

ご不明な点はお気軽にご連絡ください。
当日のご参加をお待ちしております！

─────────────────────────────
${FROM_NAME}
Mail: ${FROM_EMAIL}
─────────────────────────────
※ このメールは自動送信です。
`.trim();

  try {
    GmailApp.sendEmail(p.email, subject, body, {
      from:    FROM_EMAIL,
      name:    FROM_NAME,
      replyTo: FROM_EMAIL,
    });
  } catch(err) {
    // エイリアス未設定の場合は MailApp でフォールバック
    MailApp.sendEmail({
      to:      p.email,
      subject: subject,
      body:    body,
    });
  }
}

// ================================================================
// リマインダーメール — GAS トリガーで毎日実行
// ================================================================
function dailyReminderCheck() {
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'MM/dd');

  if (today === REMINDER_WEEK_BEFORE) {
    sendReminderToAll('week');
  } else if (today === REMINDER_DAY_BEFORE) {
    sendReminderToAll('day');
  }
}

function sendReminderToAll(type) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const row       = rows[i];
    const name      = row[1]  || '';
    const email     = row[7]  || '';
    const afterparty = row[9] || '';

    if (!email || !name) continue;

    try {
      const mail = buildReminderEmail(type, name, afterparty);
      GmailApp.sendEmail(email, mail.subject, mail.body, {
        from:    FROM_EMAIL,
        name:    FROM_NAME,
        replyTo: FROM_EMAIL,
      });
    } catch(err) {
      // フォールバック
      const mail = buildReminderEmail(type, name, afterparty);
      MailApp.sendEmail({ to: email, subject: mail.subject, body: mail.body });
    }

    Utilities.sleep(300); // レート制限対策
  }
}

function buildReminderEmail(type, name, afterparty) {
  const afterpartyBlock = afterparty === '参加する'
    ? `懇親会（18:00〜20:00 予定）：8,000円（当日受付払い）\n`
    : '';

  if (type === 'week') {
    return {
      subject: `【1週間前ご案内】${EVENT_NAME}`,
      body: `
${name} 様

いよいよ来週、「${EVENT_NAME}」の開催まで1週間となりました。
当日を楽しみにお待ちください！

■ イベント詳細
日時：${EVENT_DATE_STR}（参加費：無料）
会場：${EVENT_VENUE}
${afterpartyBlock}
■ 当日のご準備
・お名刺を数枚ご持参ください
・13:45 受付開始、14:00 開始となります

ご不明な点はお気軽にご連絡ください。

─────────────────────────────
${FROM_NAME}
Mail: ${FROM_EMAIL}
─────────────────────────────
`.trim()
    };
  }

  // 前日
  return {
    subject: `【明日開催】${EVENT_NAME} 最終ご案内`,
    body: `
${name} 様

いよいよ明日、「${EVENT_NAME}」を開催します！

■ タイムライン
13:45　受付開始
14:00　開会・BNI紹介
14:30　メンバーによる60秒スピーチ
15:30　ビジネスオープンデー・交流
17:00　閉会
${afterparty === '参加する' ? '18:00　懇親会スタート（8,000円・当日払い）\n' : ''}
■ 会場
${EVENT_VENUE}
Google マップ：https://maps.google.com/?q=ノボテル沖縄那覇

■ ご持参物
・お名刺（数枚）

明日のご参加を心よりお待ちしております！

─────────────────────────────
${FROM_NAME}
Mail: ${FROM_EMAIL}
─────────────────────────────
`.trim()
  };
}

// ----------------------------------------------------------------
// doGet — 動作確認用
// ----------------------------------------------------------------
function doGet() {
  return HtmlService.createHtmlOutput(
    '<h2>BNI ビジネスオープンデー 2026 申込みフォーム API — 稼働中 ✓</h2>'
  );
}
