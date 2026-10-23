/**
 * Bundle the real app for the browser with React Native Web.
 *
 * Output goes to dist/ (gitignored): index.html, app.js, the sql.js wasm and
 * the Archivo files the Android build ships in res/font.
 *
 *   node build.js
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const HERE = __dirname;
const APP = path.resolve(HERE, '../../..');
const DIST = path.join(HERE, 'dist');
const SHIMS = path.join(HERE, 'shims');
const APP_MODULES = path.join(APP, 'node_modules');
const OWN_MODULES = path.join(HERE, 'node_modules');

/** Native modules with no browser build, and what stands in for each. */
const NATIVE_SHIMS = {
  '@notifee/react-native': 'notifee.js',
  'react-native-sqlite-storage': 'sqlite-storage.js',
  'react-native-purchases': 'purchases.js',
  '@react-native-google-signin/google-signin': 'google-signin.js',
  'expo-apple-authentication': 'apple-authentication.js',
  'react-native-keep-awake': 'keep-awake.js',
  'react-native-restart': 'restart.js',
  'expo-localization': 'localization.js',
};

/** The app's own code, which sees Android; everything else sees the web. */
const isAppSource = (file) =>
  !!file &&
  !file.includes(`${path.sep}node_modules${path.sep}`) &&
  (file.startsWith(path.join(APP, 'src') + path.sep) ||
    file === path.join(APP, 'App.tsx') ||
    file === path.join(APP, 'index.js'));

const resolver = {
  name: 'kegelee-web',
  setup(build) {
    // One React. The app's copy is the one its libraries were installed
    // against; react-dom lives here and must use the same instance.
    build.onResolve({ filter: /^react(\/.*)?$/ }, (args) => ({
      path: require.resolve(args.path, { paths: [APP_MODULES] }),
    }));
    build.onResolve({ filter: /^react-dom(\/.*)?$/ }, (args) => ({
      path: require.resolve(args.path, { paths: [OWN_MODULES] }),
    }));

    build.onResolve({ filter: /^react-native$/ }, (args) =>
      isAppSource(args.importer)
        ? { path: path.join(SHIMS, 'react-native.js') }
        : { path: require.resolve('react-native-web', { paths: [OWN_MODULES] }) },
    );
    build.onResolve({ filter: /^react-native-web$/ }, () => ({
      path: require.resolve('react-native-web', { paths: [OWN_MODULES] }),
    }));

    build.onResolve({ filter: /^@react-navigation\/native$/ }, (args) =>
      args.importer === path.join(APP, 'App.tsx')
        ? { path: path.join(SHIMS, 'navigation-native.js') }
        : undefined,
    );

    // The phone's insets for the app's own hook and SafeAreaView; libraries
    // keep the real module (and its provider) untouched.
    build.onResolve({ filter: /^react-native-safe-area-context$/ }, (args) =>
      isAppSource(args.importer) ? { path: path.join(SHIMS, 'safe-area-context.js') } : undefined,
    );

    const names = Object.keys(NATIVE_SHIMS).map((n) => n.replace(/[/\-.@]/g, '\\$&'));
    build.onResolve({ filter: new RegExp(`^(${names.join('|')})$`) }, (args) => ({
      path: path.join(SHIMS, NATIVE_SHIMS[args.path]),
    }));

    /**
     * Text does not shrink, as on the phone.
     *
     * Yoga gives every node flexShrink 0. React Native Web sets that on View
     * but leaves Text at the CSS default of 1, so a label in a full column -
     * every tab-bar label, for one - is squeezed below its own line height
     * and clipped, where the phone draws it whole.
     */
    build.onLoad({ filter: /react-native-web[\\/]dist[\\/](cjs[\\/])?exports[\\/]Text[\\/]index\.js$/ }, (args) => {
      const source = fs.readFileSync(args.path, 'utf8');
      const patched = source.replace(
        "wordWrap: 'break-word'\n};",
        "wordWrap: 'break-word',\n  flexShrink: 0\n};",
      );
      if (patched === source) throw new Error('react-native-web Text styles changed; update the flexShrink patch');
      return { contents: patched, loader: 'js' };
    });
  },
};

/** Android's res/font files, and the weight each one is registered at. */
const ARCHIVO = [
  ['Archivo', 400, 'archivo_regular.ttf'],
  ['Archivo', 500, 'archivo_medium.ttf'],
  ['Archivo', 600, 'archivo_semibold.ttf'],
  ['Archivo', 700, 'archivo_bold.ttf'],
  ['Archivo', 800, 'archivo_extrabold.ttf'],
  ['ArchivoExpanded', 700, 'archivo_expanded_bold.ttf'],
  ['ArchivoExpanded', 800, 'archivo_expanded_extrabold.ttf'],
  ['ArchivoExpanded', 900, 'archivo_expanded_black.ttf'],
];

/**
 * Scripts Archivo does not cover, and the system faces Android falls back to
 * for them. Declared AFTER Archivo inside the same family, at the same weight,
 * so each character in these ranges is drawn from the fallback - the browser
 * checks the last-declared face first - and every other character from
 * Archivo. CJK is added per language by index.html, because the same
 * codepoints take Japanese, Korean or Simplified Chinese forms.
 */
const FALLBACKS = [
  {
    range: 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF',
    regular: 'Noto Naskh Arabic Regular',
    bold: 'Noto Naskh Arabic Bold',
  },
  { range: 'U+0590-05FF, U+FB1D-FB4F', regular: 'Noto Sans Hebrew Regular', bold: 'Noto Sans Hebrew Bold' },
  {
    range: 'U+0900-097F, U+1CD0-1CFF, U+A8E0-A8FF',
    regular: 'Noto Sans Devanagari Regular',
    bold: 'Noto Sans Devanagari Bold',
  },
  { range: 'U+0E00-0E7F', regular: 'Noto Sans Thai Regular', bold: 'Noto Sans Thai Bold' },
  {
    range: 'U+0400-052F, U+1C80-1C8F, U+2DE0-2DFF, U+A640-A69F',
    regular: 'Roboto',
    medium: 'Roboto Medium',
    bold: 'Roboto Bold',
    black: 'Roboto Black',
  },
];

const faceFor = (fb, weight) =>
  weight >= 900 ? fb.black || fb.bold : weight >= 600 ? fb.bold : weight >= 500 ? fb.medium || fb.regular : fb.regular;

const fontCss = () => {
  const rules = ARCHIVO.map(
    ([family, weight, file]) =>
      `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(fonts/${file}) format('truetype');}`,
  );
  for (const [family, weight] of ARCHIVO) {
    for (const fb of FALLBACKS) {
      rules.push(
        `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:local('${faceFor(fb, weight)}');unicode-range:${fb.range};}`,
      );
    }
  }
  return rules.join('\n');
};

(async () => {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'fonts'), { recursive: true });

  const fontDir = path.join(APP, 'android', 'app', 'src', 'main', 'res', 'font');
  for (const [, , file] of ARCHIVO) {
    fs.copyFileSync(path.join(fontDir, file), path.join(DIST, 'fonts', file));
  }
  fs.writeFileSync(path.join(DIST, 'fonts.css'), fontCss());
  fs.copyFileSync(
    require.resolve('sql.js/dist/sql-wasm.wasm', { paths: [OWN_MODULES] }),
    path.join(DIST, 'sql-wasm.wasm'),
  );
  for (const page of ['index.html', 'frame.html', 'feature.html', 'shared.css', 'shared.js', 'fonts-cjk.js']) {
    fs.copyFileSync(path.join(HERE, 'web', page), path.join(DIST, page));
  }
  // The app's own mark, for the feature graphic's icon tile.
  fs.copyFileSync(path.join(APP, 'src', 'assets', 'logo.png'), path.join(DIST, 'logo.png'));

  await esbuild.build({
    entryPoints: [path.join(HERE, 'web', 'entry.js')],
    outfile: path.join(DIST, 'app.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    minify: false,
    sourcemap: false,
    logLevel: 'warning',
    plugins: [resolver],
    nodePaths: [APP_MODULES, OWN_MODULES],
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.jsx', '.json'],
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'import', 'default'],
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.png': 'file', '.jpg': 'file' },
    assetNames: 'assets/[name]-[hash]',
    define: {
      __DEV__: 'false',
      'process.env.NODE_ENV': '"production"',
      'process.env.EXPO_OS': '"web"',
      global: 'globalThis',
    },
  });
  console.log(`built ${path.relative(APP, DIST)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
