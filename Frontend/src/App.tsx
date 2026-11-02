import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navigation from "./components/Navigation";
import ErrorBoundary from "./components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import TwoTeamContest from "./pages/TwoTeamContest";
import SurvivorContest from "./pages/SurvivorContest";
import Admin from "./pages/Admin";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import EmailSettings from "./pages/EmailSettings";
import { AuthProvider } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-background flex flex-col md:flex-row w-full">
            <Navigation />
            <main className="flex-1 min-w-0 overflow-y-auto">
              <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<Login />} />

                <Route element={<RequireAuth />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/two-team" element={<TwoTeamContest />} />
                  <Route path="/survivor" element={<SurvivorContest />} />
                  <Route path="/chat" element={<Chat />} />
                </Route>

                <Route element={<RequireAdmin />}>
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/admin/email-settings" element={<EmailSettings />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
              </ErrorBoundary>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
