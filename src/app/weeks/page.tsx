"use client";
import Link from "next/link";
import { useState } from "react";
import { useGoals, useWeeks } from "@/lib/queries";
import type { Week } from "@/lib/types";
import { DeleteWeekModal, WeekFormModal } from "@/components/WeekDialogs";
import { Empty, ErrorBox, Loading, ProgressBar } from "@/components/ui";

export default function WeeksPage() {
  const q = useWeeks();
  const goals = useGoals();
  const [editing, setEditing] = useState<Week | "new" | null>(null);
  const [deleting, setDeleting] = useState<Week | null>(null);
  const goalTitle = (id: string | null) => goals.data?.find((g) => g.id === id)?.title;
  return (
    <>
      <div className="page-head">
        <h1>주간 계획</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>
          + 주간 계획 추가
        </button>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>등록된 주간 계획이 없습니다. 첫 주간 계획을 추가해 보세요.</Empty>
      ) : (
        <ul className="list">
          {q.data.map((w) => (
            <li key={w.id} className="item block">
              <div className="item-main">
                <Link href={`/weeks/${w.id}`} className="item-title link">
                  {w.title}
                </Link>
                <span className="item-meta">
                  <span>
                    {w.startDate} ~ {w.endDate}
                  </span>
                  {goalTitle(w.goalId) && <span>목표: {goalTitle(w.goalId)}</span>}
                </span>
                <ProgressBar done={w.done} total={w.total} progress={w.progress} />
              </div>
              <div className="item-actions">
                <button className="btn small" onClick={() => setEditing(w)} aria-label={`${w.title} 수정`}>
                  수정
                </button>
                <button
                  className="btn small danger"
                  onClick={() => setDeleting(w)}
                  aria-label={`${w.title} 삭제`}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <WeekFormModal week={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeleteWeekModal week={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
