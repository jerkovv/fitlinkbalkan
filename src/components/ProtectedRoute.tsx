import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/lib/database.types";

interface Props {
  children: JSX.Element;
  requireRole?: AppRole;
}

export const ProtectedRoute = ({ children, requireRole }: Props) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Učitavanje…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requireRole && role && role !== requireRole) {
    // Pogrešna uloga — preusmeri na ispravnu sekciju
    const target = role === "trainer" ? "/trener" : "/vezbac";
    return <Navigate to={target} replace />;
  }

  return children;
};
