"use client";
import { useWeeks } from "@/lib/queries";
import type { Todo } from "@/lib/types";
import { Empty, StatusBadge } from "@/components/ui";

export default function TodoList({
  todos,
  onEdit,
  onDelete,
  emptyText = "할 일이 없습니다.",
}: {
  todos: Todo[];
  onEdit: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  emptyText?: string;
}) {
  const weeks = useWeeks();
  if (todos.length === 0) return <Empty>{emptyText}</Empty>;
  const weekTitle = (id: string | null) => weeks.data?.find((w) => w.id === id)?.title;
  return (
    <ul className="list">
      {todos.map((t) => (
        <li key={t.id} className={`item${t.overdue ? " overdue" : ""}`}>
          <div className="item-main">
            <span className="item-title">{t.title}</span>
            <span className="item-meta">
              <StatusBadge status={t.status} />
              {t.date && <span>{t.date}</span>}
              {t.overdue && <span className="overdue-tag">지연</span>}
              {weekTitle(t.weekId) && <span>{weekTitle(t.weekId)}</span>}
            </span>
          </div>
          <div className="item-actions">
            <button className="btn small" onClick={() => onEdit(t)} aria-label={`${t.title} 수정`}>
              수정
            </button>
            <button
              className="btn small danger"
              onClick={() => onDelete(t)}
              aria-label={`${t.title} 삭제`}
            >
              삭제
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
