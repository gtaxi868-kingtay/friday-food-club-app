import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/convex-backend/convex/_generated/api";

const TOKEN_KEY = "ffc_portal_token";

interface SessionContextType {
  user: any;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ user: any }>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const loginMutation = useMutation(api.auth.login);

  const me = useQuery(api.auth.me, token ? { sessionToken: token } : "skip");
  // undefined = still loading; null = query ran but no session/user found
  const isLoading = !!token && me === undefined;

  useEffect(() => {
    if (token && me === null) {
      // Token is stale/invalid — drop it.
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    }
  }, [token, me]);

  const login = async (email: string, password: string) => {
    const data = await loginMutation({ email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    return { user: data.user };
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    window.location.href = import.meta.env.BASE_URL + "login";
  };

  return (
    <SessionContext.Provider
      value={{
        user: me ?? null,
        token,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
