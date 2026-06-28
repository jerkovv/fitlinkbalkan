import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { AppRole } from "@/lib/database.types";

interface Props {
  children: JSX.Element;
  requireRole?: AppRole;
}

export const ProtectedRoute = ({ children, requireRole }: Props) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Nalog bez uloge (user postoji ali role je null POSLE zavrsenog ucitavanja):
  // odjavi i vrati na /auth. Gate na !loading je bitan - bez njega bi izbacio
  // korisnika dok se role jos cita.
  useEffect(() => {
    if (!loading && user && !role) {
      supabase.auth.signOut();
    }
  }, [loading, user, role]);

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Učitavanje…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Ucitavanje zavrseno, ali nalog nema ulogu -> odjava (useEffect) + na /auth.
  if (!role) {
    return <Navigate to="/auth" replace />;
  }

  if (requireRole && role && role !== requireRole) {
    // Pogrešna uloga — preusmeri na ispravnu sekciju
    const target = role === "trainer" ? "/trener" : "/vezbac";
    return <Navigate to={target} replace />;
  }

  return children;
};
