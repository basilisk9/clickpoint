import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "sign up · clickpoint." };

export default async function SignUpPage() {
  /* Landing here while already signed in means the account is live; send them
     to the library instead of offering to create a second one. */
  const user = await getSessionUser().catch(() => null);
  if (user) redirect("/library");

  return (
    <div>
      <SiteHeader />
      <main className="shell pb-20 pt-6">
        <div className="mx-auto max-w-md">
          <AuthForm mode="signup" />
        </div>
      </main>
    </div>
  );
}
