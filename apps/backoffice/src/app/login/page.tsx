"use client";

import { useRouter } from "next/navigation";
import { LoginForm } from "../../components/auth/login-form";
import { safeReturnPath } from "../../lib/navigation/safe-return-path";

export default function LoginPage() {
  const router = useRouter();
  return (
    <div className="bo-page-center">
      <LoginForm
        onSignedIn={() => {
          const next = new URLSearchParams(window.location.search).get("next");
          router.replace(safeReturnPath(next, window.location.origin));
        }}
      />
    </div>
  );
}
