import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/rij/$rijId")({
  component: RijLayout,
});

function RijLayout() {
  return <Outlet />;
}
