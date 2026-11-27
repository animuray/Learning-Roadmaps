"use client";

import { useEffect } from "react";
import { trackTopicView } from "@/app/actions/learning";

/** Засчитывает «чтение» темы, если страница открыта хотя бы 15 секунд (не срабатывает на префетч). */
export function ViewTracker({ roadmap, topic }: { roadmap: string; topic: string }) {
  useEffect(() => {
    const id = setTimeout(() => {
      trackTopicView(roadmap, topic).catch(() => {});
    }, 15_000);
    return () => clearTimeout(id);
  }, [roadmap, topic]);
  return null;
}
