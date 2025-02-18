// app/auth-error/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { XCircle } from "lucide-react";

export default function AuthError() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/");
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="p-6 flex flex-col items-center gap-4">
        <XCircle className="h-12 w-12 text-red-500" />
        <h1 className="text-2xl font-bold">Connection Failed</h1>
        <p className="text-gray-500">
          Unable to connect to Twitter. Please try again.
        </p>
      </Card>
    </div>
  );
}
