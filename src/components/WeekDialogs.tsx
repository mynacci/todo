"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { addDays, todayLocal, weekStart } from "@/lib/dates";
import { useGoals } from "@/lib/queries";
import type { ChildrenPolicy, Week } from "@/lib/types";
import { Modal } from "@/components/ui";

export function WeekFormModal({
  week,
  defaultGoalId,
  onClose,
}: {
  week?: Week;
  defaultGoalId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const goals = useGoals();
  const [title, setTitle] = useState(week?.title ?? "");
  const [startDate, setStartDate] = useState(week?.startDate ?? weekStart(todayLocal()));
  const [endDate, setEndDate] = useState(week?.endDate ?? addDays(startDate, 6));
  const [goalId, setGoalId] = useState(week?.goalId ?? defaultGoalId ?? "");
  const save = useMutation({
    mutationFn: () => {
      const body = { title: title.trim(), startDate, endDate, goalId: goalId || null };
      return week
        ? api(`/api/weeks/${week.id}`, { method: "PATCH", body })
        : api("/api/weeks", { method: "POST", body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
    },
  });
  const onStart = (v: string) => {
    setStartDate(v);
    if (v) setEndDate(addDays(v, 6));
  };
  return (
    <Modal title={week ? "주간 계획 수정" : "주간 계획 추가"} onClose={onClose}>
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
        <div className="row">
          <label>
            시작일
            <input type="date" value={startDate} onChange={(e) => onStart(e.target.value)} required />
          </label>
          <label>
            종료일 (시작일 +6일 자동)
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </label>
        </div>
        <label>
          상위 목표
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">(없음)</option>
            {goals.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
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
          <button
            type="submit"
            className="btn primary"
            disabled={save.isPending || !title.trim() || !startDate || !endDate}
          >
            {save.isPending ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteWeekModal({
  week,
  onClose,
  onDeleted,
}: {
  week: Week;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [policy, setPolicy] = useState<ChildrenPolicy>("unlink");
  const del = useMutation({
    mutationFn: () => api(`/api/weeks/${week.id}?children=${policy}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
      onDeleted?.();
    },
  });
  return (
    <Modal title="주간 계획 삭제" onClose={onClose}>
      <p>
        <strong>{week.title}</strong> 주간 계획을 삭제합니다.
      </p>
      <p className="muted">
        영향받는 할 일: <strong>{week.total}개</strong>
      </p>
      <fieldset>
        <legend>연결된 할 일 처리</legend>
        <label className="radio">
          <input
            type="radio"
            name="policy"
            checked={policy === "unlink"}
            onChange={() => setPolicy("unlink")}
          />
          연결 해제 (할 일은 유지)
        </label>
        <label className="radio">
          <input
            type="radio"
            name="policy"
            checked={policy === "cascade"}
            onChange={() => setPolicy("cascade")}
          />
          함께 삭제 (할 일 {week.total}개 삭제)
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
