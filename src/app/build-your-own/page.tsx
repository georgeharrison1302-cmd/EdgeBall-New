import { redirect } from "next/navigation";

/** Legacy path — Player Prop Engine lives at /props. */
export default function BuildYourOwnRedirect() {
  redirect("/props");
}
