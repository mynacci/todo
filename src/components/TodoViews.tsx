"use client";
import { useState } from "react";
import { todayLocal } from "@/lib/dates";
import { useTodos, useWeeks } from "@/lib/queries";
import { STATUSES, STATUS_LABEL, type Todo, type TodoStatus } from "@/lib/types";
import { ErrorBox, Loading } from "@/components/ui";
import { useTodoDialogs } from "@/components/TodoDialogs";
import TodoList from "@/components/TodoList";
import { TodoFilterBar, useTodoFilters } from "@/components/TodoFilters";

type ListQuery = ReturnType<typeof useTodos>;

function Result({
  q,
  onEdit,
  onDelete,
  emptyText,
  filtered,
}: {
  q: ListQuery;
  onEdit: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  emptyText: string;
  filtered: boolean;
}) {
  if (q.isPending && q.fetchStatus !== "idle") return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TodoList
      todos={q.data ?? []}
      onEdit={onEdit}
      onDelete={onDelete}
      emptyText={filtered ? "조건에 맞는 할 일이 없습니다." : emptyText}
    />
  );
}

export function DailyView() {
  const [date, setDate] = useState(todayLocal());
  const f = useTodoFilters();
  const q = useTodos({ ...f.params, date, sort: f.params.sort ?? "date" }, !!date);
  const d = useTodoDialogs();
  return (
    <div>
      <div className="toolbar">
        <label className="inline">
          날짜
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn primary" onClick={() => d.openCreate({ defaultDate: date })}>
          + 할 일 추가
        </button>
      </div>
      <TodoFilterBar filters={f} />
      <Result
        q={q}
        onEdit={d.openEdit}
        onDelete={d.openDelete}
        emptyText="이 날짜의 할 일이 없습니다."
        filtered={f.active}
      />
      {d.dialogs}
    </div>
  );
}

export function WeeklyView() {
  const weeks = useWeeks();
  const [weekId, setWeekId] = useState("");
  const today = todayLocal();
  const current = weeks.data?.find((w) => w.startDate <= today && today <= w.endDate);
  const selected = weekId || current?.id || weeks.data?.[0]?.id || "";
  const f = useTodoFilters();
  const q = useTodos({ ...f.params, weekId: selected, sort: f.params.sort ?? "date" }, !!selected);
  const d = useTodoDialogs();
  if (weeks.isPending) return <Loading />;
  if (weeks.isError) return <ErrorBox error={weeks.error} onRetry={() => weeks.refetch()} />;
  return (
    <div>
      <div className="toolbar">
        <label className="inline">
          주간 계획
          <select value={selected} onChange={(e) => setWeekId(e.target.value)}>
            {weeks.data.length === 0 && <option value="">(주간 계획 없음)</option>}
            {weeks.data.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} ({w.startDate} ~ {w.endDate})
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" onClick={() => d.openCreate({ defaultWeekId: selected })}>
          + 할 일 추가
        </button>
      </div>
      {selected ? (
        <>
          <TodoFilterBar filters={f} hide={["week"]} />
          <Result
            q={q}
            onEdit={d.openEdit}
            onDelete={d.openDelete}
            emptyText="이 주간 계획에 할 일이 없습니다."
            filtered={f.active}
          />
        </>
      ) : (
        <p className="state empty">주간 계획을 먼저 만들어 주세요.</p>
      )}
      {d.dialogs}
    </div>
  );
}

export function StatusView() {
  const [status, setStatus] = useState<TodoStatus>("todo");
  const f = useTodoFilters();
  const q = useTodos({ ...f.params, status, sort: f.params.sort ?? "date" });
  const d = useTodoDialogs();
  return (
    <div>
      <div className="toolbar">
        <label className="inline">
          상태
          <select value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn primary" onClick={() => d.openCreate()}>
          + 할 일 추가
        </button>
      </div>
      <TodoFilterBar filters={f} hide={["status"]} />
      <Result
        q={q}
        onEdit={d.openEdit}
        onDelete={d.openDelete}
        emptyText="해당 상태의 할 일이 없습니다."
        filtered={f.active}
      />
      {d.dialogs}
    </div>
  );
}
