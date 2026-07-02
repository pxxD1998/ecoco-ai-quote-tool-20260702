const state = {
  items: [
    { name: 'AI 導入顧問服務', qty: 1, price: 12000 },
    { name: '內部報價流程自動化設定', qty: 1, price: 8000 },
  ],
};

const $ = (id) => document.getElementById(id);
const fields = ['brandName','logoText','brandColor','customerName','customerEmail','quoteNo','currency','taxRate','discount','validUntil'];

function todayISO() {
  const date = new Date();
  return date.toISOString().slice(0, 10);
}

function nextQuoteNo() {
  const date = new Date();
  const stamp = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `QT-${stamp}-001`;
}

function currencyFormat(value) {
  const currency = $('currency').value;
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'TWD' ? 0 : 2,
  }).format(Number(value) || 0);
}

function readNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function renderItemsEditor() {
  $('itemsBody').innerHTML = state.items.map((item, index) => `
    <tr>
      <td><input aria-label="品名 ${index + 1}" value="${escapeHtml(item.name)}" data-index="${index}" data-key="name"></td>
      <td><input aria-label="數量 ${index + 1}" type="number" min="0" step="1" value="${item.qty}" data-index="${index}" data-key="qty"></td>
      <td><input aria-label="單價 ${index + 1}" type="number" min="0" step="1" value="${item.price}" data-index="${index}" data-key="price"></td>
      <td class="item-subtotal">${currencyFormat(item.qty * item.price)}</td>
      <td class="no-print"><button type="button" class="danger" data-delete="${index}">刪除</button></td>
    </tr>
  `).join('');
}

function renderQuote() {
  const brand = $('brandName').value.trim() || '未命名公司';
  const logo = $('logoText').value.trim() || brand.slice(0, 2).toUpperCase();
  const color = $('brandColor').value;
  document.documentElement.style.setProperty('--brand', color);

  $('brandNamePreview').textContent = brand;
  $('logoPreview').textContent = logo;
  $('paperBrand').textContent = brand;
  $('paperLogo').textContent = logo;
  $('paperQuoteNo').textContent = $('quoteNo').value;
  $('paperDate').textContent = todayISO();
  $('paperValidUntil').textContent = $('validUntil').value || '未設定';
  $('paperCustomer').textContent = $('customerName').value || '未填寫';
  $('paperEmail').textContent = $('customerEmail').value || '未填寫';

  $('paperItems').innerHTML = state.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.name || '未命名品項')}</td>
      <td>${item.qty}</td>
      <td>${currencyFormat(item.price)}</td>
      <td>${currencyFormat(item.qty * item.price)}</td>
    </tr>
  `).join('');

  const subtotal = state.items.reduce((sum, item) => sum + readNumber(item.qty) * readNumber(item.price), 0);
  const discount = Math.min(readNumber($('discount').value), subtotal);
  const taxable = Math.max(subtotal - discount, 0);
  const tax = taxable * readNumber($('taxRate').value);
  const grand = taxable + tax;

  $('subtotalText').textContent = currencyFormat(subtotal);
  $('discountText').textContent = `-${currencyFormat(discount)}`;
  $('taxText').textContent = currencyFormat(tax);
  $('grandTotalText').textContent = currencyFormat(grand);
}

function renderHistory() {
  const records = getHistory();
  $('historyList').innerHTML = records.length ? records.map((record, index) => `
    <div class="history-item">
      <div>
        <strong>${escapeHtml(record.quoteNo)}</strong>
        <span>${escapeHtml(record.customerName)} · ${escapeHtml(record.createdAt)}</span>
      </div>
      <button type="button" class="secondary" data-history="${index}">載入</button>
    </div>
  `).join('') : '<p class="subtle">尚無歷史報價。</p>';
}

function sync() {
  renderItemsEditor();
  renderQuote();
  renderHistory();
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem('quoteHistory') || '[]'); }
  catch { return []; }
}

function saveHistory() {
  const record = snapshot();
  record.createdAt = new Date().toLocaleString('zh-TW');
  const records = [record, ...getHistory()].slice(0, 8);
  localStorage.setItem('quoteHistory', JSON.stringify(records));
  renderHistory();
}

function snapshot() {
  const data = { items: structuredClone(state.items) };
  fields.forEach((key) => data[key] = $(key).value);
  return data;
}

function loadSnapshot(data) {
  fields.forEach((key) => { if (data[key] !== undefined) $(key).value = data[key]; });
  state.items = Array.isArray(data.items) && data.items.length ? data.items : [];
  sync();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
}

function loadSample() {
  loadSnapshot({
    brandName: 'ECOCO Demo', logoText: 'EC', brandColor: '#0f4c81',
    customerName: '王小明 / 測試客戶', customerEmail: 'client@example.com',
    quoteNo: nextQuoteNo(), currency: 'TWD', taxRate: '0.05', discount: '1000', validUntil: $('validUntil').value,
    items: [
      { name: 'AI 導入需求訪談', qty: 2, price: 3500 },
      { name: '報價單 Web 工具建置', qty: 1, price: 18000 },
      { name: '使用者教育訓練', qty: 1, price: 6000 },
    ],
  });
}

function initDates() {
  $('quoteNo').value = nextQuoteNo();
  const valid = new Date();
  valid.setDate(valid.getDate() + 14);
  $('validUntil').value = valid.toISOString().slice(0, 10);
}

$('itemsBody').addEventListener('input', (event) => {
  const input = event.target;
  const index = Number(input.dataset.index);
  const key = input.dataset.key;
  if (!Number.isInteger(index) || !key) return;
  state.items[index][key] = key === 'name' ? input.value : readNumber(input.value);
  renderQuote();
  renderItemsEditor();
});

$('itemsBody').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  state.items.splice(Number(button.dataset.delete), 1);
  sync();
});

fields.forEach((id) => $(id).addEventListener('input', renderQuote));
$('addItemBtn').addEventListener('click', () => { state.items.push({ name: '新產品', qty: 1, price: 0 }); sync(); });
$('saveHistoryBtn').addEventListener('click', saveHistory);
$('loadSampleBtn').addEventListener('click', loadSample);
$('clearBtn').addEventListener('click', () => { state.items = []; $('discount').value = 0; sync(); });
$('printBtn').addEventListener('click', () => window.print());
$('historyList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-history]');
  if (!button) return;
  const record = getHistory()[Number(button.dataset.history)];
  if (record) loadSnapshot(record);
});

initDates();
sync();
