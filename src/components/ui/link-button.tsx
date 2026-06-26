import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type Props = React.ComponentPropsWithoutRef<typeof Link> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
  };

export function LinkButton({ href, variant, size, className, children, ...props }: Props) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </Link>
  );
}
