import type { Metadata } from "next";
import { SpecialistPhone } from "@/components/specialist-phone";

export const metadata: Metadata = { title: "Operon · Specialist" };

export default function SpecialistPage() {
  return <SpecialistPhone />;
}
