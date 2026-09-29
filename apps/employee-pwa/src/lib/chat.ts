import { t } from "@/lib/i18n";

// Shared types/helpers for the employee chat (2026-09-29). The data model lives in
// supabase/migrations/0102_employee_chat.sql: conversations are either 'direct' (one per
// pair of people) or 'group'; reads go through RLS, writes through the chat_* RPCs.

export interface ConversationRow {
  conversation_id: string;
  type: "direct" | "group";
  name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_name: string | null;
  unread_count: number;
  member_count: number;
  other_employee_id: string | null;
  other_first_name: string | null;
  other_nickname: string | null;
  other_photo_url: string | null;
}

export interface MemberRow {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  role: "owner" | "member";
  last_read_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_employee_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
}

export interface DirectoryRow {
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  photo_url: string | null;
  job_title: string | null;
}

export function displayName(p: { first_name: string | null; nickname: string | null }): string {
  return (p.nickname && p.nickname.trim()) || p.first_name || "";
}

export function conversationTitle(c: ConversationRow): string {
  if (c.type === "group") return c.name || t("กลุ่ม");
  return displayName({ first_name: c.other_first_name, nickname: c.other_nickname }) || t("เพื่อนร่วมงาน");
}

const TZ = "Asia/Bangkok";

/** Short time for the chat list: today → HH:mm, this year → d MMM, else d MMM yy. */
export function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toLocaleDateString("en-CA", { timeZone: TZ }) === now.toLocaleDateString("en-CA", { timeZone: TZ });
  if (sameDay) return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: TZ });
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: TZ });
}

export function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** Date separator label between messages from different days. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });
  if (key(d) === key(now)) return t("วันนี้");
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (key(d) === key(yesterday)) return t("เมื่อวาน");
  return d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "long", timeZone: TZ });
}

export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Human-readable text for an RPC error (the database raises CODE: message). */
export function chatErrorText(message: string | undefined): string {
  if (!message) return t("เกิดข้อผิดพลาด กรุณาลองใหม่");
  if (message.startsWith("FORBIDDEN")) return t("คุณไม่ได้อยู่ในแชทนี้");
  if (message.includes("group name")) return t("กรุณาตั้งชื่อกลุ่ม");
  if (message.startsWith("NOT_FOUND")) return t("ไม่พบพนักงาน");
  return t("เกิดข้อผิดพลาด กรุณาลองใหม่");
}
