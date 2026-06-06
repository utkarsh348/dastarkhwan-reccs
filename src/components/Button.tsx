import Link from "next/link";
import { clsx } from "clsx";

type ButtonProps = {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
};

export function Button({ href, children, variant = "primary", type = "button", disabled, onClick }: ButtonProps) {
  const className = clsx("ui-button", `ui-button-${variant}`, disabled && "ui-button-disabled");
  const external = href?.startsWith("http");

  if (href && external) {
    return (
      <a className={className} data-testid="button-link" href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  }

  if (href) {
    return (
      <Link className={className} data-testid="button-link" href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={className} data-testid="button" disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  );
}
