import { Link, useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  Map,
  Calendar,
  Settings,
  LineChart,
  ClipboardList,
  Home,
  Wine,
  Grape,
  BookOpen,
  Container,
  Sparkles,
  Package,
  ShoppingCart,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
}

// Elke module heeft een eigen navigatiebalk: in de Wijngaard geen Kelder-links
// en andersom. "Home" brengt je altijd terug naar de modulekiezer op /.
// De hub zelf toont geen balk — dat scherm ís het menu.
const WIJNGAARD_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/perceelkaart", label: "Kaart", icon: Map },
  { to: "/seizoen", label: "Seizoen", icon: Calendar },
  { to: "/steekproeven", label: "Steek", icon: ClipboardList },
  { to: "/dashboard", label: "Dash", icon: BarChart3 },
  { to: "/grafieken", label: "Grafiek", icon: LineChart },
  { to: "/instellingen", label: "Meer", icon: Settings },
];

const KELDER_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/kelder", label: "Kelder", icon: Wine, exact: true },
  { to: "/kelder/partijen", label: "Partijen", icon: Grape },
  { to: "/kelder/tanks", label: "Tanks", icon: Container },
  { to: "/kelder/tankboek", label: "Boek", icon: BookOpen },
  { to: "/instellingen", label: "Meer", icon: Settings },
];

const ASSISTENT_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/assistent", label: "Assistent", icon: Sparkles },
  { to: "/instellingen", label: "Meer", icon: Settings },
];

const VOORRAAD_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/voorraad", label: "Voorraad", icon: Package, exact: true },
  { to: "/verkoop", label: "Verkoop", icon: ShoppingCart },
  { to: "/instellingen", label: "Meer", icon: Settings },
];

function itemsVoorPad(pathname: string): NavItem[] | null {
  if (pathname === "/") return null; // modulekiezer = zelf het menu
  if (pathname.startsWith("/kelder")) return KELDER_ITEMS;
  if (pathname.startsWith("/assistent")) return ASSISTENT_ITEMS;
  if (pathname.startsWith("/voorraad") || pathname.startsWith("/verkoop")) return VOORRAAD_ITEMS;
  return WIJNGAARD_ITEMS;
}

export function BottomNav() {
  const { pathname } = useLocation();
  const items = itemsVoorPad(pathname);
  if (!items) return null;

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
