declare module 'react-native-keep-awake' {
  const KeepAwake: {
    activate(): void;
    deactivate(): void;
  };
  export default KeepAwake;
}

declare module 'react-native-sqlite-storage' {
  const SQLite: any;
  export default SQLite;
}

declare module '*.png' {
  const value: number;
  export default value;
}
