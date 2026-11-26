import React from 'react';
import { ThemeProvider } from './web/contexts/ThemeContext';
import { AppSettingsProvider, useAppSettings } from './web/contexts/AppSettingsContext';
import { ChatProvider } from './web/contexts/ChatContext';
import { RouterProvider, useRouter } from './web/contexts/RouterContext';
import { ToastProvider } from './web/contexts/ToastContext';
import { StartupWelcome } from './web/components/StartupWelcome';
import { OfflineIndicator } from './web/components/OfflineIndicator';
import { HomePage } from './web/pages/HomePage';
import { ChatPage } from './web/pages/ChatPage';
import { ModelsPage } from './web/pages/ModelsPage';
import { CloudModelSettingsPage } from './web/pages/CloudModelSettingsPage';
import { ModelSettingsPage } from './web/pages/ModelSettingsPage';
import { SettingsPage } from './web/pages/SettingsPage';
import { VoicePage } from './web/pages/VoicePage';
import { LocalServerPage } from './web/pages/LocalServerPage';

function AppRoutes() {
  const { pathname } = useRouter();
  const { fontFamilyCss, fontScaleFactor } = useAppSettings();

  let page: React.ReactNode;
  if (pathname.startsWith('/chat/')) {
    const id = decodeURIComponent(pathname.slice('/chat/'.length));
    page = <ChatPage conversationId={id} />;
  } else if (pathname === '/models') {
    page = <ModelsPage />;
  } else if (pathname === '/cloud-model-settings') {
    page = <CloudModelSettingsPage />;
  } else if (pathname === '/model-settings') {
    page = <ModelSettingsPage />;
  } else if (pathname === '/settings') {
    page = <SettingsPage />;
  } else if (pathname === '/voice') {
    page = <VoicePage />;
  } else if (pathname === '/local-server') {
    page = <LocalServerPage />;
  } else {
    page = <HomePage />;
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{
        fontFamily: fontFamilyCss,
        fontSize: `${Math.round(16 * fontScaleFactor)}px`,
      }}
    >
      <OfflineIndicator />
      {page}
      <StartupWelcome />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppSettingsProvider>
        <ToastProvider>
          <ChatProvider>
            <RouterProvider>
              <AppRoutes />
            </RouterProvider>
          </ChatProvider>
        </ToastProvider>
      </AppSettingsProvider>
    </ThemeProvider>
  );
}
