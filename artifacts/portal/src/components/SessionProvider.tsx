import { createContext, useContext, ReactNode } from "react";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface SessionContextType {
  user: any; // SessionUser
  isLoading: boolean;
  logout: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: meData, isLoading } = useGetMe({
    query: {
      retry: false,
    } as Parameters<typeof useGetMe>[0] extends { query?: infer Q } ? Q : never,
  });

  const { mutate: logoutMutate } = useLogout();
  const [, setLocation] = useLocation();

  const logout = () => {
    logoutMutate(
      undefined,
      {
        onSuccess: () => {
          // Hard reload clears query cache; use BASE_URL so the path is
          // correct under the /portal/ prefix in the Replit proxy.
          window.location.href = import.meta.env.BASE_URL + "login";
        },
      }
    );
  };

  return (
    <SessionContext.Provider
      value={{
        user: meData?.user || null,
        isLoading,
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
