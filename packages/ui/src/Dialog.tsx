import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  controlId?: string;
};

export function Dialog({ title, open, onClose, children, controlId }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    const focusable = node?.querySelector<HTMLElement>("input,button,textarea,select");
    focusable?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        {children}
        <button
          type="button"
          className="btn btn-secondary"
          data-control-id={controlId ?? "GLOBAL-12"}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
