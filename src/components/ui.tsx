"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link, { type LinkProps } from "next/link";
import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  size?: "md" | "lg" | "sm";
};

type ButtonStyleProps = Pick<ButtonProps, "variant" | "size" | "className">;

function buttonClassName({ variant = "primary", size = "md", className }: ButtonStyleProps): string {
  return cn(
    "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-night",
    "disabled:opacity-45 disabled:pointer-events-none cursor-pointer",
    size === "lg" && "px-6 py-3 text-base sm:px-8 sm:py-3.5",
    size === "md" && "px-5 py-2.5 text-sm",
    size === "sm" && "px-3.5 py-1.5 text-xs",
    variant === "primary" && "accent-fill text-night font-semibold hover:brightness-110 active:scale-[0.98]",
    variant === "ghost" && "glass text-starlight hover:bg-white/10 active:scale-[0.98]",
    variant === "danger" && "bg-red-500/15 border border-red-400/30 text-red-300 hover:bg-red-500/25",
    className,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}

type ButtonLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  ButtonStyleProps;

/** Link styled as a button without invalid nested interactive markup. */
export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClassName({ variant, size, className })} {...props} />;
}

// ---------------------------------------------------------------------------

export function Field({ label, error, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string | null }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <label htmlFor={id} className="block text-left">
      {label && <span className="mb-1.5 block text-sm text-dim">{label}</span>}
      <input
        className={cn(
          "w-full min-h-12 rounded-xl border border-brass/15 bg-[#201912] px-4 py-3 text-starlight placeholder:text-dim",
          "focus:border-brass/60 focus:bg-[#251d16] focus:outline-none transition-colors",
          className,
        )}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
      />
      {error && <span id={errorId} role="alert" className="mt-1.5 block text-sm text-red-300">{error}</span>}
    </label>
  );
}

export function TextArea({ label, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <label htmlFor={id} className="block text-left">
      {label && <span className="mb-1.5 block text-sm text-dim">{label}</span>}
      <textarea
        className={cn(
          "w-full rounded-xl border border-brass/15 bg-[#201912] px-4 py-3 text-starlight placeholder:text-dim",
          "focus:border-brass/60 focus:bg-[#251d16] focus:outline-none transition-colors resize-none",
          className,
        )}
        id={id}
        {...props}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  // Portal to <body>: a modal rendered inside a backdrop-filtered / transformed
  // ancestor (e.g. the blurred vault header) would otherwise anchor its
  // position:fixed to THAT box, not the viewport — trapping it in a sliver.
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // Lock body scroll while a sheet is open so the page behind doesn't drift.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    requestAnimationFrame(() => (dialog?.querySelector<HTMLElement>(focusableSelector) ?? dialog)?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            className={cn(
              "glass max-h-[92dvh] w-full overscroll-contain overflow-y-auto rounded-t-[1.6rem] border-b-0 bg-night-2/98 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-h-[90dvh] sm:rounded-3xl sm:border-b sm:p-6 sm:pb-6",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
            )}
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Dialog"
            tabIndex={-1}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------------------

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-starlight/30 border-t-starlight", className)}
      aria-label="Loading"
      role="status"
    />
  );
}
