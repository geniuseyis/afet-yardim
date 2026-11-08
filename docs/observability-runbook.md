# Observability Runbook

## Amaç
- Uygulama hatalarini erken yakalamak
- Rol bazli kritik akislari olay/event olarak izlemek
- Demo ve prod ortaminda ayni loglama dilini korumak

## Mevcut Durum
- `src/services/telemetry.ts` istemci olaylarini `client_events` koleksiyonuna yazar.
- `src/services/crash.ts`:
  - `@sentry/react-native` kurulu + DSN varsa Sentry kullanir.
  - Aksi halde telemetry fallback ile devam eder.
- `RootNavigator` baslangicta crash katmanini init eder.

## Kritik Olaylar (Takip Edilecek)
- `auth_login_success`
- `auth_login_fail`
- `role_selected`
- `request_created`
- `request_status_changed`
- `chat_message_sent`
- `sos_triggered`
- `consent_accepted`

## Hata Siniflandirmasi
- `error`: akisi bozan hatalar (permission, network, write fail)
- `warning`: geri donulebilir hatalar (fallback, cache miss)
- `info`: kullanici akisini etkilemeyen teknik bilgi

## Sentry Aktiflestirme
1. `npm i @sentry/react-native`
2. `app.json` veya EAS env icine `sentryDsn` ekle
3. Uygulamayi yeniden build et
4. Test hatasi gonderimi yap:
   - login akisinda bilincli yakalanan exception ile kontrol et

## Production Kontrol
- Her release sonrasi ilk 24 saat:
  - crash-free session
  - permission-denied oranlari
  - request create / assign / close event sayilari

