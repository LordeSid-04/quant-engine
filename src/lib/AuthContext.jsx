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
        setAuthError(error?.message || "Session expired. Please sign in again.");
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
