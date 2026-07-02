import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/wijngaard")({
  beforeLoad: () => {
    throw redirect({ to: "/perceelkaart" });
  },
});
