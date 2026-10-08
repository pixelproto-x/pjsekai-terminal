# Admin Control Center

這個目錄是 Project SEKAI｜玩家工具箱的私人管理後台。

## 架構

- Google OAuth：Supabase Auth
- 白名單：public.admin_users
- 權限：Owner / Admin / Viewer
- 權限強制：Supabase Row Level Security
- 操作紀錄：public.admin_logs
- 網站設定：public.site_settings
- 未授權：登入後立即導向 GitHub Pages 不存在的路徑，顯示原生 404
- 後台沒有一般網站導覽入口，並使用 noindex / nofollow

## 第一次啟用

1. 建立 Supabase Project。
2. 在 Supabase Authentication 啟用 Google Provider。Google OAuth 需要在 Google Cloud 建立 Web application OAuth Client，並把 Supabase 提供的 callback URL 設定為 Authorized redirect URI。Supabase 的 Auth URL Configuration 也要加入：
   `https://pixelproto-x.github.io/pjsekai-terminal/admin/`
3. 在 Supabase SQL Editor 執行 `schema.sql`。
4. 到 Supabase Authentication > Users，先用你的 Google 帳號登入一次，取得該帳號 UUID。
5. 執行 `schema.sql` 最下方的 Owner INSERT 範例，填入你的 UUID 與 Google Email。
6. 將 Supabase Project URL 與 anon/publishable key 填入 `config.js`：
   - `supabaseUrl`
   - `supabaseAnonKey`
7. 再開啟 `/admin/`。白名單內的帳號才會進入 Dashboard。

## 安全

不要把 Supabase service-role key 放入 `config.js`、GitHub Repository 或任何前端檔案。

Supabase 的 OAuth redirect URL 必須加入允許清單；正式環境建議使用精確的 HTTPS URL。

## 目前已做好的後台區域

- Dashboard
- API Status
- 使用者白名單與角色
- Dojo 控制
- 資料中心
- Error Center
- Analytics 殼層
- 網站設定
- Audit Log

Analytics 與全站 Error Center 的「跨所有訪客」資料收集尚未接到主站；目前後台只顯示本次管理工作階段錯誤與本機統計，不會自行收集訪客資料。
