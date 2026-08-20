"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface ReviewRow {
  id: string;
  review_period: string;
  rating: number;
  strengths: string | null;
  improvements: string | null;
  goals_next_period: string | null;
  created_at: string;
}

export default function ReviewsPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("performance_reviews")
      .select("id, review_period, rating, strengths, improvements, goals_next_period, created_at")
      .eq("employee_id", profile.employeeId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setReviews(data ?? []);
        setLoaded(true);
      });
  }, [profile, supabase]);

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ผลการประเมิน</h1>

      {loaded && reviews.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีผลการประเมิน</p>}
      <div className="space-y-3">
        {reviews.map((r) => (
          <div key={r.id} className="space-y-2 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-on-surface">{r.review_period}</p>
              <p className="text-lg font-bold text-primary">{r.rating} / 5</p>
            </div>
            {r.strengths && (
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">จุดแข็ง</p>
                <p className="text-sm text-on-surface">{r.strengths}</p>
              </div>
            )}
            {r.improvements && (
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">จุดที่ควรพัฒนา</p>
                <p className="text-sm text-on-surface">{r.improvements}</p>
              </div>
            )}
            {r.goals_next_period && (
              <div>
                <p className="text-xs font-semibold text-on-surface-variant">เป้าหมายรอบถัดไป</p>
                <p className="text-sm text-on-surface">{r.goals_next_period}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
