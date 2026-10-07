import { redirect } from "next/navigation";

/** Tracker merged into Portfolio → Model Accuracy tab. */
export default function TrackerRedirect() {
  redirect("/portfolio?tab=model");
}
