import { cn } from "@/lib/utils";

export function Card({ className, children }) {
  return <section className={cn("panel", className)}>{children}</section>;
}

export function CardHeader({ title, action }) {
  return (
    <header className="panel-header">
      <h2 className="panel-title">{title}</h2>
      {action}
    </header>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn("p-4", className)}>{children}</div>;
}
