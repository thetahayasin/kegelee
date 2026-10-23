/**
 * @react-navigation/native for App.tsx, with the container published on
 * window.__nav so the capture script can open a screen by route name instead
 * of tapping translated labels.
 */
import React from 'react';
import { NavigationContainer as RealContainer } from '@react-navigation/native';

export * from '@react-navigation/native';

export const NavigationContainer = React.forwardRef((props, ref) => {
  const setRef = (instance) => {
    window.__nav = instance;
    if (typeof ref === 'function') ref(instance);
    else if (ref) ref.current = instance;
  };
  return React.createElement(RealContainer, {
    ...props,
    ref: setRef,
    onReady: () => {
      window.__navReady = true;
      props.onReady?.();
    },
  });
});
