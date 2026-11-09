import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "sign in · clickpoint." };

export default async function SignInPage() {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect("/library");

  return (
    <div>
      <SiteHeader />
      <main className="shell pb-20 pt-6">
        <div className="mx-auto max-w-md">
          <AuthForm mode="signin" />
        </div>
      </main>
    </div>
  );
}
