import { test as base } from '@playwright/test';
import { type AuthProvider, createAuthFixtures, setAuthProvider } from '@seontechnologies/playwright-utils/auth-session';

// Custom Auth Provider Pattern (auth-session.md). All six AuthProvider members are
// implemented; manageAuthToken and the cookie name are TODOs until the project's real
// auth endpoint is known, per step-04-docs-and-scripts.md's instruction to leave them
// marked rather than inventing a shorter interface or a form-driven login fixture.
const authProvider: AuthProvider = {
  getEnvironment: (options) => options.environment || 'local',

  getUserIdentifier: (options) => options.userIdentifier || 'default-user',

  extractToken: (storageState) => storageState.cookies.find((cookie) => cookie.name === 'auth_token')?.value,

  extractCookies: (tokenData) => [
    // TODO: confirm the real cookie name, domain, and flags once the auth endpoint is known.
    { name: 'auth_token', value: tokenData, domain: 'example.com', path: '/', httpOnly: true, secure: true },
  ],

  isTokenExpired: (storageState) => {
    const expiresAt = storageState.cookies.find((cookie) => cookie.name === 'expires_at');
    return Date.now() > Number.parseInt(expiresAt?.value || '0', 10);
  },

  manageAuthToken: async (request, options) => {
    // TODO: wire this up to the project's real auth endpoint.
    throw new Error('manageAuthToken is not implemented yet: wire it to the real auth endpoint');
  },
};

setAuthProvider(authProvider);

export const test = base.extend(createAuthFixtures());
