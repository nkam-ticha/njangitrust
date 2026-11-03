// Expo detects the pnpm workspace and watches packages/* automatically.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
