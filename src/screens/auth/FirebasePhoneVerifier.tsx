/**
 * expo-firebase-recaptcha, expo-firebase-core (Firebase v8 compat) gerektirdiğinden
 * Firebase v12 ile çalışmıyor. Bu dosya aynı mantığı expo-firebase-core olmadan uygular:
 * - react-native-webview ile Firebase compat CDN üzerinden reCAPTCHA alır
 * - ApplicationVerifier interface'ini implement eder (type + verify())
 * - signInWithPhoneNumber ile doğrudan kullanılabilir
 */
import React, { Component } from "react";
import {
  ActivityIndicator,
  Button,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

function buildRecaptchaHtml(firebaseConfig: object, invisible: boolean): string {
  const configJson = JSON.stringify(firebaseConfig);
  const btnId = invisible ? "recaptcha-btn" : "recaptcha-cont";
  const size = invisible ? "invisible" : "normal";
  return `<!DOCTYPE html><html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
  <script>firebase.initializeApp(${configJson});</script>
  <style>
    html,body{height:100%;${invisible ? "padding:0;margin:0;" : ""}}
    #recaptcha-btn{width:100%;height:100%;padding:0;margin:0;border:0;}
  </style>
</head>
<body>
  ${invisible
    ? `<button id="recaptcha-btn" type="button" onclick="onClickButton()">Verify</button>`
    : `<div id="recaptcha-cont"></div>`}
  <script>
    function onVerify(token){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'verify',token:token}));
    }
    function onLoad(){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'load'}));
      window.recaptchaVerifier=new firebase.auth.RecaptchaVerifier("${btnId}",{
        size:"${size}",callback:onVerify
      });
      window.recaptchaVerifier.render();
    }
    function onError(){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'error'}));
    }
    function onClickButton(){
      if(window.recaptchaVerifier){
        window.recaptchaVerifier.verify().then(onVerify).catch(onError);
      }
    }
    window.addEventListener('message',function(e){
      if(e.data&&e.data.verify){document.getElementById('${btnId}').click();}
    });
  </script>
  <script src="https://www.google.com/recaptcha/api.js?onload=onLoad&render=explicit" onerror="onError()"></script>
</body></html>`;
}

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  [key: string]: string;
}

interface Props {
  firebaseConfig: FirebaseConfig;
  attemptInvisibleVerification?: boolean;
  title?: string;
  cancelLabel?: string;
}

interface State {
  visible: boolean;
  visibleLoaded: boolean;
  invisibleLoaded: boolean;
  invisibleVerify: boolean;
  invisibleKey: number;
  resolve?: (token: string) => void;
  reject?: (err: Error) => void;
}

export class FirebasePhoneVerifierModal extends Component<Props, State> {
  static defaultProps = { title: "reCAPTCHA", cancelLabel: "İptal" };

  state: State = {
    visible: false,
    visibleLoaded: false,
    invisibleLoaded: false,
    invisibleVerify: false,
    invisibleKey: 1,
  };

  get type() {
    return "recaptcha";
  }

  async verify(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.props.attemptInvisibleVerification) {
        this.setState({ invisibleVerify: true, resolve, reject });
      } else {
        this.setState({ visible: true, visibleLoaded: false, resolve, reject });
      }
    });
  }

  // Firebase Auth SDK bu metodu çağırabilir
  _reset() {}

  private onVisibleLoad = () => this.setState({ visibleLoaded: true });
  private onInvisibleLoad = () => this.setState({ invisibleLoaded: true });

  private onFullChallenge = () =>
    this.setState({ invisibleVerify: false, visible: true });

  private onError = () => {
    this.state.reject?.(new Error("reCAPTCHA yüklenemedi"));
    this.setState({ visible: false, invisibleVerify: false });
  };

  private onVerify = (token: string) => {
    this.state.resolve?.(token);
    this.setState((s) => ({
      visible: false,
      invisibleVerify: false,
      invisibleLoaded: false,
      invisibleKey: s.invisibleKey + 1,
    }));
  };

  private cancel = () => {
    this.state.reject?.(new Error("Kullanıcı iptal etti"));
    this.setState({ visible: false });
  };

  private handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "load") {
        if (this.state.visible) this.onVisibleLoad();
        else this.onInvisibleLoad();
      } else if (data.type === "verify") {
        this.onVerify(data.token);
      } else if (data.type === "fullChallenge") {
        this.onFullChallenge();
      } else if (data.type === "error") {
        this.onError();
      }
    } catch {}
  };

  private injectVerify(webviewRef: WebView | null) {
    (webviewRef as any)?.injectJavaScript?.(
      `(function(){window.dispatchEvent(new MessageEvent('message',{data:{verify:true}}));})();true;`
    );
  }

  invisibleWebViewRef: WebView | null = null;

  componentDidUpdate(_: Props, prev: State) {
    const { invisibleLoaded, invisibleVerify } = this.state;
    if (invisibleLoaded && invisibleVerify && !prev.invisibleVerify) {
      this.injectVerify(this.invisibleWebViewRef);
    }
  }

  render() {
    const { firebaseConfig, attemptInvisibleVerification, title, cancelLabel } = this.props;
    const { visible, visibleLoaded, invisibleLoaded, invisibleVerify, invisibleKey } = this.state;
    const baseUrl = `https://${firebaseConfig.authDomain}`;

    return (
      <View style={styles.container}>
        {attemptInvisibleVerification && (
          <WebView
            key={`inv-${invisibleKey}`}
            ref={(r) => { this.invisibleWebViewRef = r; }}
            style={styles.invisible}
            javaScriptEnabled
            originWhitelist={["*"]}
            source={{ html: buildRecaptchaHtml(firebaseConfig, true), baseUrl }}
            onMessage={this.handleMessage}
          />
        )}
        <Modal
          visible={visible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={this.cancel}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.cancelBtn}>
                <Button title={cancelLabel!} onPress={this.cancel} />
              </View>
            </View>
            <View style={styles.content}>
              <WebView
                javaScriptEnabled
                originWhitelist={["*"]}
                source={{ html: buildRecaptchaHtml(firebaseConfig, false), baseUrl }}
                onMessage={this.handleMessage}
              />
              {!visibleLoaded && (
                <View style={styles.loader}>
                  <ActivityIndicator size="large" />
                </View>
              )}
            </View>
          </SafeAreaView>
        </Modal>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { width: 0, height: 0 },
  invisible: { width: 300, height: 300 },
  modalContainer: { flex: 1 },
  header: {
    backgroundColor: "#FBFBFB",
    height: 44,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderBottomColor: "#CECECE",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: { position: "absolute", left: 8, justifyContent: "center" },
  title: { fontWeight: "bold" },
  content: { flex: 1 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 20,
    justifyContent: "flex-start",
    alignItems: "center",
  },
});
