import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./main";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";
import CitizenDashboard from "./pages/CitizenDashboard";
import OfficerDashboard from "./pages/OfficerDashboard";
import DemoPage from "./pages/DemoPage";

function RootRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-blue"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "officer" || user.role === "commissioner") return <Navigate to="/officer" replace />;
  return <Navigate to="/citizen" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/citizen"
              element={
                <ProtectedRoute requiredRole="citizen">
                  <CitizenDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/officer"
              element={
                <ProtectedRoute requiredRole="officer">
                  <OfficerDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/commissioner" element={<Navigate to="/officer" replace />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
