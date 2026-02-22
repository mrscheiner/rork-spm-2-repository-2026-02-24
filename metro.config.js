const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude backend folder from Metro bundling completely
const backendPath = path.resolve(__dirname, 'backend');
config.resolver.blockList = [
  new RegExp(`^${backendPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/.*$`),
];

// Also exclude backend from watchFolders
config.watchFolders = config.watchFolders?.filter(f => !f.includes('backend')) || [];

module.exports = withRorkMetro(config);
