import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12 card">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-bg-2 border border-border flex items-center justify-center text-text-faint mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-medium mb-1">{title}</h3>
      {description && (
        <p className="text-[13px] text-text-dim max-w-[420px]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
