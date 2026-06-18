import { Link, useLocation } from "@tanstack/react-router";
import { BarChart3, Map, Calendar, Settings, LineChart, ClipboardList } from "lucide-react";

export function BottomNav() {
  const { pathname } = useLocation();
  const items = [
    { to: "/perceelkaart", label: "Kaart", icon: Map, exact: false },
    { to: "/seizoen", label: "Seizoen", icon: Calendar, exact: false },
    { to: "/steekproeven", label: "Steek", icon: ClipboardList, exact: false },
    { to: "/dashboard", label: "Dash", icon: BarChart3, exact: false },
    { to: "/grafieken", label: "Grafiek", icon: LineChart, exact: false },
    { to: "/instellingen", label: "Meer", icon: Settings, exact: false },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-nav shadow-[0_-1px_3px_rgba(0,0,0,0.08)]"
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
                className={`relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-nav-foreground" : "text-nav-muted hover:text-nav-foreground"
                }`}
              >
                {active && (
                  <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent-gold" />
                )}
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
