// Lightweight local client replacement for Base44 SDK.
// Keeps the same call shape used by AuthContext.
const redirectTo = (url) => {
  if (typeof window !== "undefined" && url) {
    window.location.href = url;
  }
};

export const base44 = {
  auth: {
    async me() {
      return null;
    },
    logout(redirectUrl) {
      redirectTo(redirectUrl);
    },
    redirectToLogin(returnUrl) {
      redirectTo(returnUrl);
    },
  },
};
