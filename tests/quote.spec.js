import { expect, test } from '@playwright/test';

async function clearStorage(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test('負數量不得進入報價計算', async ({ page }) => {
  const quantity = page.locator('[data-index="0"][data-key="qty"]');
  await quantity.fill('-2');

  await expect(quantity).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#grandTotalText')).toHaveText('NT$8,400');
  await expect(page.locator('#validationSummary')).toContainText('數量必須是大於 0 的整數');
});

test('負單價與負折扣會被阻止且不會提高總額', async ({ page }) => {
  await page.locator('[data-index="0"][data-key="price"]').fill('-100');
  await page.locator('#discount').fill('-500');

  await expect(page.locator('[data-index="0"][data-key="price"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#discount')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#grandTotalText')).toHaveText('NT$8,400');
  await expect(page.locator('#validationSummary')).toContainText('折扣不得為負數');
  await expect(page.locator('#saveHistoryBtn')).toBeDisabled();
  await expect(page.locator('#printBtn')).toBeDisabled();
});

test('必要欄位、Email 與空白單價錯誤時不得儲存或列印', async ({ page }) => {
  await page.locator('#customerName').fill('');
  await page.locator('#customerEmail').fill('not-an-email');
  await page.locator('[data-index="0"][data-key="price"]').fill('');
  await expect(page.locator('#customerName')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#customerEmail')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-index="0"][data-key="price"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#validationSummary')).toContainText('客戶公司／名稱必須正確填寫');
  await expect(page.locator('#validationSummary')).toContainText('單價必須填寫');
  await expect(page.locator('#saveHistoryBtn')).toBeDisabled();
  await expect(page.locator('#printBtn')).toBeDisabled();
});

test('儲存後同日下一張報價單使用下一個流水號', async ({ page }) => {
  await expect(page.locator('#quoteNo')).toHaveValue(/-001$/);
  await page.locator('#saveHistoryBtn').click();
  await expect(page.locator('#statusMessage')).toContainText('已儲存');
  await expect(page.locator('#quoteNo')).toHaveValue(/-002$/);

  await page.reload();
  await expect(page.locator('#quoteNo')).toHaveValue(/-002$/);
});

test('舊版歷史資料只遷移一次，刪除後不會復活', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('quoteHistory', JSON.stringify([{ quoteNo: 'QT-20260724-001', customerName: '舊版客戶', items: [{ name: '舊品項', qty: 1, price: 100 }] }]));
  });
  await page.reload();
  await expect(page.locator('.history-item')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-delete-history="0"]').click();
  await expect(page.locator('.history-item')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.history-item')).toHaveCount(0);
});

test('歷史報價可刪除及複製成新報價', async ({ page }) => {
  await page.locator('#saveHistoryBtn').click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  await expect(page.locator('.history-total')).toContainText('NT$21,000');

  await page.locator('[data-duplicate="0"]').click();
  await expect(page.locator('#quoteNo')).toHaveValue(/-002$/);
  await expect(page.locator('#statusMessage')).toContainText('已複製');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-delete-history="0"]').click();
  await expect(page.locator('.history-item')).toHaveCount(0);
});

test('歷史報價可匯出可攜 JSON 並匯入還原', async ({ page }) => {
  await page.locator('#saveHistoryBtn').click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^quotation-backup-\d{8}\.json$/);
  const exportPath = await download.path();
  const content = await (await import('node:fs/promises')).readFile(exportPath, 'utf8');
  const backup = JSON.parse(content);
  expect(backup.schemaVersion).toBe(1);
  expect(backup.records).toHaveLength(1);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.history-item')).toHaveCount(0);
  await page.locator('#importInput').setInputFiles({
    name: 'quotation-backup.json', mimeType: 'application/json', buffer: Buffer.from(content),
  });
  await expect(page.locator('.history-item')).toHaveCount(1);
  await expect(page.locator('#statusMessage')).toContainText('匯入 1 筆');
});

test('作品版具備商務欄位、真實功能名稱與資料邊界說明', async ({ page }) => {
  await expect(page.locator('#sellerTaxId')).toBeVisible();
  await expect(page.locator('#sellerContact')).toBeVisible();
  await expect(page.locator('#customerTaxId')).toBeVisible();
  await expect(page.locator('#contactPerson')).toBeVisible();
  await expect(page.locator('#paymentTerms')).toBeVisible();
  await expect(page.locator('#serviceScope')).toBeVisible();
  await expect(page.locator('#notes')).toBeVisible();
  await expect(page.locator('#quoteVersion')).toHaveValue('v1');
  await expect(page.locator('#printBtn')).toHaveText('列印／另存為 PDF');
  await expect(page.locator('#currencyHelp')).toContainText('不進行匯率換算');
  await expect(page.locator('#storageHelp')).toContainText('匯出 JSON');
  await expect(page.locator('#portfolioNotice')).toContainText('非 ECOCO 官方產品');
});

test('稅別明確區分未稅加計與免稅', async ({ page }) => {
  await page.locator('#taxMode').selectOption('exclusive-5');
  await expect(page.locator('#taxText')).toHaveText('NT$1,000');
  await expect(page.locator('#grandTotalText')).toHaveText('NT$21,000');

  await page.locator('#taxMode').selectOption('exempt');
  await expect(page.locator('#taxText')).toHaveText('NT$0');
  await expect(page.locator('#grandTotalText')).toHaveText('NT$20,000');
  await expect(page.locator('#paperTaxMode')).toHaveText('免稅／零稅額');
});

test('匯入內容與使用者輸入以純文字呈現，不執行 HTML', async ({ page }) => {
  const payload = '<img src=x onerror="window.__xss=true">';
  const backup = { schemaVersion: 1, records: [{ quoteNo: 'QT-20260724-777', customerName: payload, currency: 'TWD', items: [{ name: payload, qty: 1, price: 10 }] }] };
  await page.locator('#importInput').setInputFiles({ name: 'quotation-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('.history-item')).toContainText(payload);
  await page.locator('[data-history="0"]').click();
  await expect(page.locator('#paperCustomer')).toHaveText(payload);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('匯入數字欄位不得接受可執行字串', async ({ page }) => {
  const payload = '\"><img src=x onerror="window.__numericXss=true">';
  const backup = { schemaVersion: 1, records: [{ quoteNo: 'QT-20260724-778', customerName: '測試', items: [{ name: '品項', qty: payload, price: 10 }] }] };
  await page.locator('#importInput').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#statusMessage')).toContainText('匯入失敗');
  await expect(page.locator('.history-item')).toHaveCount(0);
  expect(await page.evaluate(() => window.__numericXss)).toBeUndefined();
});

test('匯入畸形品項時整批拒絕且不污染 localStorage', async ({ page }) => {
  const backup = { schemaVersion: 1, records: [{ quoteNo: 'QT-20260724-779', customerName: '測試', items: [null] }] };
  await page.locator('#importInput').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#statusMessage')).toContainText('匯入失敗');
  await expect(page.locator('.history-item')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('quotationHistoryV2'))).toBeNull();
});

test('匯入同編號資料時保留既有報價並明確略過', async ({ page }) => {
  await page.locator('#customerName').fill('原始客戶');
  const quoteNo = await page.locator('#quoteNo').inputValue();
  await page.locator('#saveHistoryBtn').click();
  const backup = { schemaVersion: 1, records: [{ quoteNo, customerName: '匯入覆蓋客戶', items: [{ name: '品項', qty: 1, price: 1 }] }] };
  await page.locator('#importInput').setInputFiles({ name: 'duplicate.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#statusMessage')).toContainText('略過 1 筆編號重複');
  await page.locator('[data-history="0"]').click();
  await expect(page.locator('#customerName')).toHaveValue('原始客戶');
});

test('TWD 不接受小數單價或折扣', async ({ page }) => {
  await page.locator('[data-index="0"][data-key="price"]').fill('10.5');
  await page.locator('#discount').fill('0.5');
  await expect(page.locator('[data-index="0"][data-key="price"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#discount')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#validationSummary')).toContainText('TWD 金額必須是整數');
  await expect(page.locator('#saveHistoryBtn')).toBeDisabled();
});

test('流水號超過 999 後繼續遞增且不重複', async ({ page }) => {
  const stamp = (await page.locator('#quoteNo').inputValue()).slice(3, 11);
  const backup = { schemaVersion: 1, records: [{ quoteNo: `QT-${stamp}-999`, customerName: '測試', items: [{ name: '品項', qty: 1, price: 1 }] }] };
  await page.locator('#importInput').setInputFiles({ name: 'sequence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.locator('[data-duplicate="0"]').click();
  await expect(page.locator('#quoteNo')).toHaveValue(`QT-${stamp}-1000`);
  await page.locator('#saveHistoryBtn').click();
  await expect(page.locator('#quoteNo')).toHaveValue(`QT-${stamp}-1001`);
});

test('列印模式只保留正式報價內容', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.controls')).toBeHidden();
  await expect(page.locator('.history')).toBeHidden();
  await expect(page.locator('#quotePaper')).toBeVisible();
});

test('行動版沒有水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
