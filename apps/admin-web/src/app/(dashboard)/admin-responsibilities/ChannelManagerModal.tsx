"use client";

import { useState, useTransition } from "react";
import type { ChannelOption } from "./types";
import { addChannelAction, deleteChannelAction } from "./actions";

export function ChannelManagerModal({ channels, onClose }: { channels: ChannelOption[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addChannelAction(name);
      if (result.error) setError(result.error);
      else setName("");
    });
  }

  function handleDelete(id: string) {
    if (!confirm("ลบร้าน/ช่องทางนี้? (ตารางที่ผูกกับร้านนี้จะถูกลบไปด้วย)")) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteChannelAction(id);
      setDeletingId(null);
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-on-surface">จัดการร้าน/ช่องทาง</h3>
          <button onClick={onClose} className="text-on-surface-variant">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {error && <p className="mb-2 text-sm font-semibold text-status-danger">{error}</p>}

        <div className="mb-3 space-y-1.5">
          {channels.length === 0 && <p className="text-xs text-on-surface-variant">ยังไม่มีร้าน/ช่องทาง</p>}
          {channels.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2">
              <span className="text-sm text-on-surface">{c.name}</span>
              <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} className="text-xs font-semibold text-status-danger disabled:opacity-50">
                ลบ
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Shopee ISSA"
            className="h-10 flex-1 rounded-lg border border-outline-variant px-3 text-sm"
          />
          <button onClick={handleAdd} disabled={isPending || !name.trim()} className="rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-50">
            เพิ่ม
          </button>
        </div>
      </div>
    </div>
  );
}
