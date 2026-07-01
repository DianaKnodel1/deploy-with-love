import { createFileRoute, redirect } from "@tanstack/react-router";

// Alte "Personen"-Seite ist aufgeteilt in /admin/bewerbungen + /admin/mitarbeiter.
export const Route = createFileRoute("/admin/personen")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/bewerbungen" });
  },
  component: () => null,
});
