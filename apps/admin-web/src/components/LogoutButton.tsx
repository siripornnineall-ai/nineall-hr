"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary"
    >
      <span className="material-symbols-outlined text-[20px]">logout</span>
      <span className="hidden sm:inline">ออกจากระบบ</span>
    </button>
  );
}
