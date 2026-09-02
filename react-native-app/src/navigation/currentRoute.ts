/**
 * Which screen is on top, for the code that cannot ask the navigator.
 *
 * The crash boundary is the reason this exists. It sits ABOVE the
 * NavigationContainer - it has to, or a container that fails to mount takes
 * the whole app down with nothing to catch it - so it cannot use the
 * navigation hooks, and "the app crashed" without "on which screen" is a
 * report nobody can act on.
 *
 * A module-level mutable string rather than context or state: the reader is a
 * class component's componentDidCatch, running at the exact moment the React
 * tree is already coming apart, and it should depend on as little of that tree
 * as possible.
 */
let currentRouteName: string | null = null;

/** Published by the NavigationContainer's onReady / onStateChange. */
export const setCurrentRouteName = (name: string | null | undefined): void => {
  currentRouteName = name ?? null;
};

export const getCurrentRouteName = (): string | null => currentRouteName;
