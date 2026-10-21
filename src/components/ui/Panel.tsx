import type { ReactNode } from "react";

interface PanelProps {
  id?: string;
  title: string;
  /** Short line describing scope, units or filters. */
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ id, title, description, actions, children, className = "", bodyClassName = "" }: PanelProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-28 rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(19_34_44/0.04)] ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[15px] font-semibold leading-6 text-ink">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-[13px] leading-5 text-ink-subtle">{description}</p> : null}
        </div>
        {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={bodyClassName || "px-4 py-4 sm:px-5"}>{children}</div>
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-line/70 ${className}`} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <div className="max-w-sm text-[13px] leading-5 text-ink-subtle">{children}</div> : null}
    </div>
  );
}
