import { Star } from "lucide-react";

interface RijpheidStarsProps {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "lg";
}

export function RijpheidStars({ value, onChange, size = "lg" }: RijpheidStarsProps) {
  const cls = size === "lg" ? "h-12 w-12" : "h-5 w-5";
  const btnCls =
    size === "lg" ? "h-14 w-14 flex items-center justify-center rounded-full" : "inline-flex";
  return (
    <div className={size === "lg" ? "flex items-center gap-1" : "inline-flex items-center gap-0.5"}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        const Comp: "button" | "span" = onChange ? "button" : "span";
        return (
          <Comp
            key={n}
            type={onChange ? "button" : undefined}
            onClick={onChange ? () => onChange(n) : undefined}
            aria-label={`Rijpheid ${n}`}
            className={btnCls}
          >
            <Star
              className={cls}
              strokeWidth={1.5}
              fill={active ? "currentColor" : "none"}
              color={active ? "var(--color-accent)" : "var(--color-muted-foreground)"}
            />
          </Comp>
        );
      })}
    </div>
  );
}
