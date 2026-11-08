# Prod E2E Dogrulama (Afetzede / Gönüllü / Yönetici)

## Hazirlik
- Gercek Firebase project secili.
- Firestore rules/index deploy edilmis.
- En az 1 victim, 1 approved volunteer, 1 coordinator hesabi hazir.
- Uygulama release benzeri build ile calisiyor (Expo Go degil, dev build veya preview build).

## A) Afetzede akisi
1. Giris + telefon dogrulama gec.
2. Talep olustur (open) ve kaydedildigini `requests`'te kontrol et.
3. Talep durumu ekraninda timeline'in realtime guncellendigini dogrula.
4. SOS butonundan:
   - 112 dial aciliyor mu
   - SMS composer aciliyor mu
   - `sos_logs` yaziliyor mu

## B) Gönüllü akisi
1. Onboarding tamamla (`volunteerStatus=submitted/approved`).
2. Available Missions listesi aciliyor mu.
3. Basvuru yapinca `volunteerApplications` dokumani `pending` oluyor mu.
4. Onayli volunteer ile gorev ustlenme/takip akisi calisiyor mu.
5. Chat kanalinda mesaj + read receipt calisiyor mu.

## C) Yönetici akisi
1. Dashboard KPI verileri yukleniyor mu.
2. Gönüllü yonetim listesi permission hatasi vermeden aciliyor mu.
3. Basvuru onay/reject islemi Firestore'a yaziliyor mu.
4. Talep atama ve status transition calisiyor mu.
5. Duyuru yayinla -> victim/volunteer tarafinda gorunuyor mu.

## D) Negatif senaryolar
- Victim baska kullanicinin talebini okuyamasin.
- Volunteer baska volunteer atamasini degistiremesin.
- Coordinator olmayan kullanici admin koleksiyonlarina yazamasin.

## E) Basari kriteri
- Kritik akislarda crash yok.
- Permission-denied sadece beklenen yetkisiz aksiyonlarda gorunuyor.
- Tost/hata mesaji kullaniciyi akistan dusurmuyor.
