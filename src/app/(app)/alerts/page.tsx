import { redirect } from "next/navigation";

/** The Alerts page became Analysis; old links still work. */
export default function AlertsPage() {
  redirect("/analysis");
}
