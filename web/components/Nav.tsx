"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { REQUIRE_LOGIN } from "@/lib/config";

const LINKS = [
  ["/today", "Overview"],
  ["/running", "Running"],
  ["/cycling", "Cycling"],
  ["/swimming", "Swimming"],
  ["/gym", "Training"],
];

export default function Nav() {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  return (
    <div className="topbar">
      <span className="brand">Training</span>
      <nav className="nav">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      {REQUIRE_LOGIN && (
        <form className="logout" method="post" action="/api/logout">
          <button type="submit">Sign out</button>
        </form>
      )}
    </div>
  );
}
