import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/kelder")({
  component: KelderLayout,
});

function KelderLayout() {
  return <Outlet />;
}
