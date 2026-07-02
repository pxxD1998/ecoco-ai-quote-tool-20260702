# ECOCO 報價單快速產生器

這是 ECOCO AI 導入專員實地測試的任務二交付物：把每天約 30 分鐘的手工報價單流程，整理成可部署、可操作、可列印 PDF 的 Web 工具。

## Demo

- 部署網址：https://pxxd1998.github.io/ecoco-ai-quote-tool-20260702/
- Source Code：https://github.com/pxxD1998/ecoco-ai-quote-tool-20260702
- AI Coding 對話紀錄：[`AI_CODING_LOG.md`](./AI_CODING_LOG.md)

## 已完成功能對照

1. 新增 / 刪除產品
2. 品名、數量、單價欄位
3. 自動計算小計、稅額、總額
4. 報價單預覽畫面
5. 部署公開 URL
6. 繁體中文介面
7. PDF 下載 / 列印：使用瀏覽器列印功能另存 PDF
8. 5% / 8% 稅金切換，也支援免稅 / 另計
9. 客戶資料欄位：客戶名稱、Email
10. 套用 logo 縮寫與品牌顏色
11. 儲存歷史報價：使用瀏覽器 localStorage，資料不離開本機瀏覽器
12. 多幣別切換：TWD / USD
13. 折扣計算

## 技術選型

- 純 HTML / CSS / JavaScript
- 不需後端、不需資料庫、不需登入
- 可直接部署到 GitHub Pages

## 本機執行

```bash
python3 -m http.server 4173
```

然後開啟：

```text
http://127.0.0.1:4173/
```

## 設計取捨

這次限制是 1 小時內完成並準時交付，因此選擇最穩定的靜態網站：

- 優先讓主管可以立刻打開、試算、列印
- 避免導入後端、資料庫、登入系統造成部署風險
- 歷史報價先用 localStorage，符合 demo 與內部自用情境
- PDF 以瀏覽器列印另存 PDF 實作，減少外部套件依賴

如果後續正式產品化，下一步會補：帳號權限、雲端資料庫、報價單狀態流程、PDF 樣板控管、簽核與寄信紀錄。
