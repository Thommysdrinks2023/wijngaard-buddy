import { createFileRoute, Outlet } from "@tanstack/react-router";
import { vereistIngelogd } from "@/lib/auth-guard";

export const Route = createFileRoute("/voorraad")({
  component: VoorraadLayout,
  beforeLoad: () => vereistIngelogd("Log in om de voorraad te beheren."),
});

function VoorraadLayout() {
  return <Outlet />;
}
