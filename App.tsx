import React from "react";
import { LogBox } from "react-native";
import RootNavigator from "./src/navigation/RootNavigator";

// expo-av deprecation uyarısını gizle (SDK 54'te bilinen uyarı, uygulama çalışmaya devam eder)
LogBox.ignoreLogs([
  "[expo-av]",
  "Expo AV has been deprecated"
]);

export default function App() {
  return <RootNavigator />;
}
