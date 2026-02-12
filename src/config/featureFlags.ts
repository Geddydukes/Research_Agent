export interface FeatureFlags {
  multiTenant: boolean;
  usageTracking: boolean;
  hostedQueue: boolean;
  billing: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    multiTenant: process.env.ENABLE_MULTI_TENANT === 'true',
    usageTracking: process.env.ENABLE_USAGE_TRACKING !== 'false',
    hostedQueue: process.env.ENABLE_HOSTED_QUEUE === 'true',
    billing: process.env.ENABLE_BILLING === 'true',
  };
}

export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags();
  return flags[feature];
}

export function requireFeature(feature: keyof FeatureFlags): void {
  if (!isFeatureEnabled(feature)) {
    throw new Error(
      `Feature "${feature}" is not enabled. Set ENABLE_${feature.toUpperCase().replace(/([A-Z])/g, '_$1')}=true`
    );
  }
}

