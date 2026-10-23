"use client";
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TodoFilterBar, useTodoFilters } from "@/components/TodoFilters";
import { applyMove, columnOf, computeMove } from "@/lib/board";
import { api, errorMessage } from "@/lib/client";
import { useTodos } from "@/lib/queries";
import { STATUSES, STATUS_LABEL, type Todo, type TodoStatus } from "@/lib/types";
import { Empty, ErrorBox, Loading } from "@/components/ui";
import { useTodoDialogs } from "@/components/TodoDialogs";

const COL_PREFIX = "col:";

function Card({
  todo,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card${todo.overdue ? " overdue" : ""}${isDragging ? " dragging" : ""}`}
      data-testid={`card-${todo.id}`}
      {...attributes}
      {...listeners}
    >
      <div className="card-title">{todo.title}</div>
      <div className="item-meta">
        {todo.date && <span>{todo.date}</span>}
        {todo.overdue && <span className="overdue-tag">지연</span>}
      </div>
      <div className="item-actions" onKeyDown={(e) => e.stopPropagation()}>
        <button className="btn small" onClick={onEdit} aria-label={`${todo.title} 수정`}>
          수정
        </button>
        <button className="btn small danger" onClick={onDelete} aria-label={`${todo.title} 삭제`}>
          삭제
        </button>
      </div>
    </li>
  );
}

function Column({
  status,
  todos,
  onEdit,
  onDelete,
}: {
  status: TodoStatus;
  todos: Todo[];
  onEdit: (t: Todo) => void;
  onDelete: (t: Todo) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COL_PREFIX + status });
  return (
    <section
      className={`column${isOver ? " over" : ""}`}
      aria-label={STATUS_LABEL[status]}
      data-testid={`column-${status}`}
    >
      <h3>
        {STATUS_LABEL[status]} <span className="count">{todos.length}</span>
      </h3>
      <SortableContext items={todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="column-body">
          {todos.map((t) => (
            <Card key={t.id} todo={t} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
          ))}
          {todos.length === 0 && <li className="column-empty">비어 있음</li>}
        </ul>
      </SortableContext>
    </section>
  );
}

export default function Board({ weekId }: { weekId?: string }) {
  const qc = useQueryClient();
  const filters = useTodoFilters();
  const effectiveWeek = weekId ?? (filters.params.weekId || undefined);
  const todosQ = useTodos({ ...filters.params, weekId: effectiveWeek });
  const dialogs = useTodoDialogs();
  const [moveError, setMoveError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = useMutation({
    mutationFn: (v: { id: string; status: TodoStatus; order: number }) =>
      api<Todo>(`/api/todos/${v.id}`, {
        method: "PATCH",
        body: { status: v.status, order: v.order },
      }),
    onMutate: async (v) => {
      setMoveError(null);
      await qc.cancelQueries({ queryKey: ["todos"] });
      const snapshots = qc.getQueriesData<Todo[]>({ queryKey: ["todos"] });
      qc.setQueriesData<Todo[]>({ queryKey: ["todos"] }, (old) =>
        old ? applyMove(old, v.id, v) : old,
      );
      return { snapshots };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      setMoveError(`이동에 실패해 되돌렸습니다: ${errorMessage(e)}`);
    },
    // refresh todos and week/goal progress
    onSettled: () => qc.invalidateQueries(),
  });

  const onDragEnd = (e: DragEndEvent) => {
    const todos = todosQ.data;
    if (!todos || !e.over) return;
    const id = String(e.active.id);
    const overId = String(e.over.id);
    if (overId === id) return;
    let status: TodoStatus;
    let before: string | null = null;
    if (overId.startsWith(COL_PREFIX)) {
      status = overId.slice(COL_PREFIX.length) as TodoStatus;
    } else {
      const target = todos.find((t) => t.id === overId);
      if (!target) return;
      status = target.status;
      before = overId;
    }
    const m = computeMove(todos, id, status, before);
    if (m) move.mutate({ id, ...m });
  };

  return (
    <div>
      <div className="toolbar">
        <button
          className="btn primary"
          onClick={() => dialogs.openCreate({ defaultWeekId: effectiveWeek })}
        >
          + 할 일 추가
        </button>
      </div>
      <TodoFilterBar filters={filters} hide={weekId ? ["week", "goal"] : []} />
      {moveError && (
        <div className="state error" role="alert">
          <span>{moveError}</span>
          <button className="btn small" onClick={() => setMoveError(null)}>
            닫기
          </button>
        </div>
      )}
      {todosQ.isPending ? (
        <Loading />
      ) : todosQ.isError ? (
        <ErrorBox error={todosQ.error} onRetry={() => todosQ.refetch()} />
      ) : (
        <>
          {todosQ.data.length === 0 && (
            <Empty>
              {filters.active
                ? "조건에 맞는 할 일이 없습니다."
                : "아직 할 일이 없습니다. 할 일을 추가해 보세요."}
            </Empty>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <div className="board">
              {STATUSES.map((s) => (
                <Column
                  key={s}
                  status={s}
                  todos={columnOf(todosQ.data, s, !!filters.params.sort)}
                  onEdit={dialogs.openEdit}
                  onDelete={dialogs.openDelete}
                />
              ))}
            </div>
          </DndContext>
        </>
      )}
      {dialogs.dialogs}
    </div>
  );
}
