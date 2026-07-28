import * as React from "react";
import { cn } from "@/shared/presentation/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[#c4c2d4]">
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          className={cn(
            "flex min-h-[80px] w-full rounded-lg border bg-[#12121a] px-3 py-2 text-sm text-[#f1f0ff] placeholder:text-[#6b7280] transition-colors resize-none",
            "border-[#2a2a3d] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50",
            error && "border-red-500/50 focus:border-red-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={ref}
          {...props}
        />
        {hint && !error && <p className="text-xs text-[#6b7280]">{hint}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
