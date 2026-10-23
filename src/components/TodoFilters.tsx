"use client";
import { useEffect, useState } from "react";
import { useGoals, useWeeks, type TodoFilter } from "@/lib/queries";
import { STATUSES, STATUS_LABEL } from "@/lib/types";

export interface FilterValues {
  q: string;
  status: string;
  weekId: string;
  goalId: string;
  sort: "" | "date" | "-date";
}

const INITIAL: FilterValues = { q: "", status: "", weekId: "", goalId: "", sort: "" };

/** Filter state; the search text is debounced before it reaches the query params. */
export function useTodoFilters() {
  const [values, setValues] = useState<FilterValues>(INITIAL);
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(values.q.trim()), 300);
    return () => clearTimeout(t);
  }, [values.q]);
  const params: TodoFilter = {
    q: debouncedQ || undefined,
    status: values.status || undefined,
    weekId: values.weekId || undefined,
    goalId: values.goalId || undefined,
    sort: values.sort || undefined,
  };
  const active = !!(debouncedQ || values.status || values.weekId || values.goalId);
  return { values, setValues, params, active };
}

export type TodoFilters = ReturnType<typeof useTodoFilters>;

export function TodoFilterBar({
  filters,
  hide = [],
}: {
  filters: TodoFilters;
  hide?: ("status" | "week" | "goal")[];
}) {
  const { values, setValues } = filters;
  const weeks = useWeeks();
  const goals = useGoals();
  const set = <K extends keyof FilterValues>(k: K, v: FilterValues[K]) =>
    setValues((o) => ({ ...o, [k]: v }));
  return (
    <div className="toolbar filters" role="search" aria-label="검색과 필터">
      <input
        type="search"
        placeholder="제목 검색"
        aria-label="제목 검색"
        value={values.q}
        onChange={(e) => set("q", e.target.value)}
      />
      {!hide.includes("status") && (
        <label className="inline">
          상태
          <select value={values.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">전체</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      {!hide.includes("week") && (
        <label className="inline">
          주간 계획
          <select value={values.weekId} onChange={(e) => set("weekId", e.target.value)}>
            <option value="">전체</option>
            {weeks.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {!hide.includes("goal") && (
        <label className="inline">
          목표
          <select value={values.goalId} onChange={(e) => set("goalId", e.target.value)}>
            <option value="">전체</option>
            {goals.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="inline">
        정렬
        <select
          value={values.sort}
          onChange={(e) => set("sort", e.target.value as FilterValues["sort"])}
        >
          <option value="">기본</option>
          <option value="date">날짜 오름차순</option>
          <option value="-date">날짜 내림차순</option>
        </select>
      </label>
    </div>
  );
}
