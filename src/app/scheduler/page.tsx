"use client";

import { Suspense } from "react";
import HomeClient from "../HomeClient";

export default function SchedulerPage() {
  return (
    <Suspense fallback={null}>
      <HomeClient />
    </Suspense>
  );
}
