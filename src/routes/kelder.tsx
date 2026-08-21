import { createFileRoute, Outlet } from "@tanstack/react-router";
import { vereistIngelogd } from "@/lib/auth-guard";

export const Route = createFileRoute("/kelder")({
  component: KelderLayout,
  beforeLoad: () => vereistIngelogd("Log in om de kelder te beheren."),
});

function KelderLayout() {
  return <Outlet />;
}
