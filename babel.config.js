/**
 * Babel configuration.
 *
 * `react-native-worklets/plugin` is required by Reanimated 4 and MUST be last
 * in the plugin list -- it rewrites the functions marked to run on the UI
 * thread, and any plugin running after it would transform code it has already
 * finalised.
 *
 * Reanimated is what keeps press feedback and list animations smooth while the
 * JS thread is busy compressing a form photo, so this is load-bearing rather
 * than decoration.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
