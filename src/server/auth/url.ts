type AuthUrlEnvironment = {
  BETTER_AUTH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

export function resolveAuthUrl(
  environment: AuthUrlEnvironment = {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  },
) {
  const explicitUrl = environment.BETTER_AUTH_URL?.trim();
  if (explicitUrl) return explicitUrl;

  // Use the stable production hostname, not a per-deployment or request hostname.
  const productionHostname = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return productionHostname ? `https://${productionHostname}` : undefined;
}
