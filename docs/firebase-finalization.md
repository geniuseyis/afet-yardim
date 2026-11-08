# Firebase Finalizasyon Rehberi

Bu dokuman, production ortaminda Firestore izinleri ve index finalizasyonunu adim adim kapatmak icindir.

## 1) Rules ve index deploy

```bash
npx firebase-tools deploy --project <PROJECT_ID> --only firestore:rules
npx firebase-tools deploy --project <PROJECT_ID> --only firestore:indexes
```

Notlar:
- `firebase.json` icindeki `firestore.rules` ve `firestore.indexes.json` dosyalari kullanilir.
- Index deploy sonrasi Firestore Console > Indexes ekranindan `Building` durumlari bitene kadar bekleyin.

## 2) Kritik index kontrol listesi

Asagidaki query'ler icin composite index olmalidir:
- `requests(userId asc, createdAt desc)`
- `requests(createdBy asc, createdAt desc)`
- `requests(status asc, createdAt desc)`
- `requests(assignedVolunteerId asc, status asc, createdAt desc)`
- `users(role asc, updatedAt desc)`

## 3) Production izin dogrulama matrisi

### Victim
- Kendi `requests` dokumanlarini okuyabilir/yazabilir.
- Baska kullanicinin talebini okuyamaz.
- `announcements` okuyabilir.

### Volunteer (approved)
- `requests` koleksiyonunda operasyon taleplerini okuyabilir.
- Sadece kendi atandigi talepte status/timeline alanlarini guncelleyebilir.
- Kendi `volunteerApplications` dokumanlarini gorebilir.

### Coordinator
- Tum `requests`, `users`, `announcements`, `coordinator_notes`, `audit_logs` okuma yetkisi.
- Duyuru, rol, atama ve sistem ayari yazma yetkisi.

## 4) Permission-denied test adimlari

Her rol icin ayri hesapla test edin:
1. Login ol.
2. Ana ekran yuklenmesini dogrula.
3. Talepler listesi snapshot error logu var mi kontrol et.
4. Profil istatistikleri yukleniyor mu kontrol et.
5. Chat kanalina giris ve mesaj gonderme test et.

Beklenen sonuc:
- Yetkili ekranda `permission-denied` gorulmez.
- Yetkisiz islemde kontrollu hata mesaji gorulur ve uygulama akisi bozulmaz.

## 5) Rollback

Rules degisikligi canli ortamda beklenmedik etki verirse:
1. Son stabil `firestore.rules` commit'ini checkout edin.
2. Sadece rules deploy edin.
3. Incident notunu `audit_logs` / release notuna ekleyin.
