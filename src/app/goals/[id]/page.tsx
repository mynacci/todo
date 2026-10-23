"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useGoal } from "@/lib/queries";
import { DeleteGoalModal, GoalFormModal } from "@/components/GoalDialogs";
import { WeekFormModal } from "@/components/WeekDialogs";
import { Empty, ErrorBox, Loading, ProgressBar } from "@/components/ui";

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useGoal(id);
  const [dialog, setDialog] = useState<"edit" | "delete" | "week" | null>(null);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const g = q.data;
  return (
    <>
      <p>
        <Link href="/goals" className="link">
          ← 목표 목록
        </Link>
      </p>
      <div className="page-head">
        <h1>
          {g.title} <small>{g.year}년</small>
        </h1>
        <div className="item-actions">
          <button className="btn" onClick={() => setDialog("edit")}>
            수정
          </button>
          <button className="btn danger" onClick={() => setDialog("delete")}>
            삭제
          </button>
        </div>
      </div>
      <h2>전체 진행률</h2>
      <ProgressBar done={g.done} total={g.total} progress={g.progress} />
      <div className="page-head">
        <h2>연결된 주간 계획 ({g.weeks.length})</h2>
        <button className="btn primary" onClick={() => setDialog("week")}>
          + 주간 계획 추가
        </button>
      </div>
      {g.weeks.length === 0 ? (
        <Empty>연결된 주간 계획이 없습니다.</Empty>
      ) : (
        <ul className="list">
          {g.weeks.map((w) => (
            <li key={w.id} className="item block">
              <div className="item-main">
                <Link href={`/weeks/${w.id}`} className="item-title link">
                  {w.title}
                </Link>
                <span className="item-meta">
                  {w.startDate} ~ {w.endDate}
                </span>
                <ProgressBar done={w.done} total={w.total} progress={w.progress} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog === "edit" && <GoalFormModal goal={g} onClose={() => setDialog(null)} />}
      {dialog === "week" && <WeekFormModal defaultGoalId={g.id} onClose={() => setDialog(null)} />}
      {dialog === "delete" && (
        <DeleteGoalModal
          goal={{ ...g, weekCount: g.weeks.length }}
          onClose={() => setDialog(null)}
          onDeleted={() => router.push("/goals")}
        />
      )}
    </>
  );
}
