/**
 * Firebase Phone Auth — tam WebView içi akış.
 *
 * Neden bu yaklaşım?
 *  React Native context'inden signInWithPhoneNumber çağırmak auth/operation-not-allowed
 *  hatasına yol açar: Firebase geçerli bir web origin görmez.
 *  WebView'e baseUrl olarak authDomain verildiğinde Firebase bu domain'i tanır ve
 *  SMS göndermeye izin verir.
 *
 * Nasıl çalışır?
 *  1. Görünmez bir WebView, Firebase v8 compat SDK ile yüklenir.
 *  2. RN → WebView: injectJavaScript ile {type:'sendCode'} / {type:'verifyCode'} mesajları.
 *  3. WebView → RN: postMessage ile {type:'codeSent'} / {type:'verified', token} / {type:'error'}.
 *  4. Doğrulama başarılıysa WebView, ikincil Firebase kullanıcısının ID token'ını gönderir.
 *  5. PhoneVerificationScreen bu token'ı backend'e ileterek phoneVerifiedAt kaydeder.
 */
import React, { Component } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

function buildAuthHtml(firebaseConfig: object): string {
  return `<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
  <script>
    firebase.initializeApp(${JSON.stringify(firebaseConfig)});
    var fbAuth = firebase.auth();
    var recaptchaVerifier = null;
    var confirmationResult = null;

    function rn(data) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }

    function initRecaptcha() {
      try {
        // reCAPTCHA WebView'de çalışmadığı için test modunu aç.
        // Firebase Console'da test numarası tanımlıysa bu mod gerçek SMS yerine
        // tanımlı kodu kullanır. Production'da bu satırı kaldır.
        fbAuth.settings.appVerificationDisabledForTesting = true;
        recaptchaVerifier = new firebase.auth.RecaptchaVerifier(
          'rc-container',
          { size: 'invisible', callback: function() {} }
        );
        rn({ type: 'ready' });
      } catch(e) {
        rn({ type: 'error', code: 'recaptcha-init', message: e.message });
      }
    }

    function sendCode(phone) {
      if (!recaptchaVerifier) {
        rn({ type: 'error', code: 'no-recaptcha', message: 'reCAPTCHA henuz hazir degil.' });
        return;
      }
      fbAuth.signInWithPhoneNumber(phone, recaptchaVerifier)
        .then(function(result) {
          confirmationResult = result;
          rn({ type: 'codeSent' });
        })
        .catch(function(err) {
          // reCAPTCHA süresi dolmuşsa sıfırla
          if (recaptchaVerifier) {
            try { recaptchaVerifier.clear(); } catch(_) {}
            recaptchaVerifier = null;
          }
          rn({ type: 'error', code: err.code, message: err.message });
        });
    }

    function verifyCode(code) {
      if (!confirmationResult) {
        rn({ type: 'error', code: 'no-confirmation', message: 'Once kod gonderin.' });
        return;
      }
      confirmationResult.confirm(code)
        .then(function(result) {
          return result.user.getIdToken();
        })
        .then(function(token) {
          rn({ type: 'verified', token: token });
        })
        .catch(function(err) {
          rn({ type: 'error', code: err.code, message: err.message });
        });
    }

    // React Native'den gelen mesajları dinle
    document.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'sendCode') sendCode(msg.phone);
        if (msg.type === 'verifyCode') verifyCode(msg.code);
        if (msg.type === 'reset') { confirmationResult = null; initRecaptcha(); }
      } catch(_) {}
    });
    window.addEventListener('message', function(e) {
      try {
        var msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (msg.type === 'sendCode') sendCode(msg.phone);
        if (msg.type === 'verifyCode') verifyCode(msg.code);
        if (msg.type === 'reset') { confirmationResult = null; initRecaptcha(); }
      } catch(_) {}
    });

    window.onload = function() { initRecaptcha(); };
  </script>
</head>
<body><div id="rc-container"></div></body></html>`;
}

export interface FirebasePhoneAuthWebViewRef {
  sendCode(phoneE164: string): void;
  verifyCode(code: string): void;
  reset(): void;
}

interface Props {
  firebaseConfig: { authDomain: string;[key: string]: string };
  onReady(): void;
  onCodeSent(): void;
  onVerified(phoneIdToken: string): void;
  onError(code: string, message: string): void;
}

export class FirebasePhoneAuthWebView
  extends Component<Props>
  implements FirebasePhoneAuthWebViewRef
{
  private webviewRef: WebView | null = null;

  sendCode(phoneE164: string) {
    this.inject({ type: "sendCode", phone: phoneE164 });
  }

  verifyCode(code: string) {
    this.inject({ type: "verifyCode", code });
  }

  reset() {
    this.inject({ type: "reset" });
  }

  private inject(data: object) {
    const js = `(function(){
      window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(JSON.stringify(data))}}));
    })();true;`;
    this.webviewRef?.injectJavaScript(js);
  }

  private handleMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
        case "ready":    this.props.onReady(); break;
        case "codeSent": this.props.onCodeSent(); break;
        case "verified": this.props.onVerified(msg.token); break;
        case "error":    this.props.onError(msg.code || "unknown", msg.message || "Bilinmeyen hata"); break;
      }
    } catch {}
  };

  render() {
    const { firebaseConfig } = this.props;
    return (
      <View style={{ width: 0, height: 0, opacity: 0 }}>
        <WebView
          ref={(r) => { this.webviewRef = r; }}
          javaScriptEnabled
          originWhitelist={["*"]}
          source={{
            html: buildAuthHtml(firebaseConfig),
            baseUrl: `https://${firebaseConfig.authDomain}`,
          }}
          onMessage={this.handleMessage}
          style={{ width: 1, height: 1 }}
        />
      </View>
    );
  }
}
