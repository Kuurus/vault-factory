"use client";

import { Button } from "@/components/ui/button";
import { Twitter } from "lucide-react";

export function TwitterLoginButton() {
  const handleLogin = () => {
    window.location.href = "/api/auth/twitter";
  };

  return (
    <Button
      onClick={handleLogin}
      className="flex items-center gap-2"
      variant="outline"
    >
      <Twitter className="h-5 w-5" />
      Connect with Twitter
    </Button>
  );
}
