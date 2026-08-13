"use client";

import { useFormStatus } from "react-dom";
import clsx from "clsx";

/**
 * Disables itself while the enclosing form's action is pending, so a slow request
 * (cold serverless start, flaky network) can't be fired twice by an impatient re-click.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={clsx(className, pending && "cursor-not-allowed opacity-60")}
    >
      {pending ? (pendingLabel ?? "กำลังบันทึก...") : children}
    </button>
  );
}
