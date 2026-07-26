import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/voorraad")({
  component: VoorraadLayout,
});

function VoorraadLayout() {
  return <Outlet />;
}
