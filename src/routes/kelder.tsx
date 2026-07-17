import { createFileRoute, Outlet } from "@tanstack/react-router";
import { vereistIngelogd } from "@/lib/auth-guard";

export const Route = createFileRoute("/kelder")({
  beforeLoad: () => vereistIngelogd("Log in om de kelder te beheren."),
  component: KelderLayout,
});

function KelderLayout() {
  return <Outlet />;
}
