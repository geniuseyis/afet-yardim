# Release + Smoke Checklist (Android)

## 1) Preflight (Yerel)
- `npm run typecheck`
- `npm run preflight:release`
- `npm --prefix functions run build`

## 2) Firebase / Backend (Manuel)
- `firebase functions:secrets:set OPENAI_API_KEY`
- `firebase deploy --only functions`
- `firebase deploy --only firestore:rules,storage`
- `firebase deploy --only firestore:indexes`
- Coordinator kullanici provisioning (Auth + `users/{uid}` rol alanlari)

## 3) Mobil Smoke (Rol Bazli)
- Auth giris / kayit
- Consent/KVKK onayi
- Rol secimi (victim/volunteer)
- Victim talep olusturma
- Victim talep durumu ekrani
- Volunteer talep ustlenme / gorev takip
- Coordinator panel + talep yonetimi + duyuru
- Chat AI cevap (backend)
- Export / veri silme talebi acma

## 4) Push Smoke (Gercek Cihaz)
- Bildirim izni akisi
- `users/{uid}/devices` altina token kaydi
- `critical`, `operations`, `chat` channel kontrolu

## 5) Build
- `npm run build:android:preview`
- `npm run build:android:prod`
