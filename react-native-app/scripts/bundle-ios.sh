#!/bin/sh
set -eu

if [ -f "$PODS_ROOT/../.xcode.env" ]; then
  . "$PODS_ROOT/../.xcode.env"
fi
if [ -f "$PODS_ROOT/../.xcode.env.local" ]; then
  . "$PODS_ROOT/../.xcode.env.local"
fi

export PROJECT_ROOT="$PROJECT_DIR/.."
case "$CONFIGURATION" in
  *Debug*) export SKIP_BUNDLING=1 ;;
esac

# Use the same entry resolution and Metro implementation as Expo on Android.
if [ -z "${ENTRY_FILE:-}" ]; then
  ENTRY_FILE=$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$PROJECT_ROOT" ios relative | tail -n 1)
  export ENTRY_FILE
fi
if [ -z "${CLI_PATH:-}" ]; then
  CLI_PATH=$("$NODE_BINARY" --print "require.resolve('@expo/cli')")
  export CLI_PATH
fi
export BUNDLE_COMMAND="${BUNDLE_COMMAND:-export:embed}"
REACT_NATIVE_XCODE=$("$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'")
exec /bin/sh "$REACT_NATIVE_XCODE"
