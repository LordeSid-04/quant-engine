import React, { createContext, useContext, useEffect, useState } from "react";
import {
  bootstrapTestAccount,
  clearStoredAuthSession,
  fetchAuthMe,
  getStoredAuthSession,
  setStoredAuthSession,
  signupWithPassword,
  loginWithPassword,
} from "@/api/atlasClient";

const AuthContext = createContext(null);

function restoreSessionErrorMessage(error) {
  const rawMessage = String(error?.message || "").trim();
  const normalized = rawMessage.toLowerCase();
  if (!normalized) {
    return "Session expired. Please sign in again.";
  }
  if (
    normalized.includes("invalid authentication token") ||
    normalized.includes("missing bearer token") ||
    normalized.includes("jwt")
  ) {
    return "Previous session expired. Please sign in again.";
  }
  if (normalized.includes("timed out") || normalized.includes("cannot reach backend")) {
    return "Previous session is unavailable. Please sign in again.";
  }
  return rawMessage;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(() => getStoredAuthSession());
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getStoredAuthSession()?.access_token));
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const stored = getStoredAuthSession();
      if (!stored?.access_token) {
        if (!cancelled) {
          setUser(null);
          setSession(null);
          setIsAuthenticated(false);
          setIsLoadingAuth(false);
        }
        return;
      }

      try {
        const currentUser = await fetchAuthMe();
        if (cancelled) return;
        setUser(currentUser);
        setSession(stored);
        setIsAuthenticated(true);
        setAuthError("");
      } catch (error) {
        if (cancelled) return;
        clearStoredAuthSession();
        setUser(null);
        setSession(null);
        setIsAuthenticated(false);
        setAuthError(restoreSessionErrorMessage(error));
      } finally {
        if (!cancelled) {
          setIsLoadingAuth(false);
        }
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = (nextSession) => {
    setStoredAuthSession(nextSession);
    setSession(nextSession);
    setUser(nextSession.user);
    setIsAuthenticated(true);
    setAuthError("");
  };

  const login = async (payload) => {
    const nextSession = await loginWithPassword(payload);
    applySession(nextSession);
    return nextSession;
  };

  const signup = async (payload) => {
    const nextSession = await signupWithPassword(payload);
    applySession(nextSession);
    return nextSession;
  };

  const loginWithTestAccount = async () => {
    const nextSession = await bootstrapTestAccount();
    applySession(nextSession);
    return nextSession;
  };

  const logout = () => {
    clearStoredAuthSession();
    setUser(null);
    setSession(null);
    setIsAuthenticated(false);
    setAuthError("");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated,
        isLoadingAuth,
        authError,
        login,
        signup,
        loginWithTestAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
