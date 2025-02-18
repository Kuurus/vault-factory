"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

export default function AuthSuccess() {
  const router = useRouter();

  useEffect(() => {
    // Optional: Add any success handling logic here
    // You could fetch the user data or update UI state

    // Redirect to main page after a delay
    const timer = setTimeout(() => {
      router.push("/");
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="p-6 flex flex-col items-center gap-4">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <h1 className="text-2xl font-bold">Successfully Connected!</h1>
        <p className="text-gray-500">Redirecting you back...</p>
      </Card>
    </div>
  );
}
