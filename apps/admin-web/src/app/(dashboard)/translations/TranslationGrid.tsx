"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { LOCALES, type Locale } from "./constants";
import {
  upsertTranslationValue,
  createTranslationKey,
  deleteTranslationKey,
  getKeyTranslationHistory,
  importTranslationsBulk,
} from "./actions";

const LOCALE_LABEL: Record<Locale, string> = { th: "ไทย (ต้นฉบับ)", en: "English", lo: "ພາສາລາວ", my: "မြန်မာဘာသာ" };

type Row = {
  id: string;
  key: string;
  description: string | null;
  values: Partial<Record<Locale, { translationId: string; value: string }>>;
};

type HistoryEntry = {
  id: string;
  locale: Locale;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedBy: string;
};

export function TranslationGrid({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "missing" | "complete">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [historyKeyId, setHistoryKeyId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const missing = LOCALES.some((l) => !r.values[l]?.value);
      if (filter === "missing" && !missing) return false;
      if (filter === "complete" && missing) return false;
      if (!q) return true;
      const haystack = [r.key, r.description ?? "", ...LOCALES.map((l) => r.values[l]?.value ?? "")].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, filter]);

  const missingTotal = rows.filter((r) => LOCALES.some((l) => !r.values[l]?.value)).length;

  function updateLocalValue(rowId: string, locale: Locale, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [locale]: { translationId: r.values[locale]?.translationId ?? "", value } } } : r))
    );
  }

  function handleSave(rowId: string, locale: Locale, value: string) {
    startTransition(async () => {
      try {
        await upsertTranslationValue(rowId, locale, value);
      } catch (e) {
        alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  async function openHistory(rowId: string) {
    setHistoryKeyId(rowId);
    setHistoryLoading(true);
    try {
      const h = await getKeyTranslationHistory(rowId);
      setHistory(h);
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleExport() {
    const payload = rows.map((r) => ({
      key: r.key,
      description: r.description,
      values: Object.fromEntries(LOCALES.map((l) => [l, r.values[l]?.value ?? ""])),
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nineall-hr-translations-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { key: string; description?: string; values: Partial<Record<Locale, string>> }[];
        startTransition(async () => {
          const result = await importTranslationsBulk(parsed);
          setImportSummary(`นำเข้าสำเร็จ: เพิ่มใหม่ ${result.created} รายการ, อัปเดต ${result.updated} รายการ`);
          window.location.reload();
        });
      } catch {
        alert("ไฟล์ไม่ถูกต้อง กรุณาใช้ไฟล์ JSON ที่ export จากหน้านี้เท่านั้น");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col gap-4 border-b border-outline-variant p-6 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-96">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา key หรือคำแปล..."
            className="w-full rounded-xl border-[1.5px] border-outline-variant bg-surface py-2.5 pl-10 pr-4 text-sm focus:border-secondary focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded-xl border-[1.5px] border-outline-variant bg-surface px-3 py-2.5 text-sm focus:border-secondary focus:outline-none"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="missing">ยังไม่ครบ</option>
            <option value="complete">ครบทุกภาษา</option>
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl border-[1.5px] border-secondary px-3 py-2.5 text-sm font-bold text-secondary transition-all hover:-translate-y-px hover:shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border-[1.5px] border-secondary px-3 py-2.5 text-sm font-bold text-secondary transition-all hover:-translate-y-px hover:shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">file_upload</span>
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            เพิ่ม Key
          </button>
        </div>
      </div>

      {importSummary && <p className="px-6 pt-4 text-sm font-semibold text-status-success">{importSummary}</p>}

      <p className="flex items-center gap-1.5 px-6 pt-4 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-status-warning" style={{ fontSize: 18 }}>
          warning
        </span>
        คำแปลที่ยังไม่ครบ ({missingTotal})
      </p>

      {addOpen && <AddKeyForm onClose={() => setAddOpen(false)} />}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto p-6 md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant text-sm font-semibold text-on-surface-variant">
              <th className="pb-3">Key</th>
              {LOCALES.map((l) => (
                <th key={l} className="w-1/5 pb-3">
                  {LOCALE_LABEL[l]}
                </th>
              ))}
              <th className="w-[80px] pb-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-on-surface-variant">
                  {rows.length === 0 ? "ยังไม่มีรายการคำแปล เริ่มเพิ่ม Key แรกได้เลย" : "ไม่พบรายการที่ค้นหา"}
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} className="group hover:bg-surface-container/30">
                <td className="py-3 pr-2">
                  <div className="font-medium text-on-surface">{row.key}</div>
                  {row.description && <div className="text-xs text-on-surface-variant">{row.description}</div>}
                </td>
                {LOCALES.map((locale) => {
                  const missing = !row.values[locale]?.value;
                  return (
                    <td key={locale} className="relative py-3 pr-2">
                      <input
                        defaultValue={row.values[locale]?.value ?? ""}
                        onChange={(e) => updateLocalValue(row.id, locale, e.target.value)}
                        onBlur={(e) => handleSave(row.id, locale, e.target.value)}
                        placeholder={missing ? "Missing" : undefined}
                        className={`w-full rounded-md border border-transparent px-2 py-1.5 text-sm transition-all hover:border-outline-variant focus:border-secondary focus:bg-surface focus:outline-none ${
                          missing ? "bg-status-danger-bg placeholder:text-status-danger" : ""
                        }`}
                      />
                    </td>
                  );
                })}
                <td className="py-3 text-right">
                  <button
                    onClick={() => openHistory(row.id)}
                    title="ประวัติการแก้ไข"
                    className="rounded p-1.5 text-on-surface-variant opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                  >
                    <span className="material-symbols-outlined text-[18px]">history</span>
                  </button>
                  <DeleteKeyButton rowId={row.id} rowKey={row.key} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col divide-y divide-outline-variant p-4 md:hidden">
        {filteredRows.length === 0 && (
          <p className="py-10 text-center text-on-surface-variant">{rows.length === 0 ? "ยังไม่มีรายการคำแปล" : "ไม่พบรายการที่ค้นหา"}</p>
        )}
        {filteredRows.map((row) => (
          <div key={row.id} className="space-y-2 py-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{row.key}</span>
              <button onClick={() => openHistory(row.id)} className="text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">history</span>
              </button>
            </div>
            {LOCALES.map((locale) => {
              const missing = !row.values[locale]?.value;
              return (
                <div key={locale}>
                  <label className={`mb-1 block text-xs ${missing ? "text-status-danger" : "text-on-surface-variant"}`}>{LOCALE_LABEL[locale]}</label>
                  <input
                    defaultValue={row.values[locale]?.value ?? ""}
                    onChange={(e) => updateLocalValue(row.id, locale, e.target.value)}
                    onBlur={(e) => handleSave(row.id, locale, e.target.value)}
                    placeholder={missing ? "Missing" : undefined}
                    className={`w-full rounded-xl border-[1.5px] px-3 py-2 text-sm focus:outline-none ${
                      missing ? "border-status-danger bg-status-danger-bg" : "border-outline-variant focus:border-secondary"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {isPending && <p className="px-6 pb-4 text-xs text-on-surface-variant">กำลังบันทึก...</p>}

      {historyKeyId && (
        <HistoryPanel
          entries={history}
          loading={historyLoading}
          onClose={() => {
            setHistoryKeyId(null);
            setHistory([]);
          }}
        />
      )}
    </div>
  );
}

function DeleteKeyButton({ rowId, rowKey }: { rowId: string; rowKey: string }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
        <button
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              try {
                await deleteTranslationKey(rowId);
              } catch (e) {
                setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
                setConfirming(false);
              }
            });
          }}
          title={`ยืนยันลบ "${rowKey}"`}
          className="rounded px-2 py-1 text-xs font-bold text-white bg-status-danger disabled:opacity-50"
        >
          {isPending ? "..." : "ยืนยันลบ"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={isPending} className="rounded px-2 py-1 text-xs text-on-surface-variant">
          ยกเลิก
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => {
        setError(null);
        setConfirming(true);
      }}
      title="ลบ key"
      className="rounded p-1.5 text-on-surface-variant opacity-0 transition-opacity hover:text-status-danger group-hover:opacity-100 disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[18px]">delete</span>
    </button>
  );
}

function AddKeyForm({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [values, setValues] = useState<Partial<Record<Locale, string>>>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await createTranslationKey(key, description, values);
        onClose();
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="mx-6 mt-4 space-y-3 rounded-xl border border-outline-variant bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface-variant">Key (เช่น leave_request_button)</label>
          <input value={key} onChange={(e) => setKey(e.target.value)} className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface-variant">คำอธิบาย (ใช้ที่ไหน)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {LOCALES.map((l) => (
          <div key={l}>
            <label className="mb-1 block text-xs font-semibold text-on-surface-variant">{LOCALE_LABEL[l]}</label>
            <input
              value={values[l] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [l]: e.target.value }))}
              className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-status-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
          ยกเลิก
        </button>
        <button disabled={isPending || !key.trim()} onClick={submit} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          บันทึก
        </button>
      </div>
    </div>
  );
}

function HistoryPanel({ entries, loading, onClose }: { entries: HistoryEntry[]; loading: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">ประวัติการแก้ไข</h3>
          <button onClick={onClose} className="text-on-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {loading && <p className="text-sm text-on-surface-variant">กำลังโหลด...</p>}
        {!loading && entries.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีประวัติการแก้ไข</p>}
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg border border-outline-variant p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-on-surface-variant">
                <span className="font-bold uppercase">{e.locale}</span>
                <span>
                  {e.changedBy} • {new Date(e.changedAt).toLocaleString("th-TH")}
                </span>
              </div>
              <p>
                <span className="text-status-danger line-through">{e.oldValue ?? "(ว่าง)"}</span> →{" "}
                <span className="font-semibold text-status-success">{e.newValue ?? "(ว่าง)"}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
