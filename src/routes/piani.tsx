import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/piani")({
  beforeLoad: () => {
    throw redirect({ to: "/prezzi", statusCode: 301 });
  },
});

