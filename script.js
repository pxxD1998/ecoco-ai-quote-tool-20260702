const HISTORY_KEY = 'quotationHistoryV2';
const LEGACY_KEY = 'quoteHistory';
const SCHEMA_VERSION = 1;
const MAX_RECORDS = 100;

const state = {
  items: [
    { name: 'AI 導入顧問服務', qty: 1, price: 12000 },
    { name: '內部報價流程自動化設定', qty: 1, price: 8000 },
  ],
};

const $ = (id) => document.getElementById(id);
const fields = [
  'brandName', 'logoText', 'brandColor', 'sellerTaxId', 'sellerContact', 'ownerName',
  'customerName', 'contactPerson', 'customerEmail', 'customerTaxId', 'quoteNo',
  'quoteVersion', 'currency', 'taxMode', 'discount', 'validUntil', 'serviceScope',
  'exclusions', 'paymentTerms', 'notes',
];
const requiredFields = ['brandName', 'sellerContact', 'customerName', 'customerEmail', 'quoteNo', 'validUntil', 'serviceScope', 'paymentTerms'];

function localISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateStamp(date = new Date()) {
  return localISO(date).replaceAll('-', '');
}

function readNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validMoneyPrecision(value, currency = $('currency').value) {
  if (!Number.isFinite(value)) return false;
  const scale = currency === 'TWD' ? 1 : 100;
  return Math.abs(value * scale - Math.round(value * scale)) < 1e-8;
}

function roundMoney(value, currency = $('currency').value) {
  const scale = currency === 'TWD' ? 1 : 100;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function currencyFormat(value, currency = $('currency').value) {
  const formatted = new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'TWD' ? 0 : 2,
  }).format(Number(value) || 0);
  return currency === 'TWD' && formatted.startsWith('$') ? `NT${formatted}` : formatted;
}

function taxDefinition(mode = $('taxMode').value) {
  return {
    'exclusive-5': { rate: 0.05, label: '未稅，另加 5%' },
    'exclusive-8': { rate: 0.08, label: '未稅，另加 8%' },
    exempt: { rate: 0, label: '免稅／零稅額' },
  }[mode] || { rate: 0, label: '免稅／零稅額' };
}

function normalizeRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeRecord).filter(Boolean);
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  if (typeof record.quoteNo !== 'string' || !record.quoteNo.trim() || record.quoteNo.length > 100) return null;
  if (!Array.isArray(record.items) || !record.items.length || record.items.length > 200) return null;
  const currency = record.currency === undefined ? 'TWD' : record.currency;
  if (!['TWD', 'USD'].includes(currency)) return null;
  const items = record.items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 500) return null;
    if (!Number.isInteger(item.qty) || item.qty <= 0) return null;
    if (!Number.isFinite(item.price) || item.price < 0 || !validMoneyPrecision(item.price, currency)) return null;
    return { name: item.name, qty: item.qty, price: item.price };
  });
  if (items.some(item => item === null)) return null;

  const normalized = { items, quoteNo: record.quoteNo, currency };
  for (const key of fields) {
    if (key === 'quoteNo' || key === 'currency' || record[key] === undefined) continue;
    if (typeof record[key] !== 'string' || record[key].length > 5000) return null;
    normalized[key] = record[key];
  }
  if (record.createdAt !== undefined) {
    if (typeof record.createdAt !== 'string' || record.createdAt.length > 200) return null;
    normalized.createdAt = record.createdAt;
  }
  if (record.taxRate !== undefined) {
    if (typeof record.taxRate !== 'string' || !['0', '0.05', '0.08'].includes(record.taxRate)) return null;
    normalized.taxRate = record.taxRate;
  }
  return normalized;
}

function getHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored !== null) return normalizeRecords(JSON.parse(stored));
    const legacy = normalizeRecords(JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'));
    if (legacy.length) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(legacy));
      localStorage.removeItem(LEGACY_KEY);
    }
    return legacy;
  } catch {
    return [];
  }
}

function setHistory(records) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(normalizeRecords(records).slice(0, MAX_RECORDS)));
}

function nextQuoteNo(records = getHistory(), date = new Date()) {
  const stamp = dateStamp(date);
  const expression = new RegExp(`^QT-${stamp}-(\\d{3,})$`);
  const largest = records.reduce((max, record) => {
    const match = String(record.quoteNo || '').match(expression);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `QT-${stamp}-${String(largest + 1).padStart(3, '0')}`;
}

function itemErrors(item, index) {
  const errors = [];
  if (!String(item.name || '').trim()) errors.push(`第 ${index + 1} 項：品名不得空白`);
  if (item.qty === '' || item.qty === null || item.qty === undefined) errors.push(`第 ${index + 1} 項：數量必須填寫`);
  else if (!Number.isInteger(item.qty) || item.qty <= 0) errors.push(`第 ${index + 1} 項：數量必須是大於 0 的整數`);
  if (item.price === '' || item.price === null || item.price === undefined) errors.push(`第 ${index + 1} 項：單價必須填寫`);
  else if (!Number.isFinite(item.price) || item.price < 0) errors.push(`第 ${index + 1} 項：單價不得為負數`);
  else if (!validMoneyPrecision(item.price)) errors.push(`第 ${index + 1} 項：${$('currency').value} 金額必須是${$('currency').value === 'TWD' ? '整數' : '小數點後最多 2 位'}`);
  return errors;
}

function calculateTotals() {
  const subtotal = state.items.reduce((sum, item, index) => itemErrors(item, index).length ? sum : sum + item.qty * item.price, 0);
  const rawDiscount = Number($('discount').value);
  const discountValid = Number.isFinite(rawDiscount) && rawDiscount >= 0 && rawDiscount <= subtotal && validMoneyPrecision(rawDiscount);
  const discount = discountValid ? rawDiscount : 0;
  const taxable = Math.max(subtotal - discount, 0);
  const tax = roundMoney(taxable * taxDefinition().rate);
  return { subtotal: roundMoney(subtotal), discount: roundMoney(discount), tax, grand: roundMoney(taxable + tax) };
}

function fieldErrors() {
  const errors = [];
  requiredFields.forEach(id => {
    const field = $(id);
    const invalid = !String(field.value || '').trim() || (id === 'customerEmail' && !field.validity.valid);
    field.setAttribute('aria-invalid', String(invalid));
    if (invalid) errors.push(`${field.closest('label').childNodes[0].textContent.trim().replace(' *', '')}必須正確填寫`);
  });
  ['sellerTaxId', 'customerTaxId'].forEach(id => {
    const field = $(id);
    const invalid = field.value !== '' && !/^\d{8}$/.test(field.value);
    field.setAttribute('aria-invalid', String(invalid));
    if (invalid) errors.push(`${field.closest('label').childNodes[0].textContent.trim()}須為 8 碼數字`);
  });
  if (!state.items.length) errors.push('至少需要一項產品');
  return errors;
}

function updateValidation() {
  const errors = [...fieldErrors(), ...state.items.flatMap(itemErrors)];
  state.items.forEach((item, index) => {
    const name = document.querySelector(`[data-index="${index}"][data-key="name"]`);
    const qty = document.querySelector(`[data-index="${index}"][data-key="qty"]`);
    const price = document.querySelector(`[data-index="${index}"][data-key="price"]`);
    if (name) name.setAttribute('aria-invalid', String(!String(item.name || '').trim()));
    if (qty) qty.setAttribute('aria-invalid', String(item.qty === '' || !Number.isInteger(item.qty) || item.qty <= 0));
    if (price) price.setAttribute('aria-invalid', String(item.price === '' || !Number.isFinite(item.price) || item.price < 0 || !validMoneyPrecision(item.price)));
  });
  const subtotal = calculateTotals().subtotal;
  const rawDiscount = Number($('discount').value);
  const discountInvalid = !Number.isFinite(rawDiscount) || rawDiscount < 0 || rawDiscount > subtotal || !validMoneyPrecision(rawDiscount);
  $('discount').setAttribute('aria-invalid', String(discountInvalid));
  if (rawDiscount < 0) errors.push('折扣不得為負數');
  else if (rawDiscount > subtotal) errors.push('折扣不得超過小計');
  else if (!validMoneyPrecision(rawDiscount)) errors.push(`${$('currency').value} 金額必須是${$('currency').value === 'TWD' ? '整數' : '小數點後最多 2 位'}`);

  const uniqueErrors = [...new Set(errors)];
  $('validationSummary').hidden = uniqueErrors.length === 0;
  $('validationSummary').textContent = uniqueErrors.join('；');
  $('saveHistoryBtn').disabled = uniqueErrors.length > 0;
  $('printBtn').disabled = uniqueErrors.length > 0;
  return uniqueErrors;
}

function renderItemsEditor() {
  $('itemsBody').innerHTML = state.items.map((item, index) => `
    <tr>
      <td><input aria-label="品名 ${index + 1}" value="${escapeHtml(item.name)}" data-index="${index}" data-key="name"></td>
      <td><input aria-label="數量 ${index + 1}" type="number" min="1" step="1" value="${escapeHtml(item.qty)}" data-index="${index}" data-key="qty"></td>
      <td><input aria-label="單價 ${index + 1}" type="number" min="0" step="${$('currency').value === 'TWD' ? '1' : '0.01'}" value="${escapeHtml(item.price)}" data-index="${index}" data-key="price"></td>
      <td class="item-subtotal" data-subtotal="${index}">${currencyFormat(item.qty * item.price)}</td>
      <td class="no-print"><button type="button" class="danger" data-delete="${index}" aria-label="刪除第 ${index + 1} 項">刪除</button></td>
    </tr>`).join('');
}

function paperText(id, value, fallback = '未填寫') {
  $(id).textContent = String(value || '').trim() || fallback;
}

function renderQuote() {
  const brand = $('brandName').value.trim() || '未命名公司';
  const logo = $('logoText').value.trim() || brand.slice(0, 2).toUpperCase();
  document.documentElement.style.setProperty('--brand', $('brandColor').value);
  paperText('brandNamePreview', brand);
  paperText('logoPreview', logo);
  paperText('paperBrand', brand);
  paperText('paperLogo', logo);
  paperText('paperQuoteNo', $('quoteNo').value);
  paperText('paperVersion', $('quoteVersion').value, 'v1');
  paperText('paperDate', localISO());
  paperText('paperValidUntil', $('validUntil').value);
  paperText('paperSeller', brand);
  paperText('paperSellerTaxId', $('sellerTaxId').value ? `統編：${$('sellerTaxId').value}` : '', '統編：未填寫');
  paperText('paperSellerContact', $('sellerContact').value);
  paperText('paperOwner', $('ownerName').value ? `負責人：${$('ownerName').value}` : '', '負責人：未填寫');
  paperText('paperCustomer', $('customerName').value);
  paperText('paperContactPerson', $('contactPerson').value ? `聯絡人：${$('contactPerson').value}` : '', '聯絡人：未填寫');
  paperText('paperEmail', $('customerEmail').value);
  paperText('paperCustomerTaxId', $('customerTaxId').value ? `統編：${$('customerTaxId').value}` : '', '統編：未填寫');
  paperText('paperServiceScope', $('serviceScope').value);
  paperText('paperExclusions', $('exclusions').value, '無');
  paperText('paperPaymentTerms', $('paymentTerms').value);
  paperText('paperNotes', $('notes').value, '無');
  paperText('paperTaxMode', taxDefinition().label);

  $('paperItems').innerHTML = state.items.map((item, index) => `
    <tr><td>${index + 1}</td><td>${escapeHtml(item.name || '未命名品項')}</td><td>${escapeHtml(item.qty)}</td><td>${currencyFormat(item.price)}</td><td>${currencyFormat(itemErrors(item, index).length ? 0 : item.qty * item.price)}</td></tr>`).join('');

  const totals = calculateTotals();
  $('subtotalText').textContent = currencyFormat(totals.subtotal);
  $('discountText').textContent = totals.discount > 0 ? `-${currencyFormat(totals.discount)}` : currencyFormat(0);
  $('taxText').textContent = currencyFormat(totals.tax);
  $('grandTotalText').textContent = currencyFormat(totals.grand);
  updateValidation();
}

function historyTotal(record) {
  const subtotal = record.items.reduce((sum, item) => sum + Math.max(0, readNumber(item.qty)) * Math.max(0, readNumber(item.price)), 0);
  const discount = Math.min(Math.max(0, readNumber(record.discount)), subtotal);
  const rate = taxDefinition(record.taxMode || (record.taxRate === '0.08' ? 'exclusive-8' : record.taxRate === '0' ? 'exempt' : 'exclusive-5')).rate;
  return (subtotal - discount) * (1 + rate);
}

function renderHistory() {
  const records = getHistory();
  $('historyList').innerHTML = records.length ? records.map((record, index) => `
    <article class="history-item">
      <div><strong>${escapeHtml(record.quoteNo)}</strong><span>${escapeHtml(record.customerName || '未命名客戶')} · ${escapeHtml(record.createdAt || '')}</span><span class="history-total">${currencyFormat(historyTotal(record), record.currency || 'TWD')}</span></div>
      <div class="history-actions"><button type="button" class="secondary" data-history="${index}">載入</button><button type="button" class="secondary" data-duplicate="${index}">複製</button><button type="button" class="danger" data-delete-history="${index}">刪除</button></div>
    </article>`).join('') : '<p class="subtle">尚無歷史報價。儲存後請匯出 JSON，避免瀏覽器資料遺失。</p>';
}

function snapshot() {
  const data = { schemaVersion: SCHEMA_VERSION, items: structuredClone(state.items), totals: calculateTotals() };
  fields.forEach(key => { data[key] = $(key).value; });
  return data;
}

function loadSnapshot(data, { duplicate = false } = {}) {
  fields.forEach(key => { if (data[key] !== undefined) $(key).value = data[key]; });
  if (data.taxRate !== undefined && data.taxMode === undefined) $('taxMode').value = data.taxRate === '0.08' ? 'exclusive-8' : data.taxRate === '0' ? 'exempt' : 'exclusive-5';
  state.items = Array.isArray(data.items) ? structuredClone(data.items) : [];
  if (duplicate) {
    $('quoteNo').value = nextQuoteNo();
    $('quoteVersion').value = 'v1';
  }
  sync();
}

function setStatus(message, error = false) {
  $('statusMessage').textContent = message;
  $('statusMessage').style.color = error ? 'var(--danger)' : 'var(--success)';
}

function saveHistory() {
  if (updateValidation().length) return setStatus('請先修正錯誤，才能儲存。', true);
  const record = snapshot();
  record.createdAt = new Date().toLocaleString('zh-TW');
  try {
    const records = getHistory();
    if (records.some(item => item.quoteNo === record.quoteNo)) return setStatus('報價單編號已存在，請改用新編號。', true);
    const updated = [record, ...records].slice(0, MAX_RECORDS);
    setHistory(updated);
    $('quoteNo').value = nextQuoteNo(updated);
    renderHistory();
    renderQuote();
    setStatus(`已儲存 ${record.quoteNo}；下一張已使用新流水號。`);
  } catch {
    setStatus('瀏覽器無法儲存資料，請立即匯出或檢查網站儲存權限。', true);
  }
}

function exportHistory() {
  const backup = { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), records: getHistory() };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `quotation-backup-${dateStamp()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`已匯出 ${backup.records.length} 筆 JSON 備份。`);
}

async function importHistory(file) {
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('too-large');
    const backup = JSON.parse(await file.text());
    if (backup.schemaVersion !== SCHEMA_VERSION || !Array.isArray(backup.records)) throw new Error('unsupported');
    const incoming = normalizeRecords(backup.records);
    if (incoming.length !== backup.records.length) throw new Error('invalid-record');
    const existing = getHistory();
    const seen = new Set(existing.map(record => record.quoteNo));
    const accepted = incoming.filter(record => {
      if (seen.has(record.quoteNo)) return false;
      seen.add(record.quoteNo);
      return true;
    });
    const skipped = incoming.length - accepted.length;
    const merged = [...existing, ...accepted].slice(0, MAX_RECORDS);
    setHistory(merged);
    renderHistory();
    if (!$('quoteNo').value || merged.some(record => record.quoteNo === $('quoteNo').value)) $('quoteNo').value = nextQuoteNo(merged);
    renderQuote();
    setStatus(`已匯入 ${accepted.length} 筆；略過 ${skipped} 筆編號重複；目前共有 ${merged.length} 筆。`);
  } catch {
    setStatus('匯入失敗：檔案須小於 5 MB，且必須是本工具匯出的 schemaVersion 1 JSON。', true);
  } finally {
    $('importInput').value = '';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function sync() {
  renderItemsEditor();
  renderQuote();
  renderHistory();
}

function loadSample() {
  loadSnapshot({
    brandName: '展示公司', logoText: 'DEMO', brandColor: '#0f4c81', sellerTaxId: '12345678', sellerContact: 'service@example.com', ownerName: '專案窗口',
    customerName: '範例客戶股份有限公司', contactPerson: '王小明', customerEmail: 'client@example.com', customerTaxId: '87654321', quoteNo: nextQuoteNo(), quoteVersion: 'v1',
    currency: 'TWD', taxMode: 'exclusive-5', discount: '1000', validUntil: $('validUntil').value, serviceScope: '需求訪談、Web 工具建置與操作說明。',
    exclusions: '正式環境帳號、第三方服務費及本次範圍外客製功能。', paymentTerms: '驗收後 30 日內付款', notes: '需求變更另行評估報價。',
    items: [{ name: 'AI 導入需求訪談', qty: 2, price: 3500 }, { name: '報價單 Web 工具建置', qty: 1, price: 18000 }, { name: '使用者教育訓練', qty: 1, price: 6000 }],
  });
  setStatus('已載入去識別範例資料。');
}

function initDates() {
  $('quoteNo').value = nextQuoteNo();
  const valid = new Date();
  valid.setDate(valid.getDate() + 14);
  $('validUntil').value = localISO(valid);
}

$('itemsBody').addEventListener('input', event => {
  const input = event.target;
  const index = Number(input.dataset.index);
  const key = input.dataset.key;
  if (!Number.isInteger(index) || !key) return;
  state.items[index][key] = key === 'name' ? input.value : input.value === '' ? '' : Number(input.value);
  const subtotalCell = document.querySelector(`[data-subtotal="${index}"]`);
  if (subtotalCell) subtotalCell.textContent = currencyFormat(itemErrors(state.items[index], index).length ? 0 : state.items[index].qty * state.items[index].price);
  renderQuote();
});

$('itemsBody').addEventListener('click', event => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  state.items.splice(Number(button.dataset.delete), 1);
  sync();
});

fields.forEach(id => $(id).addEventListener('input', () => {
  if (id === 'currency') renderItemsEditor();
  renderQuote();
}));
$('addItemBtn').addEventListener('click', () => { state.items.push({ name: '新產品', qty: 1, price: 0 }); sync(); });
$('saveHistoryBtn').addEventListener('click', saveHistory);
$('loadSampleBtn').addEventListener('click', loadSample);
$('clearBtn').addEventListener('click', () => { if (confirm('確定清空目前所有品項？')) { state.items = []; $('discount').value = 0; sync(); } });
$('printBtn').addEventListener('click', () => { if (!updateValidation().length) window.print(); });
$('exportBtn').addEventListener('click', exportHistory);
$('importInput').addEventListener('change', event => { if (event.target.files[0]) importHistory(event.target.files[0]); });
$('historyList').addEventListener('click', event => {
  const load = event.target.closest('[data-history]');
  const duplicate = event.target.closest('[data-duplicate]');
  const remove = event.target.closest('[data-delete-history]');
  const records = getHistory();
  if (load) { loadSnapshot(records[Number(load.dataset.history)]); setStatus('已載入歷史報價。'); }
  if (duplicate) { loadSnapshot(records[Number(duplicate.dataset.duplicate)], { duplicate: true }); setStatus('已複製成新報價，尚未儲存。'); }
  if (remove && confirm('確定刪除這筆歷史報價？')) { records.splice(Number(remove.dataset.deleteHistory), 1); setHistory(records); renderHistory(); renderQuote(); setStatus('已刪除歷史報價。'); }
});

initDates();
sync();
