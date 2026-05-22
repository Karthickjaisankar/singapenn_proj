import React, { createContext, useState, useEffect, ReactNode } from "react";

export interface AuthUser {
  user_id: number;
  username: string;
  role: "citizen" | "officer" | "commissioner" | "patrol";
  full_name: string;
  token: string;
  vehicle_id?: number;
}

export interface AuthContextType {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Demo mode: when ?demo=1 is in the URL, use sessionStorage so each iframe gets
  // an isolated token (iframes share localStorage but have separate sessionStorage).
  const isDemoInit = new URLSearchParams(window.location.search).get("demo") === "1";
  if (isDemoInit) sessionStorage.setItem("singapene_demo", "1");
  const isDemo = sessionStorage.getItem("singapene_demo") === "1";
  const storage: Storage = isDemo ? sessionStorage : localStorage;

  // Validate stored token on mount
  useEffect(() => {
    const validateStoredToken = async () => {
      const storedToken = storage.getItem("singapene_token");

      if (storedToken) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_API_URL ?? ""}/api/auth/me`,
            {
              headers: { Authorization: `Bearer ${storedToken}` },
            }
          );

          if (response.ok) {
            const userData = await response.json();
            setUser({
              ...userData,
              token: storedToken,
            });
          } else {
            storage.removeItem("singapene_token");
          }
        } catch (err) {
          console.error("Token validation failed:", err);
          storage.removeItem("singapene_token");
        }
      }

      setIsLoading(false);
    };

    validateStoredToken();
  }, []);

  const login = async (username: string, password: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? ""}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        }
      );

      if (!response.ok) {
        throw new Error("Login failed");
      }

      const data = await response.json();

      const authUser: AuthUser = {
        user_id: data.user_id,
        username: data.username || username,
        role: data.role,
        full_name: data.full_name,
        token: data.access_token,
        vehicle_id: data.vehicle_id ?? undefined,
      };

      storage.setItem("singapene_token", data.access_token);
      setUser(authUser);
      return authUser;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    storage.removeItem("singapene_token");
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
