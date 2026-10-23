"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { useWeeks } from "@/lib/queries";
import { STATUSES, STATUS_LABEL, type Todo, type TodoStatus } from "@/lib/types";
import { Modal } from "@/components/ui";

export function TodoFormModal({
  todo,
  defaultWeekId,
  defaultDate,
  onClose,
}: {
  todo?: Todo;
  defaultWeekId?: string;
  defaultDate?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const weeks = useWeeks();
  const [title, setTitle] = useState(todo?.title ?? "");
  const [date, setDate] = useState(todo?.date ?? defaultDate ?? "");
  const [weekId, setWeekId] = useState(todo?.weekId ?? defaultWeekId ?? "");
  const [status, setStatus] = useState<TodoStatus>(todo?.status ?? "todo");
  const save = useMutation({
    mutationFn: () => {
      const body = { title: title.trim(), date: date || null, weekId: weekId || null, status };
      return todo
        ? api(`/api/todos/${todo.id}`, { method: "PATCH", body })
        : api("/api/todos", { method: "POST", body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal title={todo ? "할 일 수정" : "할 일 추가"} onClose={onClose}>
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
          날짜
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          주간 계획
          <select value={weekId} onChange={(e) => setWeekId(e.target.value)}>
            <option value="">(없음)</option>
            {weeks.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} ({w.startDate} ~ {w.endDate})
              </option>
            ))}
          </select>
        </label>
        <label>
          상태
          <select value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
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
          <button type="submit" className="btn primary" disabled={save.isPending || !title.trim()}>
            {save.isPending ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteTodoModal({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api(`/api/todos/${todo.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal title="할 일 삭제" onClose={onClose}>
      <p>
        <strong>{todo.title}</strong> 할 일을 삭제할까요?
      </p>
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

type Dialog =
  | { kind: "create"; defaultWeekId?: string; defaultDate?: string }
  | { kind: "edit"; todo: Todo }
  | { kind: "delete"; todo: Todo }
  | null;

/** Shared create/edit/delete dialog state for todo views. */
export function useTodoDialogs() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const dialogs = (
    <>
      {dialog?.kind === "create" && (
        <TodoFormModal
          defaultWeekId={dialog.defaultWeekId}
          defaultDate={dialog.defaultDate}
          onClose={close}
        />
      )}
      {dialog?.kind === "edit" && <TodoFormModal todo={dialog.todo} onClose={close} />}
      {dialog?.kind === "delete" && <DeleteTodoModal todo={dialog.todo} onClose={close} />}
    </>
  );
  return {
    dialogs,
    openCreate: (opts: { defaultWeekId?: string; defaultDate?: string } = {}) =>
      setDialog({ kind: "create", ...opts }),
    openEdit: (todo: Todo) => setDialog({ kind: "edit", todo }),
    openDelete: (todo: Todo) => setDialog({ kind: "delete", todo }),
  };
}
