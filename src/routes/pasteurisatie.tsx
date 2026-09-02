import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pasteurisatie")({
  component: PasteurisatieLayout,
});

function PasteurisatieLayout() {
  return <Outlet />;
}
