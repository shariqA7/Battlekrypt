import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// The shared button, matching the design mockup: a cream (dark theme) / ink
// (light theme) primary button, a gold-outlined secondary one, and quiet ghost
// and danger variants. Colours come only from theme tokens, so every variant
// works in both themes. Use `href` to render a link that looks like a button.

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-bk-primary text-bk-on-primary hover:opacity-90",
  outline: "border border-bk-gold-to text-bk-gold-light hover:bg-bk-gold-from/10",
  ghost: "text-bk-body hover:text-bk-gold-light hover:bg-bk-heading/[0.05]",
  danger: "bg-bk-live text-white hover:opacity-90",
};

// 44px tall on phones (touch target), tighter on desktop.
const SIZE: Record<Size, string> = {
  sm: "h-[40px] sm:h-[34px] px-3 text-[11px]",
  md: "h-[44px] sm:h-[38px] px-5 text-[12px]",
  lg: "h-[52px] px-8 text-[14px]",
};

const BASE =
  "inline-flex items-center justify-center gap-2 font-sans font-bold uppercase tracking-[1.2px] transition-colors disabled:opacity-50 disabled:pointer-events-none";

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${extra}`.trim();
}

type Common = { variant?: Variant; size?: Size; className?: string; children: ReactNode };

export function Button({
  variant,
  size,
  className,
  children,
  type = "button",
  ...rest
}: Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant, size, className, children }: Common & { href: string }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
