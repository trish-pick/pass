"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: copy.nav.newAudit },
  { href: "/projects", label: copy.nav.projects },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
