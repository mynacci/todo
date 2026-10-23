"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import type { ChildrenPolicy, Goal } from "@/lib/types";
import { Modal } from "@/components/ui";

type GoalLike = Pick<Goal, "id" | "title" | "year">;

export function GoalFormModal({ goal, onClose }: { goal?: GoalLike; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [year, setYear] = useState(String(goal?.year ?? new Date().getFullYear()));
  const save = useMutation({
    mutationFn: () => {
      const body = { title: title.trim(), year: Number(year) };
      return goal
        ? api(`/api/goals/${goal.id}`, { method: "PATCH", body })
        : api("/api/goals", { method: "POST", body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal title={goal ? "목표 수정" : "목표 추가"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label>
          제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>
        <label>
          연도
          <input
            type="number"
            value={year}
            min={1900}
            max={3000}
            onChange={(e) => setYear(e.target.value)}
            required
          />
        </label>
        {save.isError && (
          <p className="form-error" role="alert">
            {errorMessage(save.error)}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={save.isPending || !title.trim()}>
            {save.isPending ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteGoalModal({
  goal,
  onClose,
  onDeleted,
}: {
  goal: Goal;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [policy, setPolicy] = useState<ChildrenPolicy>("unlink");
  const del = useMutation({
    mutationFn: () => api(`/api/goals/${goal.id}?children=${policy}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
      onDeleted?.();
    },
  });
  return (
    <Modal title="목표 삭제" onClose={onClose}>
      <p>
        <strong>{goal.title}</strong> 목표를 삭제합니다.
      </p>
      <p className="muted">
        영향받는 주간 계획: <strong>{goal.weekCount}개</strong> (할 일 {goal.total}개)
      </p>
      <fieldset>
        <legend>연결된 주간 계획 처리</legend>
        <label className="radio">
          <input
            type="radio"
            name="policy"
            checked={policy === "unlink"}
            onChange={() => setPolicy("unlink")}
          />
          연결 해제 (주간 계획과 할 일은 유지)
        </label>
        <label className="radio">
          <input
            type="radio"
            name="policy"
            checked={policy === "cascade"}
            onChange={() => setPolicy("cascade")}
          />
          함께 삭제 (주간 계획 {goal.weekCount}개와 그 할 일 {goal.total}개 삭제)
        </label>
      </fieldset>
      {del.isError && (
        <p className="form-error" role="alert">
          {errorMessage(del.error)}
        </p>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>
          취소
        </button>
        <button className="btn danger" disabled={del.isPending} onClick={() => del.mutate()}>
          {del.isPending ? "삭제 중..." : "삭제"}
        </button>
      </div>
    </Modal>
  );
}
