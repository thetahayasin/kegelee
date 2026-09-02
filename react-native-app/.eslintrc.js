module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // React Navigation's screenOptions takes render props (tabBarIcon,
    // tabBarButton). They render module-level components rather than defining
    // new ones, so they are not the unstable-component hazard this rule targets.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
  overrides: [
    {
      // Build tooling, run by node rather than by Metro. Without this the
      // shared config's browser/react-native globals apply and every
      // `require`, `module`, `process` and `__dirname` in here is flagged as
      // undefined - noise that trained everyone to ignore lint on scripts/.
      files: ['scripts/**/*.js', '*.config.js', '.eslintrc.js', 'jest.setup.js'],
      env: { node: true },
    },
  ],
};
