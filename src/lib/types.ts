export type TodoStatus = "todo" | "doing" | "done";

export const STATUSES: TodoStatus[] = ["todo", "doing", "done"];
export const STATUS_LABEL: Record<TodoStatus, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

export interface Todo {
  id: string;
  title: string;
  date: string | null;
  status: TodoStatus;
  weekId: string | null;
  order: number;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Week {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  goalId: string | null;
  done: number;
  total: number;
  progress: number;
}

export interface Goal {
  id: string;
  title: string;
  year?: number;
  weekCount: number;
  done: number;
  total: number;
  progress: number;
}

export interface GoalDetail extends Omit<Goal, "weekCount"> {
  weeks: Week[];
}

export type ChildrenPolicy = "unlink" | "cascade";
