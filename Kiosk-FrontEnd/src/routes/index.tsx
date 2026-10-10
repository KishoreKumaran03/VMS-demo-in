import { createFileRoute } from "@tanstack/react-router";
import { Kiosk } from "@/kiosk/Kiosk";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Northstar Visitor Check-in" },
      {
        name: "description",
        content:
          "Self-service visitor kiosk for Northstar: sign in, register as a walk-in, or sign out.",
      },
      { property: "og:title", content: "Northstar Visitor Check-in" },
      {
        property: "og:description",
        content:
          "Self-service visitor kiosk for Northstar: sign in, register as a walk-in, or sign out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Kiosk,
});
