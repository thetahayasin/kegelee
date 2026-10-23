/**
 * react-native-safe-area-context as the APP's own files see it, with the
 * insets a phone would report.
 *
 * In a desktop browser every inset is zero, so a screen drawn for a phone
 * frame would run up under the status bar and the camera. The capture passes
 * the insets in the query string (?insetTop=30&insetBottom=18) and the app's
 * hook and SafeAreaView read them from here. Libraries keep the real module.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native-web';

export * from 'react-native-safe-area-context';

const params = new URLSearchParams(window.location.search);
const INSETS = Object.freeze({
  top: Number(params.get('insetTop')) || 0,
  bottom: Number(params.get('insetBottom')) || 0,
  left: 0,
  right: 0,
});

export const useSafeAreaInsets = () => INSETS;

const PADDING = { top: 'paddingTop', bottom: 'paddingBottom', left: 'paddingLeft', right: 'paddingRight' };

/** Padding mode only, the default, which is all the app uses: inset added to the style's own padding. */
export const SafeAreaView = React.forwardRef(function SafeAreaView({ edges, style, ...rest }, ref) {
  const flat = StyleSheet.flatten(style) || {};
  const on = (edge) =>
    edges == null ? true : Array.isArray(edges) ? edges.includes(edge) : edges[edge] && edges[edge] !== 'off';
  const own = (edge) => {
    const vertical = edge === 'top' || edge === 'bottom';
    return Number(flat[PADDING[edge]] ?? (vertical ? flat.paddingVertical : flat.paddingHorizontal) ?? flat.padding ?? 0);
  };
  const pad = {};
  for (const edge of Object.keys(PADDING)) {
    if (on(edge)) pad[PADDING[edge]] = own(edge) + INSETS[edge];
  }
  return React.createElement(View, { ...rest, ref, style: [style, pad] });
});
