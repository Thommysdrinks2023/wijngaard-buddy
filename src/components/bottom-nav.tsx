import { Link, useLocation } from "@tanstack/react-router";
import { Home, BarChart3, Grape } from "lucide-react";

export function BottomNav() {
  const { pathname } = useLocation();
  const items = [
    { to: "/", label: "Rijen", icon: Grape, exact: true },
    { to: "/dashboard", label: "Dashboard", icon: BarChart3, exact: false },
    { to: "/instellingen", label: "Instellingen", icon: Home, exact: false },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-screen-md">
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <li key={it.to} className="flex-1">
              <Link
                to={it.to}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
