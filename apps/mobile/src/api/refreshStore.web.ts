// Web: the refresh token is an httpOnly, Secure, SameSite=Strict cookie set by the
// API (D1). JavaScript never sees it, so there is nothing to store or read here.

export const refreshStore = {
  holdsToken: false,
  get: () => Promise.resolve(null as string | null),
  set: (_token: string) => Promise.resolve(),
  clear: () => Promise.resolve(),
};
