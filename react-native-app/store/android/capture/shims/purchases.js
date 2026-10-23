/** react-native-purchases: no store in a browser, so every call fails quietly. */
const unavailable = async () => {
  throw new Error('Purchases are unavailable in the screenshot build');
};

const Purchases = {
  PURCHASES: 'PURCHASES',
  LOG_LEVEL: { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
  configure: () => {},
  setLogLevel: () => {},
  addCustomerInfoUpdateListener: () => {},
  removeCustomerInfoUpdateListener: () => {},
  getCustomerInfo: unavailable,
  getOfferings: unavailable,
  invalidateCustomerInfoCache: async () => {},
  syncAttributesAndOfferingsIfNeeded: unavailable,
  checkTrialOrIntroductoryPriceEligibility: async () => ({}),
  logIn: unavailable,
  logOut: unavailable,
  purchasePackage: unavailable,
  restorePurchases: unavailable,
};

export default Purchases;
