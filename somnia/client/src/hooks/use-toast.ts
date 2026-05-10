import { useEffect, useState } from "react";

export type ToastVariant = "default" | "destructive" | "success";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type ToastInput = Omit<ToastItem, "id"> & { id?: string };

const TOAST_LIMIT = 4;
const DEFAULT_DURATION = 5000;

type Listener = (toasts: ToastItem[]) => void;

let memoryToasts: ToastItem[] = [];
const listeners = new Set<Listener>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

function emit(): void {
  for (const listener of listeners) listener(memoryToasts);
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function scheduleDismiss(id: string, duration: number): void {
  const existing = timeouts.get(id);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    dismiss(id);
  }, duration);
  timeouts.set(id, handle);
}

export function toast(input: ToastInput): { id: string; dismiss: () => void } {
  const id = input.id ?? genId();
  const next: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? "default",
    duration: input.duration ?? DEFAULT_DURATION,
  };
  memoryToasts = [next, ...memoryToasts.filter((t) => t.id !== id)].slice(0, TOAST_LIMIT);
  emit();
  if (next.duration && next.duration > 0) {
    scheduleDismiss(id, next.duration);
  }
  return { id, dismiss: () => dismiss(id) };
}

export function dismiss(id?: string): void {
  if (id == null) {
    timeouts.forEach((t) => clearTimeout(t));
    timeouts.clear();
    memoryToasts = [];
    emit();
    return;
  }
  const handle = timeouts.get(id);
  if (handle) {
    clearTimeout(handle);
    timeouts.delete(id);
  }
  memoryToasts = memoryToasts.filter((t) => t.id !== id);
  emit();
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>(memoryToasts);

  useEffect(() => {
    const listener: Listener = (next) => setToasts(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { toasts, toast, dismiss };
}
