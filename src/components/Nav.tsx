"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";

const ITEMS = [
  { href: "/goals", label: "목표" },
  { href: "/weeks", label: "주간" },
  { href: "/board", label: "보드" },
];

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const onLogin = path === "/login";
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ login: string; avatarUrl: string }>("/api/me"),
    enabled: !onLogin,
    retry: false,
  });

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      queryClient.clear();
      router.replace("/login");
    }
  }

  return (
    <header className="nav">
      <Link href="/board" className="brand">
        할 일 관리
      </Link>
      {!onLogin && (
        <nav aria-label="주 메뉴">
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={path.startsWith(i.href) ? "page" : undefined}
            >
              {i.label}
            </Link>
          ))}
        </nav>
      )}
      {!onLogin && me.data && (
        <div className="nav-user">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {me.data.avatarUrl && <img src={me.data.avatarUrl} alt="" width={24} height={24} />}
          <span data-testid="nav-login">@{me.data.login}</span>
          <button type="button" className="btn small" onClick={logout}>
            로그아웃
          </button>
        </div>
      )}
    </header>
  );
}
