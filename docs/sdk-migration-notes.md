# SDK Migration Notes

## 1) `expo-av` Degisim Plani

### Neden
- `expo-av` SDK 54 ile kaldirilacak.
- Ses/video katmanini simdiden ayirmak teknik borcu azaltir.

### Su anki Durum
- `src/services/audio.ts` dinamik fallback kullanir:
  - once `expo-audio`
  - yoksa `expo-av`

### Yapilacaklar
1. `expo-audio` ve `expo-video` paketlerini ekle
2. Ses oynatma cagrilarini tamamen `expo-audio` API'sine tasi
3. Video kullanimlari varsa `expo-video` API'sine tasi
4. `expo-av` bagimliligini kaldir

## 2) Push / Expo Go Limiti

### Durum
- Remote push testleri Expo Go'da kisitli.
- `src/services/notifications.ts` Expo Go tespitinde push register islemlerini atlar.

### Dogru Test Ortami
1. EAS development build al
2. Fiziksel cihazda test et
3. `users/{uid}/devices` token yazimini dogrula
4. `critical`, `operations`, `chat` channel kontrolu yap

## 3) Kontrol Listesi
- [ ] typecheck temiz
- [ ] push register loglari temiz
- [ ] crash init fallback/sentry dogrulandi
- [ ] play store preview build sorunsuz

