import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../../lib/utils";

type CardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("rounded-lg border border-slate-800 bg-slate-900/70 p-4", className)} {...props}>
      {children}
    </div>
  );
}
