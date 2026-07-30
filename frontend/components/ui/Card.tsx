import clsx from "clsx";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-nw-border bg-nw-surface p-3 flex flex-col gap-2",
        className
      )}
    >
      {children}
    </div>
  );
}
