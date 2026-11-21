import { Receipt, BusinessSettings } from '../db/types';
import { formatDate, formatCurrency, PAYMENT_RU, PAYMENT_HE } from './formatting';

// ─── Receipt HTML ────────────────────────────────────────────────────────────

function buildReceiptHTML(r: Receipt, s: BusinessSettings): string {
  const isStorno = r.docType === 'storno';
  const docTitleHe = isStorno ? 'זיכוי' : 'קבלה';
  const docTitleEn = isStorno ? 'REFUND' : 'RECEIPT';
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    direction: rtl;
    text-align: right;
    background: #fff;
    color: #111;
    font-size: 14px;
    line-height: 1.6;
    padding: 52px 24px 28px;
    max-width: 580px;
    margin: 0 auto;
  }
  .brand { font-size: 42px; font-weight: 900; letter-spacing: 4px; line-height: 1; }
  .brand-sub { font-size: 12px; color: #888; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .header { border-bottom: 2.5px solid #111; padding-bottom: 18px; margin-bottom: 20px; }
  .receipt-meta { margin-top: 10px; font-size: 13px; }
  .receipt-num { font-size: 16px; font-weight: 700; }
  .biz { margin-top: 14px; font-size: 13px; line-height: 1.7; color: #333; }
  .block {
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 14px;
    margin: 12px 0;
  }
  .lbl {
    font-size: 10px;
    color: #aaa;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .val { font-size: 17px; font-weight: 700; }
  .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f4f4f4; }
  .row:last-child { border: none; }
  .rl { color: #666; }
  .rv { font-weight: 600; }
  .total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 24px;
    font-weight: 900;
    border-top: 2.5px solid #111;
    margin-top: 18px;
    padding-top: 16px;
  }
  .badge {
    display: inline-block;
    background: #f2f2f2;
    border-radius: 20px;
    padding: 5px 16px;
    font-size: 13px;
    font-weight: 600;
  }
  .note-box { background: #fafafa; border-radius: 4px; padding: 10px; font-size: 13px; color: #555; margin-top: 6px; }
  .close-btn {
    position: fixed;
    top: 14px;
    left: 14px;
    z-index: 999;
    background: #1A1A1A;
    color: #fff;
    border: none;
    border-radius: 20px;
    padding: 9px 18px;
    font-size: 14px;
    font-weight: 700;
    font-family: Arial, Helvetica, sans-serif;
    direction: ltr;
  }
  @media print { .close-btn { display: none; } }
  .footer {
    text-align: center;
    color: #999;
    font-size: 12px;
    margin-top: 28px;
    padding-top: 16px;
    border-top: 1px solid #eee;
    letter-spacing: 1px;
  }
  @media print {
    body { padding: 12px; }
    @page { margin: 12mm; }
  }
</style>
</head>
<body>
<button class="close-btn" onclick="window.close()">✕ Закрыть</button>
<div class="header">
  <div class="brand">${docTitleHe}</div>
  <div class="brand-sub">${docTitleEn}</div>
  <div class="receipt-meta">
    <div class="receipt-num">מספר ${r.receiptNumber}</div>
    <div>תאריך: ${formatDate(r.date)}</div>
    ${isStorno ? `<div>בגין קבלה מספר ${r.relatedReceiptNumber}</div>` : ''}
  </div>
  <div class="biz">
    <strong>${s.ownerName}</strong><br>
    עוסק פטור &nbsp;|&nbsp; מס' עוסק: ${s.oseqNumber}
    ${s.address ? `<br>${s.address}` : ''}
    ${s.phone ? `<br>טל': ${s.phone}` : ''}
    ${s.email ? `<br>${s.email}` : ''}
  </div>
</div>

<div class="block">
  <div class="lbl">התקבל מ / Получено от</div>
  <div class="val">${r.clientName}</div>
</div>

<div class="block">
  <div class="lbl">פירוט / Детали</div>
  <div class="row">
    <span class="rl">שירות / Услуга</span>
    <span class="rv">${r.description}</span>
  </div>
  <div class="row">
    <span class="rl">כמות / Кол-во</span>
    <span class="rv">${r.quantity}</span>
  </div>
  <div class="row">
    <span class="rl">מחיר יח' / Цена за ед.</span>
    <span class="rv">${formatCurrency(r.unitPrice)}</span>
  </div>
</div>

<div class="total">
  <span>סה"כ / Итого</span>
  <span>${formatCurrency(r.totalAmount)}</span>
</div>

<div class="block" style="margin-top:14px">
  <div class="lbl">אמצעי תשלום / Способ оплаты</div>
  <span class="badge">${PAYMENT_HE[r.paymentMethod] || r.paymentMethod} &nbsp;/&nbsp; ${PAYMENT_RU[r.paymentMethod] || r.paymentMethod}</span>
</div>

${
  r.note
    ? `<div class="block">
  <div class="lbl">הערה / Примечание</div>
  <div class="note-box">${r.note}</div>
</div>`
    : ''
}

<div class="footer">עוסק פטור — לא נגבה מע״מ</div>
</body>
</html>`;
}

// ─── Report HTML ─────────────────────────────────────────────────────────────

function buildReportHTML(
  receipts: Receipt[],
  s: BusinessSettings,
  from: string,
  to: string
): string {
  const total = receipts.reduce((sum, r) => sum + r.totalAmount, 0);
  const byPay: Record<string, number> = {};
  receipts.forEach((r) => {
    byPay[r.paymentMethod] = (byPay[r.paymentMethod] || 0) + r.totalAmount;
  });

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    direction: rtl;
    padding: 52px 24px 24px;
    font-size: 13px;
    color: #111;
    max-width: 750px;
    margin: 0 auto;
  }
  h1 { font-size: 28px; font-weight: 900; }
  .sub { color: #666; font-size: 13px; margin: 6px 0 20px; }
  .stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0; }
  .stat { border: 1px solid #e0e0e0; padding: 14px; border-radius: 6px; }
  .sl { font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 1px; }
  .sv { font-size: 22px; font-weight: 900; margin-top: 4px; }
  .by-pay { margin: 16px 0; }
  .by-pay-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f4f4f4; font-size: 13px; max-width: 360px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
  th { background: #f5f5f5; padding: 9px 8px; text-align: right; border-bottom: 2px solid #ddd; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  td { padding: 8px; border-bottom: 1px solid #f0f0f0; }
  tr:nth-child(even) td { background: #fafafa; }
  .tot-row td { font-weight: 700; background: #efefef !important; border-top: 2px solid #ccc; }
  .footer { text-align: center; color: #aaa; font-size: 11px; margin-top: 28px; padding-top: 14px; border-top: 1px solid #eee; }
  .close-btn {
    position: fixed;
    top: 14px;
    left: 14px;
    z-index: 999;
    background: #1A1A1A;
    color: #fff;
    border: none;
    border-radius: 20px;
    padding: 9px 18px;
    font-size: 14px;
    font-weight: 700;
    font-family: Arial, Helvetica, sans-serif;
    direction: ltr;
  }
  @media print {
    body { padding: 12px; }
    @page { margin: 12mm; size: A4 landscape; }
    .close-btn { display: none; }
  }
</style>
</head>
<body>
<button class="close-btn" onclick="window.close()">✕ Закрыть</button>
<h1>דוח הכנסות</h1>
<div class="sub">
  ${s.ownerName} &nbsp;|&nbsp; עוסק פטור ${s.oseqNumber}<br>
  תקופה: ${formatDate(from)} — ${formatDate(to)}
</div>

<div class="stats">
  <div class="stat">
    <div class="sl">סה"כ / Итого</div>
    <div class="sv">${formatCurrency(total)}</div>
  </div>
  <div class="stat">
    <div class="sl">קבלות / Чеков</div>
    <div class="sv">${receipts.length}</div>
  </div>
</div>

<div class="by-pay">
  ${Object.entries(byPay)
    .map(
      ([m, a]) =>
        `<div class="by-pay-row"><span>${PAYMENT_HE[m] || m}</span><strong>${formatCurrency(a)}</strong></div>`
    )
    .join('')}
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>תאריך</th>
      <th>לקוח</th>
      <th>תיאור</th>
      <th>סכום</th>
      <th>תשלום</th>
      <th>הערה</th>
    </tr>
  </thead>
  <tbody>
    ${receipts
      .map(
        (r) => `<tr>
      <td>${r.receiptNumber}</td>
      <td>${formatDate(r.date)}</td>
      <td>${r.clientName}</td>
      <td>${r.description}</td>
      <td>${formatCurrency(r.totalAmount)}</td>
      <td>${PAYMENT_HE[r.paymentMethod] || r.paymentMethod}</td>
      <td>${r.note || ''}</td>
    </tr>`
      )
      .join('')}
    <tr class="tot-row">
      <td colspan="4">סה"כ / Итого</td>
      <td>${formatCurrency(total)}</td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="footer">עוסק פטור — לא נגבה מע״מ</div>
</body>
</html>`;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function openPrintWindow(html: string, landscape = false): void {
  const win = window.open('', '_blank', `width=${landscape ? 1000 : 700},height=900`);
  if (!win) {
    alert('Разрешите всплывающие окна в Safari (Settings → Safari → Block Pop-ups → OFF)');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 700);
}

export function printReceipt(r: Receipt, s: BusinessSettings): void {
  openPrintWindow(buildReceiptHTML(r, s));
}

export async function shareReceipt(r: Receipt, s: BusinessSettings): Promise<void> {
  const html = buildReceiptHTML(r, s);

  if (!navigator.share) {
    printReceipt(r, s);
    return;
  }

  try {
    const blob = new Blob([html], { type: 'text/html' });
    const file = new File([blob], `kabala-${r.receiptNumber}.html`, { type: 'text/html' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: `קבלה ${r.receiptNumber}`, files: [file] });
    } else {
      await navigator.share({
        title: `קבלה ${r.receiptNumber}`,
        text: `קבלה ${r.receiptNumber}\n${formatDate(r.date)}\n${r.clientName}\n${r.description}\n${formatCurrency(r.totalAmount)}\nעוסק פטור — לא נגבה מע״מ`,
      });
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') printReceipt(r, s);
  }
}

export function printReport(
  receipts: Receipt[],
  s: BusinessSettings,
  from: string,
  to: string
): void {
  openPrintWindow(buildReportHTML(receipts, s, from, to), true);
}

export function exportCSV(receipts: Receipt[], from: string, to: string): void {
  const BOM = '\uFEFF';
  const header = ['Номер', 'Дата', 'Клиент', 'Описание', 'Кол-во', 'Цена', 'Сумма', 'Оплата', 'Примечание'];
  const rows = receipts.map((r) => [
    r.receiptNumber,
    formatDate(r.date),
    r.clientName,
    r.description,
    r.quantity,
    r.unitPrice,
    r.totalAmount,
    PAYMENT_RU[r.paymentMethod] || r.paymentMethod,
    r.note || '',
  ]);
  const csv =
    BOM +
    [header, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `kabala-${from}-${to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
