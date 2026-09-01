/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;

  // One ASYNC act, not a sync one followed by a flush. ThemeProvider reads the
  // stored appearance from AsyncStorage before it renders anything, and that
  // read resolves on a microtask - which escapes a synchronous act() and lands
  // as an "update not wrapped in act" warning. Awaiting inside keeps the whole
  // mount, including that resolution, in one act.
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });

  expect(tree!.toJSON()).not.toBeNull();
});
