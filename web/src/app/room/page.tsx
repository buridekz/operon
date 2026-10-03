import type { Metadata } from "next";
import { RoomConsole } from "@/components/room-console";

export const metadata: Metadata = { title: "Operon · Room" };

export default function RoomPage() {
  return <RoomConsole />;
}
