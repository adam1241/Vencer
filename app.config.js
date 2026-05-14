// app.config.js - Expo config

const baseConfig = require('./app.json');

module.exports = ({ config }) => {
  return {
    ...config,
    ...baseConfig.expo,
    plugins: [
      ...(config.plugins || []),
      ...(baseConfig.expo.plugins || []),
    ],
    extra: {
      ...config.extra,
      ...baseConfig.expo.extra,
    },
  };
};
