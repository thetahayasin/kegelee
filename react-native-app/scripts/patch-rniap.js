/**
 * Patch react-native-iap 12.x Kotlin sources for React Native 0.86.
 *
 * RN 0.86 broke three things the library relies on:
 *   1. com.facebook.react.bridge.ObjectAlreadyConsumedException became internal,
 *      so it can no longer be imported or caught directly.
 *   2. ReadableArray.getString() now returns String? (nullable).
 *   3. ReactContextBaseJavaModule.getCurrentActivity() is a Kotlin function,
 *      so Java-getter property syntax `currentActivity` no longer resolves.
 *
 * Runs from postinstall / the build scripts alongside patch-jcenter.js and is
 * idempotent: already-patched (or upgraded) files are left untouched.
 */
const fs = require('fs');
const path = require('path');

const iapAndroidSrc = path.join(
  __dirname,
  '../node_modules/react-native-iap/android/src',
);

function patchFile(relPath, replacements) {
  const file = path.join(iapAndroidSrc, relPath);
  if (!fs.existsSync(file)) {
    console.warn(`patch-rniap: ${relPath} not found, skipping.`);
    return;
  }
  let content = fs.readFileSync(file, 'utf8');
  let applied = 0;
  replacements.forEach(({ from, to }) => {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      applied++;
    }
  });
  if (applied > 0) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`patch-rniap: patched ${relPath} (${applied} change(s)).`);
  } else {
    console.log(`patch-rniap: ${relPath} already patched.`);
  }
}

patchFile('main/java/com/dooboolab/rniap/PromiseUtlis.kt', [
  {
    from: 'import com.facebook.react.bridge.ObjectAlreadyConsumedException\n',
    to: '',
  },
  {
    from: '} catch (oce: ObjectAlreadyConsumedException) {',
    to:
      '} catch (oce: RuntimeException) {\n' +
      '        // RN 0.86 made ObjectAlreadyConsumedException internal, so match it by name\n' +
      '        if (oce.javaClass.simpleName != "ObjectAlreadyConsumedException") throw oce',
  },
]);

patchFile('play/java/com/dooboolab/rniap/RNIapModule.kt', [
  { from: 'skuArr.getString(i).let { sku ->', to: 'skuArr.getString(i)?.let { sku ->' },
  { from: 'val activity = currentActivity', to: 'val activity = getCurrentActivity()' },
  {
    from: 'offerTokenArr.getString(index).let { offerToken ->',
    to: 'offerTokenArr.getString(index)?.let { offerToken ->',
  },
]);
