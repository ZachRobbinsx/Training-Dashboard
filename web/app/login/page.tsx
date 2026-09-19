import Link from "next/link";
import { REQUIRE_LOGIN } from "@/lib/config";

export const metadata = { title: "Training" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!REQUIRE_LOGIN) {
    return (
      <main className="login">
        <div className="card login-card">
          <h1>Training</h1>
          <Link href="/today" className="enter">Enter</Link>
        </div>
      </main>
    );
  }
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
