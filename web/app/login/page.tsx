import { redirect } from "next/navigation";
import { REQUIRE_LOGIN } from "@/lib/config";

export const metadata = { title: "Sign in" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!REQUIRE_LOGIN) redirect("/today");
  const { error } = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/login" className="card login-card">
        <h1>Training</h1>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required />
        {error && <p className="err">Wrong password.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
