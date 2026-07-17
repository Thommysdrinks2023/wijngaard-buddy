import { createFileRoute, Outlet } from "@tanstack/react-router";
import { vereistIngelogd } from "@/lib/auth-guard";

export const Route = createFileRoute("/voorraad")({
  beforeLoad: () => vereistIngelogd("Log in om de voorraad te beheren."),
  component: VoorraadLayout,
});

function VoorraadLayout() {
  return <Outlet />;
}
