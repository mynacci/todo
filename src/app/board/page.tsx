"use client";
import { useState } from "react";
import Board from "@/components/Board";
import { DailyView, StatusView, WeeklyView } from "@/components/TodoViews";

const VIEWS = [
  { id: "board", label: "보드" },
  { id: "daily", label: "일일" },
  { id: "weekly", label: "주간" },
  { id: "status", label: "상태별" },
] as const;

export default function BoardPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("board");
  return (
    <>
      <h1>보드</h1>
      <div className="tabs" role="tablist" aria-label="보기 방식">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={view === v.id ? "tab active" : "tab"}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "board" && <Board />}
      {view === "daily" && <DailyView />}
      {view === "weekly" && <WeeklyView />}
      {view === "status" && <StatusView />}
    </>
  );
}
