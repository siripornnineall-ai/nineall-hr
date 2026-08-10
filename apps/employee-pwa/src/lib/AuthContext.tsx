"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface EmployeeProfile {
  profileId: string;
  orgId: string;
  employeeId: string;
  role: "super_admin" | "hr" | "manager" | "employee" | "payroll_admin";
  fullName: string;
  mustChangePassword: boolean;
  employeeCode: string;
  photoUrl: string | null;
  jobTitle: string | null;
}

interface AuthContextValue {
  session: Session | null;
  profile: EmployeeProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("id, org_id, employee_id, role, full_name, must_change_password, employees(employee_code, photo_url, job_positions(title))")
      .eq("id", userId)
      .maybeSingle();

    if (!data) {
      setProfile(null);
      return;
    }
    const employee = data.employees as unknown as { employee_code: string; photo_url: string | null; job_positions: { title: string } | null } | null;
    setProfile({
      profileId: data.id,
      orgId: data.org_id,
      employeeId: data.employee_id,
      role: data.role,
      fullName: data.full_name,
      mustChangePassword: data.must_change_password,
      employeeCode: employee?.employee_code ?? "",
      photoUrl: employee?.photo_url ?? null,
      jobTitle: employee?.job_positions?.title ?? null,
    });
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      refreshProfile: async () => {
        if (session) await loadProfile(session.user.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
