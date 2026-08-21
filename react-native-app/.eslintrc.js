module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // React Navigation's screenOptions takes render props (tabBarIcon,
    // tabBarButton). They render module-level components rather than defining
    // new ones, so they are not the unstable-component hazard this rule targets.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
};
