// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Firebase v10+ paket.json "exports" alanını kullanır.
// Bu ayar olmadan Metro, React Native yerine Node.js kod yollarını seçer
// ve "crypto" gibi tarayıcı/Node.js özgü modülleri çözümlemeye çalışır.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
