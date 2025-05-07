import React, { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  username: string;
  // token?: string; // Future use
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (credentials: { username?: string; password?: string }) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const login = async (credentials: { username?: string; password?: string }) => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    if (credentials.username === 'admin' && credentials.password === 'admin') {
      setUser({ username: 'admin', isAdmin: true });
      // In a real app, you'd store the token, e.g., in localStorage
      // localStorage.setItem('authToken', 'fake-admin-token');
      // localStorage.setItem('user', JSON.stringify({ username: 'admin', isAdmin: true }));
      setIsLoading(false);
      return;
    }
    
    // TODO: Implement actual API call for regular users
    // For now, let's assume login fails for others for simplicity in admin setup
    console.error('Login failed: Invalid credentials or non-admin user for this demo.');
    setIsLoading(false);
    throw new Error('Invalid credentials');
  };

  const logout = () => {
    setUser(null);
    // localStorage.removeItem('authToken');
    // localStorage.removeItem('user');
    // Potentially redirect to login page
  };

  // TODO: Add a check on initial load for existing token/user in localStorage

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 