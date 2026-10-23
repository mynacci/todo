"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/client";
import { safeNextPath } from "@/lib/safe-next";

const ERROR_MESSAGES: Record<string, string> = {
  OAUTH_STATE: "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.",
  OAUTH_DENIED: "GitHub 로그인이 취소되었거나 거부되었습니다.",
  OAUTH_CODE: "GitHub에서 인증 코드를 받지 못했습니다. 다시 시도해 주세요.",
  OAUTH_GITHUB: "GitHub와 통신하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  CONFIG: "서버에 GitHub 로그인 설정이 없습니다.",
};

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get("error");
  const next = params.get("next");

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ login: string; avatarUrl: string }>("/api/me"),
    retry: false,
  });
  useEffect(() => {
    if (me.data) router.replace(safeNextPath(next, "/board"));
  }, [me.data, next, router]);

  const href = next ? `/auth/github?next=${encodeURIComponent(next)}` : "/auth/github";

  return (
    <>
      <h1>로그인</h1>
      {error && (
        <p role="alert" className="state error">
          {ERROR_MESSAGES[error] ?? "로그인에 실패했습니다. 다시 시도해 주세요."}
        </p>
      )}
      <p className="muted">할 일을 관리하려면 GitHub 계정으로 로그인하세요.</p>
      {/* A real navigation (not next/link): the OAuth route redirects off-site. */}
      <a className="btn primary" href={href}>
        GitHub로 로그인
      </a>
    </>
  );
}
