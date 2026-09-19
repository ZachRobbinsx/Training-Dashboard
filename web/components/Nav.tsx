"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Overview"],
  ["/recovery", "Recovery"],
  ["/running", "Running"],
  ["/cycling", "Cycling"],
  ["/swimming", "Swimming"],
  ["/activities", "Activities"],
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
      <form className="logout" method="post" action="/api/logout">
        <button type="submit">Sign out</button>
      </form>
    </div>
  );
}
