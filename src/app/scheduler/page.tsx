"use client";

import { Suspense } from "react";
import HomeClient from "../HomeClient";

export default function SchedulerPage() {
  return (
    <Suspense fallback={<div style={{ color: "#aaa" }}>Loading scheduler…</div>}>
      <HomeClient />
    </Suspense>
  );
}
