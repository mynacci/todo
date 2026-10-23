"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { todayLocal } from "@/lib/dates";
import { useGoals, useRetro, useWeek } from "@/lib/queries";
import Board from "@/components/Board";
import { DeleteWeekModal, WeekFormModal } from "@/components/WeekDialogs";
import { ErrorBox, Loading, Modal, ProgressBar } from "@/components/ui";

export default function WeekDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useWeek(id);
  const goals = useGoals();
  const retro = useRetro(id);
  const [dialog, setDialog] = useState<"edit" | "delete" | "carry" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const carry = useMutation({
    mutationFn: () => api<{ moved: number }>(`/api/weeks/${id}/carryover`, { method: "POST" }),
    onSuccess: async (r) => {
      setDialog(null);
      setNotice(
        r.moved > 0
          ? `미완료 할 일 ${r.moved}개를 다음 주로 이월했습니다.`
          : "이월할 미완료 할 일이 없습니다.",
      );
      await qc.invalidateQueries();
    },
    onError: (e) => {
      setDialog(null);
      setNotice(`이월 실패: ${errorMessage(e)}`);
    },
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const w = q.data;
  const pending = w.total - w.done;
  const ended = w.endDate < todayLocal();
  const goal = goals.data?.find((g) => g.id === w.goalId);
  return (
    <>
      <p>
        <Link href="/weeks" className="link">
          ← 주간 목록
        </Link>
      </p>
      <div className="page-head">
        <h1>
          {w.title}{" "}
          <small>
            {w.startDate} ~ {w.endDate}
          </small>
        </h1>
        <div className="item-actions">
          <button
            className="btn"
            disabled={carry.isPending || pending === 0}
            title={pending === 0 ? "이월할 미완료 할 일이 없습니다." : undefined}
            onClick={() => setDialog("carry")}
          >
            미완료 이월
          </button>
          <button className="btn" onClick={() => setDialog("edit")}>
            수정
          </button>
          <button className="btn danger" onClick={() => setDialog("delete")}>
            삭제
          </button>
        </div>
      </div>
      {goal && (
        <p className="muted">
          상위 목표:{" "}
          <Link href={`/goals/${goal.id}`} className="link">
            {goal.title}
          </Link>
        </p>
      )}
      {notice && (
        <p className="state" role="status">
          {notice}
        </p>
      )}
      <h2>진행률</h2>
      <ProgressBar done={w.done} total={w.total} progress={w.progress} />
      <section
        className={`retro${ended ? " ended" : ""}`}
        aria-label="주간 회고"
        data-testid="retro"
      >
        <h2>주간 회고{ended && <span className="retro-tag">주간 종료</span>}</h2>
        {retro.isPending ? (
          <Loading />
        ) : retro.isError ? (
          <ErrorBox error={retro.error} onRetry={() => retro.refetch()} />
        ) : (
          <p className="retro-text">
            완료율 <strong>{retro.data.progress}%</strong> · 완료 {retro.data.done} / 전체{" "}
            {retro.data.total}
          </p>
        )}
      </section>
      <h2>보드</h2>
      <Board weekId={w.id} />
      {dialog === "carry" && (
        <Modal title="미완료 이월" onClose={() => !carry.isPending && setDialog(null)}>
          <p>
            미완료 할 일 <strong>{pending}개</strong>를 다음 주 계획으로 이동합니다. 다음 주 계획이
            없으면 새로 만듭니다.
          </p>
          <div className="actions">
            <button className="btn" disabled={carry.isPending} onClick={() => setDialog(null)}>
              취소
            </button>
            <button
              className="btn primary"
              disabled={carry.isPending}
              onClick={() => carry.mutate()}
            >
              {carry.isPending ? "이월 중..." : "이월"}
            </button>
          </div>
        </Modal>
      )}
      {dialog === "edit" && <WeekFormModal week={w} onClose={() => setDialog(null)} />}
      {dialog === "delete" && (
        <DeleteWeekModal week={w} onClose={() => setDialog(null)} onDeleted={() => router.push("/weeks")} />
      )}
    </>
  );
}
