"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import type { Goal, GoalDetail, Todo, Week } from "@/lib/types";

export interface TodoFilter {
  weekId?: string;
  date?: string;
  status?: string;
  q?: string;
  goalId?: string;
  sort?: "date" | "-date";
}

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const useGoals = () =>
  useQuery({ queryKey: ["goals"], queryFn: () => api<Goal[]>("/api/goals") });

export const useGoal = (id: string) =>
  useQuery({ queryKey: ["goal", id], queryFn: () => api<GoalDetail>(`/api/goals/${id}`) });

export const useWeeks = () =>
  useQuery({ queryKey: ["weeks"], queryFn: () => api<Week[]>("/api/weeks") });

export interface RetroSummary {
  progress: number;
  done: number;
  total: number;
}

export const useRetro = (id: string) =>
  useQuery({ queryKey: ["retro", id], queryFn: () => api<RetroSummary>(`/api/weeks/${id}/retro`) });

export const useWeek = (id: string) =>
  useQuery({ queryKey: ["week", id], queryFn: () => api<Week>(`/api/weeks/${id}`) });

export const useTodos = (filter: TodoFilter = {}, enabled = true) =>
  useQuery({
    queryKey: ["todos", filter],
    queryFn: () => api<Todo[]>(`/api/todos${qs({ ...filter })}`),
    enabled,
  });
