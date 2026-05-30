import { useEffect, type ReactNode } from "react";
import { Icons } from "./Icons";

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  const w = size === "sm" ? "max-w-[460px]" : size === "lg" ? "max-w-[640px]" : "max-w-[540px]";
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[oklch(0.10_0.01_250/0.65)] backdrop-blur-sm animate-fade-in">
      <div onClick={e => e.stopPropagation()} className={`w-full ${w} bg-surface border border-border rounded-lg shadow-s2 max-h-[90vh] overflow-y-auto animate-fade-up`}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="m-0 text-base font-semibold">{title}</h2>
            {subtitle && <div className="text-[11.5px] text-text-faint mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm"><Icons.x className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
