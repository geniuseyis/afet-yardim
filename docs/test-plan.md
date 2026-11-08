# Test Plan (MVP)

## Backend
- [x] Domain/unit testleri (role resolution, urgency scoring, risk detection, action->status mapping)
- [x] Auth guard unit testleri (`mustAuth`)
- [ ] Callable auth guard testleri (function/emulator seviyesi)
- [ ] Talep atamada race-condition testi (emulator)
- [ ] Status transition yetki testi (volunteer/coordinator)
- [ ] AI chat escalation testi (risk keyword) - function seviyesinde entegrasyon testi
- [x] Emulator test scaffold (skip'li iskelet + script)
- [x] İlk gerçek emulator test implementasyonu (unauthenticated `createRequest` callable senaryosu; emulator varsa calisir)

### Mevcut backend unit test dosyalari
- `functions/src/domain.test.ts`
- `functions/src/guards.test.ts`
- `functions/src/risk.test.ts`

### Emulator scaffold dosyalari
- `functions/src/callables.emulator.test.ts`
- `functions/src/emulatorTestUtils.ts`

### Emulator test komutu
- `npm --prefix functions run test:emulator`
- `npm --prefix functions run test:emulator:exec` (functions + firestore + auth emulator ile)

### Emulator notlari
- Auth guard / callable testleri icin `auth` emulator gerekecek
- Race-condition testleri icin ayni request uzerinde parallel claim senaryosu calistirilacak
- `callables.emulator.test.ts` icinde auth'suz `createRequest` testi implement edildi
- Diger senaryolar (status transition / race / chat escalation) halen skip scaffold durumunda

## Mobil
- Consent gate acilis testi
- Role bazli navigasyon testi
- Talep olusturma -> durum ekrani testi
- Push token kaydi hata toleransi testi

## Kabul Kriteri Smoke
- Coordinator backend yazma islemleri function uzerinden calisir
- Chat bot backend AI cevabi doner
- Kullanici export/silme talebi acabilir
