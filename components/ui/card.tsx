import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-3xl border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}
