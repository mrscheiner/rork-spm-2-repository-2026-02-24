import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TeamTheme } from '@/constants/teamThemes';

interface AppThemeContextProps {
  theme: TeamTheme;
  setTheme: (theme: TeamTheme) => void;
}

const AppThemeContext = createContext<AppThemeContextProps | undefined>(undefined);

export function AppThemeProvider({ children, initialTheme }: { children: ReactNode; initialTheme: TeamTheme }) {
  const [theme, setTheme] = useState<TeamTheme>(initialTheme);
  return (
    <AppThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) throw new Error('useAppTheme must be used within AppThemeProvider');
  return context;
}
