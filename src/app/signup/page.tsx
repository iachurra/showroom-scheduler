import React, { Suspense } from "react";
import SignupClient from "./SignupClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignupClient />
    </Suspense>
  );
}
