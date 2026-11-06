"use client";

import { useActionState, useEffect, useState } from "react";
import { updateAnnouncementAction, type AnnouncementActionState } from "./actions";
import { DeleteAnnouncementButton } from "./DeleteAnnouncementButton";

const initialState: AnnouncementActionState = {};

interface Props {
  id: string;
  title: string;
  body: string;
  publishAt: string;
  updatedAt: string;
  canManage: boolean;
}

// One announcement in the list. HR / super admin can edit the title and text of an already
// published announcement in place; employees read it live, so the change shows up for them right away.
export function AnnouncementCard({ id, title, body, publishAt, updatedAt, canManage }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateAnnouncementAction, initialState);

  useEffect(() => {
    if (state.saved) setEditing(false);
  }, [state]);

  const edited = new Date(updatedAt).getTime() - new Date(publishAt).getTime() > 60_000;

  if (editing) {
    return (
      <form action={formAction} className="space-y-3 rounded-xl border border-primary bg-white p-6 shadow-sm">
        <input type="hidden" name="id" value={id} />
        <h3 className="font-bold">แก้ไขประกาศ</h3>
        {state.error && <div className="rounded-lg bg-error-container px-4 py-2 text-sm text-on-error-container">{state.error}</div>}
        <input name="title" required defaultValue={title} placeholder="หัวข้อประกาศ" className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        <textarea name="body" required rows={5} defaultValue={body} placeholder="เนื้อหาประกาศ" className="w-full rounded-lg border border-outline-variant p-3 text-sm" />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={isPending} className="h-10 rounded-lg bg-primary px-5 text-sm font-bold text-white disabled:opacity-50">
            {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={isPending} className="text-sm font-semibold text-on-surface-variant hover:underline">
            ยกเลิก
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-on-surface-variant">
            {new Date(publishAt).toLocaleDateString("th-TH")}
            {edited && <> · แก้ไข {new Date(updatedAt).toLocaleDateString("th-TH")}</>}
          </span>
          {canManage && (
            <>
              <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
                แก้ไข
              </button>
              <DeleteAnnouncementButton announcementId={id} />
            </>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-on-surface-variant">{body}</p>
    </article>
  );
}
