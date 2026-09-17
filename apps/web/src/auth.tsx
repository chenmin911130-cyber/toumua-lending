import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicUser } from "@toumua/contracts";
import { api, type MeResponse } from "./api";

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<PublicUser | null>;
  setUser: (user: PublicUser | null) => void;
  clearProtectedCache: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await api<MeResponse>("/auth/me");
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    }
  };

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      setUser,
      clearProtectedCache: () => setUser(null),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
