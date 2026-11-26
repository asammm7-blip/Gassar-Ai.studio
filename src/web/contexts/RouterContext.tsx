import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface RouterContextValue {
  pathname: string;
  search: string;
  push: (to: string) => void;
  replace: (to: string) => void;
  back: () => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function splitUrl(to: string): { pathname: string; search: string } {
  const qIndex = to.indexOf('?');
  if (qIndex < 0) return { pathname: to || '/', search: '' };
  return { pathname: to.slice(0, qIndex) || '/', search: to.slice(qIndex) };
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [locationState, setLocationState] = useState<{ pathname: string; search: string }>(() => ({
    pathname: typeof window !== 'undefined' ? window.location.pathname || '/' : '/',
    search: typeof window !== 'undefined' ? window.location.search || '' : '',
  }));

  useEffect(() => {
    const onPopState = () => {
      setLocationState({
        pathname: window.location.pathname || '/',
        search: window.location.search || '',
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const push = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setLocationState(splitUrl(to));
  }, []);

  const replace = useCallback((to: string) => {
    window.history.replaceState({}, '', to);
    setLocationState(splitUrl(to));
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      replace('/');
    }
  }, [replace]);

  return (
    <RouterContext.Provider value={{ ...locationState, push, replace, back }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}
