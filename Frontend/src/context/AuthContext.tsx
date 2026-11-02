import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type User } from "../lib/api";

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (userData: {
    email: string;
    password: string;
    name: string;
    lastName: string;
    role?: string;
  }) => Promise<void>;
  updateProfile: (profileData: {
    name?: string;
    lastName?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<void>;
  loading: boolean;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Validate token and fetch user on mount
  useEffect(() => {
    if (api.isAuthenticated()) {
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const response = await api.getCurrentUser();
      if (response.success && response.user) {
        setUser(response.user);
      } else {
        api.clearAuth();
        setUser(null);
      }
    } catch (error) {
      // Silently clear auth on token validation failure
      // This is expected when tokens expire or are invalid
      if (error instanceof Error && error.message.includes('Invalid token')) {
        // Don't log expected auth errors to console
        api.clearAuth();
        setUser(null);
      } else {
        console.error('Failed to fetch current user:', error);
        api.clearAuth();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    if (!email?.trim() || !password?.trim()) {
      throw new Error("Please enter both email and password");
    }

    try {
      const response = await api.login(email.trim(), password);
      
      if (response.success && response.user) {
        setUser(response.user);
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error. Please try again.');
    }
  };

  const register = async (userData: {
    email: string;
    password: string;
    name: string;
    lastName: string;
    role?: string;
  }) => {
    try {
      const response = await api.register(userData);
      
      if (!response.success) {
        throw new Error(response.message || 'Registration failed');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error. Please try again.');
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      api.clearAuth();
    }
  };

  const updateProfile = async (profileData: {
    name?: string;
    lastName?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => {
    try {
      const response = await api.updateProfile(profileData);
      
      if (response.success && response.user) {
        setUser(response.user);
      } else {
        throw new Error(response.message || 'Profile update failed');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to update profile');
    }
  };

  const refreshUser = async () => {
    await fetchCurrentUser();
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      login,
      logout,
      register,
      updateProfile,
      loading,
      refreshUser,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}



