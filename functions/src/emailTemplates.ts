// ─── Afet Yardım — E-posta Şablonları ────────────────────────────────────────
// Tüm mailler afetyardim.bildirim@gmail.com'dan "Afet Yardım" adıyla gönderilir.

const BASE_STYLES = `
  body { margin:0; padding:0; background:#0a0508; font-family:'Segoe UI',Arial,sans-serif; }
  a { color:#ef4444; text-decoration:none; }
`;

const header = () => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0508; padding:32px 0 0 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px; width:100%;">
      <tr>
        <td align="center" style="padding-bottom:24px;">
          <!-- Logo / Marka -->
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:linear-gradient(135deg,#c1121f,#9f0d18); border-radius:20px; padding:14px 28px; display:inline-block;">
                <span style="color:white; font-size:22px; font-weight:800; letter-spacing:0.5px;">🆘 Afet Yardım</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
`;

const footer = () => `
      <!-- Alt bilgi -->
      <tr>
        <td align="center" style="padding:28px 24px 36px 24px;">
          <p style="margin:0 0 6px 0; color:#6b7280; font-size:11px; line-height:1.6;">
            Bu e-posta <strong style="color:#9ca3af;">Afet Yardım</strong> sistemi tarafından otomatik gönderilmiştir.
          </p>
          <p style="margin:0; color:#4b5563; font-size:11px;">
            Lütfen bu mesajı yanıtlamayın · afetyardim.bildirim@gmail.com
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
`;

export const emailVerificationTemplate = (verificationUrl: string, email: string) => `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>E-posta Doğrulama — Afet Yardım</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
${header()}

      <!-- Ana Kart -->
      <tr>
        <td style="background:#140a0d; border:1px solid #2d1119; border-radius:24px; overflow:hidden;">

          <!-- Üst şerit -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:linear-gradient(90deg,#c1121f 0%,#9f0d18 50%,#7b0c1c 100%); height:5px;"></td>
            </tr>
          </table>

          <!-- İkon + Başlık -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:40px 32px 20px 32px;">
                <div style="width:80px; height:80px; background:rgba(193,18,31,0.15); border:1.5px solid rgba(193,18,31,0.35); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:20px;">
                  <span style="font-size:36px; line-height:80px; display:block;">✉️</span>
                </div>
                <h1 style="margin:0 0 10px 0; color:#fff1f2; font-size:26px; font-weight:800; letter-spacing:-0.5px;">
                  E-postanı Doğrula
                </h1>
                <p style="margin:0; color:#fda4af; font-size:15px; line-height:1.6;">
                  Merhaba! <strong style="color:#fecdd3;">${email}</strong> adresi için<br/>
                  Afet Yardım hesabı oluşturuldu.
                </p>
              </td>
            </tr>
          </table>

          <!-- Açıklama -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 32px 28px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:16px 20px;">
                  <tr>
                    <td>
                      <p style="margin:0; color:#fecdd3; font-size:14px; line-height:1.7;">
                        Hesabını aktif etmek için aşağıdaki butona tıkla. Bağlantı <strong style="color:#fff1f2;">24 saat</strong> geçerlidir.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- CTA Butonu -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:0 32px 32px 32px;">
                <a href="${verificationUrl}"
                   style="display:inline-block; background:linear-gradient(135deg,#c1121f,#9f0d18); color:white; text-decoration:none; font-size:16px; font-weight:700; padding:16px 48px; border-radius:14px; letter-spacing:0.3px; box-shadow:0 4px 24px rgba(193,18,31,0.4);">
                  ✅ Hesabımı Doğrula
                </a>
              </td>
            </tr>
          </table>

          <!-- Uyarı kutusu -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(193,18,31,0.08); border:1px solid rgba(193,18,31,0.2); border-radius:12px; padding:14px 18px;">
                  <tr>
                    <td>
                      <p style="margin:0 0 5px 0; color:#fca5a5; font-size:12px;">📬 Spam / Gereksiz klasörünü kontrol et.</p>
                      <p style="margin:0 0 5px 0; color:#fca5a5; font-size:12px;">🔒 Bu isteği yapmadıysan bu e-postayı yoksay.</p>
                      <p style="margin:0; color:#fca5a5; font-size:12px;">⏰ Bağlantı 24 saat sonra geçersiz olur.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Ayırıcı -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:1px; background:rgba(255,255,255,0.06);"></td></tr>
          </table>

          <!-- Alt not -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:20px 32px;">
                <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.7;">
                  Türkiye'nin Afet Destek Platformu · <span style="color:#9f1239;">Afet Yardım</span>
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>

${footer()}
</body>
</html>
`;

export const passwordResetTemplate = (resetUrl: string, email: string) => `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Şifre Sıfırlama — Afet Yardım</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
${header()}

      <!-- Ana Kart -->
      <tr>
        <td style="background:#140a0d; border:1px solid #2d1119; border-radius:24px; overflow:hidden;">

          <!-- Üst şerit (turuncu — uyarı tonu) -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:linear-gradient(90deg,#d97706 0%,#b45309 50%,#92400e 100%); height:5px;"></td>
            </tr>
          </table>

          <!-- İkon + Başlık -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:40px 32px 20px 32px;">
                <div style="width:80px; height:80px; background:rgba(217,119,6,0.15); border:1.5px solid rgba(217,119,6,0.35); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:20px;">
                  <span style="font-size:36px; line-height:80px; display:block;">🔐</span>
                </div>
                <h1 style="margin:0 0 10px 0; color:#fff1f2; font-size:26px; font-weight:800; letter-spacing:-0.5px;">
                  Şifre Sıfırlama
                </h1>
                <p style="margin:0; color:#fda4af; font-size:15px; line-height:1.6;">
                  <strong style="color:#fecdd3;">${email}</strong> hesabı için<br/>
                  şifre sıfırlama talebi aldık.
                </p>
              </td>
            </tr>
          </table>

          <!-- Açıklama -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 32px 28px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:16px 20px;">
                  <tr>
                    <td>
                      <p style="margin:0; color:#fecdd3; font-size:14px; line-height:1.7;">
                        Yeni şifre belirlemek için aşağıdaki butona tıkla. Bağlantı <strong style="color:#fcd34d;">1 saat</strong> geçerlidir.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- CTA Butonu -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:0 32px 32px 32px;">
                <a href="${resetUrl}"
                   style="display:inline-block; background:linear-gradient(135deg,#d97706,#b45309); color:white; text-decoration:none; font-size:16px; font-weight:700; padding:16px 48px; border-radius:14px; letter-spacing:0.3px; box-shadow:0 4px 24px rgba(217,119,6,0.4);">
                  🔑 Şifremi Sıfırla
                </a>
              </td>
            </tr>
          </table>

          <!-- Güvenlik uyarısı -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(217,119,6,0.08); border:1px solid rgba(217,119,6,0.22); border-radius:12px; padding:14px 18px;">
                  <tr>
                    <td>
                      <p style="margin:0 0 5px 0; color:#fcd34d; font-size:12px;">⚠️ Bu talebi sen yapmadıysan bu e-postayı yoksay — şifren değişmez.</p>
                      <p style="margin:0 0 5px 0; color:#fcd34d; font-size:12px;">⏰ Bağlantı 1 saat sonra geçersiz olur.</p>
                      <p style="margin:0; color:#fcd34d; font-size:12px;">🔒 Bağlantıyı kimseyle paylaşma.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Ayırıcı -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:1px; background:rgba(255,255,255,0.06);"></td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:20px 32px;">
                <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.7;">
                  Türkiye'nin Afet Destek Platformu · <span style="color:#9f1239;">Afet Yardım</span>
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>

${footer()}
</body>
</html>
`;
