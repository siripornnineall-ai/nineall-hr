"use client";

import { useState, useTransition } from "react";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "checkbox" | "select" | "time";
  options?: { value: string; label: string }[];
  optional?: boolean;
};

// `label`/`subLabel` are plain strings (not functions) because rows cross the
// server-to-client boundary as props: only serializable data or genuine
// "use server" actions can be passed to a Client Component, so any per-row
// display formatting must happen in the server component before it gets here.
type Row = Record<string, string | number | boolean | null> & { label: string; subLabel?: string | null };

export function EditableList({
  title,
  fields,
  rows,
  onSave,
  onCreate,
  emptyLabel,
  addLabel,
}: {
  title: string;
  fields: FieldDef[];
  rows: Row[];
  onSave: (id: string, values: Record<string, string | boolean>) => Promise<{ error?: string } | void>;
  onCreate: (values: Record<string, string | boolean>) => Promise<{ error?: string } | void>;
  emptyLabel: string;
  addLabel: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold">{title}</h3>
        <button onClick={() => setAdding((v) => !v)} className="text-xs font-bold text-primary hover:underline">
          {adding ? "ยกเลิก" : `+ ${addLabel}`}
        </button>
      </div>

      {adding && (
        <div className="mb-4 rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <EntityForm
            fields={fields}
            initial={{}}
            onSubmit={async (v) => {
              const result = await onCreate(v);
              if (!result?.error) setAdding(false);
              return result;
            }}
            submitLabel="บันทึก"
          />
        </div>
      )}

      <ul className="divide-y divide-outline-variant text-sm">
        {rows.map((row) => {
          const id = String(row.id);
          const isEditing = editingId === id;
          return (
            <li key={id} className="py-2">
              {isEditing ? (
                <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
                  <EntityForm
                    fields={fields}
                    initial={row}
                    onSubmit={async (v) => {
                      const result = await onSave(id, v);
                      if (!result?.error) setEditingId(null);
                      return result;
                    }}
                    onCancel={() => setEditingId(null)}
                    submitLabel="บันทึกการแก้ไข"
                  />
                </div>
              ) : (
                <button onClick={() => setEditingId(id)} className="flex w-full items-center justify-between text-left hover:text-primary">
                  <span>{row.label}</span>
                  <span className="text-xs text-on-surface-variant">{row.subLabel}</span>
                </button>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <p className="py-2 text-on-surface-variant">{emptyLabel}</p>}
      </ul>
    </section>
  );
}

function EntityForm({
  fields,
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  fields: FieldDef[];
  initial: Record<string, string | number | boolean | null | undefined>;
  onSubmit: (values: Record<string, string | boolean>) => Promise<{ error?: string } | void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const v: Record<string, string | boolean> = {};
    for (const f of fields) {
      const raw = initial[f.key];
      v[f.key] = f.type === "checkbox" ? Boolean(raw) : raw != null ? String(raw) : "";
    }
    return v;
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await onSubmit(values);
        if (result?.error) setError(result.error);
      } catch (e) {
        // Server Actions redact thrown error messages in production builds (Next.js
        // security behavior — the client never sees the real text, only a generic
        // digest), so actions that need to surface a specific message to the user
        // return { error } instead of throwing. This catch only handles genuinely
        // unexpected failures (network errors, etc.), hence the generic fallback.
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.key} className={f.type === "checkbox" ? "col-span-2 flex items-center gap-2" : ""}>
            {f.type === "checkbox" ? (
              <>
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                  id={f.key}
                />
                <label htmlFor={f.key} className="text-sm">
                  {f.label}
                </label>
              </>
            ) : f.type === "select" ? (
              <>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">{f.label}</label>
                <select
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
                >
                  <option value="">-- เลือก --</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">{f.label}</label>
                <input
                  type={f.type === "time" ? "time" : f.type === "number" ? "number" : "text"}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
                />
              </>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button onClick={onCancel} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
            ยกเลิก
          </button>
        )}
        <button onClick={submit} disabled={isPending} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังบันทึก..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
