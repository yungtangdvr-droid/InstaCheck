import * as React from "react"

import { cn } from "@/lib/utils"

type DivProps = React.HTMLAttributes<HTMLDivElement>

function Card({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-glass)] text-card-foreground backdrop-blur-xl shadow-[var(--shadow-soft)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-6 pt-6 pb-3", className)}
      {...props}
    />
  )
}

function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "text-base font-semibold leading-tight tracking-[-0.01em]",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-[0.9375rem] text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 pb-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-[color:var(--surface-border)] px-6 py-4",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
}
