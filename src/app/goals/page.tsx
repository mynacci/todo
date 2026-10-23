"use client";
import Link from "next/link";
import { useState } from "react";
import { useGoals } from "@/lib/queries";
import type { Goal } from "@/lib/types";
import { DeleteGoalModal, GoalFormModal } from "@/components/GoalDialogs";
import { Empty, ErrorBox, Loading, ProgressBar } from "@/components/ui";

export default function GoalsPage() {
  const q = useGoals();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  return (
    <>
      <div className="page-head">
        <h1>목표</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>
          + 목표 추가
        </button>
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>등록된 목표가 없습니다. 첫 목표를 추가해 보세요.</Empty>
      ) : (
        <ul className="list">
          {q.data.map((g) => (
            <li key={g.id} className="item block">
              <div className="item-main">
                <Link href={`/goals/${g.id}`} className="item-title link">
                  {g.title}
                </Link>
                <span className="item-meta">
                  <span>{g.year}년</span>
                  <span>주간 계획 {g.weekCount}개</span>
                </span>
                <ProgressBar done={g.done} total={g.total} progress={g.progress} />
              </div>
              <div className="item-actions">
                <button className="btn small" onClick={() => setEditing(g)} aria-label={`${g.title} 수정`}>
                  수정
                </button>
                <button
                  className="btn small danger"
                  onClick={() => setDeleting(g)}
                  aria-label={`${g.title} 삭제`}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <GoalFormModal goal={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeleteGoalModal goal={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
