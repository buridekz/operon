import type { Metadata } from "next";
import { Board } from "@/components/board";

export const metadata: Metadata = { title: "Operon · Wall board" };

export default function BoardPage() {
  return <Board />;
}
