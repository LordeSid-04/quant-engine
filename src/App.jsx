import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { Suspense } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AuthScreen from '@/components/auth/AuthScreen';
import { motion } from "framer-motion";
import { getPagePath } from "@/lib/routes";

const { Layout, mainPage, Pages } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ? (
  <Layout currentPageName={currentPageName}>
    <motion.div
      key={currentPageName}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  </Layout>
) : (
  <>{children}</>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/72 backdrop-blur-xl">
        <div className="rounded-2xl border border-white/10 bg-black/40 px-6 py-5 text-center shadow-[0_18px_44px_rgba(0,0,0,0.42)]">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-zinc-100" />
          <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500">Restoring Session</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        {Object.entries(Pages).map(([pageName, PageComponent]) => {
          const path = getPagePath(pageName);
          return (
            <Route
              key={pageName}
              path={path}
              element={
                <LayoutWrapper currentPageName={pageName}>
                  <PageComponent />
                </LayoutWrapper>
              }
            />
          );
        })}
        {mainPageKey && getPagePath(mainPageKey) !== "/" ? (
          <Route
            path="/"
            element={
              <LayoutWrapper currentPageName={mainPageKey}>
                <MainPage />
              </LayoutWrapper>
            }
          />
        ) : null}
        <Route path="*" element={<Navigate to={getPagePath(mainPageKey)} replace />} />
      </Routes>
    </Suspense>
  );
};

function RouteLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/72 backdrop-blur-xl">
      <div className="rounded-2xl border border-white/10 bg-black/40 px-6 py-5 text-center shadow-[0_18px_44px_rgba(0,0,0,0.42)]">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-zinc-100" />
        <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500">Loading Workspace</div>
      </div>
    </div>
  );
}


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
