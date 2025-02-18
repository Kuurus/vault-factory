import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSwitchChain, useDisconnect } from "wagmi";
import { Button } from "../ui/button";
import { baseSepolia } from "viem/chains";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function CustomConnectButton() {
  const { login, authenticated, ready, user, logout } = usePrivy();
  const { isConnected, chainId, address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { disconnectAsync } = useDisconnect();
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const switchToBase = async () => {
      if (isConnected && chainId !== baseSepolia.id) {
        try {
          await switchChainAsync({ chainId: baseSepolia.id });
        } catch (error) {
          console.error("Failed to switch network:", error);
        }
      }
    };

    switchToBase();
  }, [isConnected, chainId, switchChainAsync]);

  const handleLogin = async () => {
    try {
      setIsConnecting(true);
      await login();
    } catch (error) {
      console.error("Login failed:", error);
      toast.error("Connection failed. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectAsync();
      await logout();
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
  };

  if (!ready) {
    return (
      <div
        aria-hidden="true"
        style={{
          opacity: 0,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    );
  }

  if (!authenticated || !user) {
    return (
      <Button
        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white flex items-center gap-2"
        onClick={handleLogin}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          "Connect"
        )}
      </Button>
    );
  }

  if (chainId && chainId !== baseSepolia.id) {
    return (
      <Button
        onClick={() => switchChainAsync({ chainId: baseSepolia.id })}
        className="bg-red-600 hover:bg-red-700 text-white"
      >
        Wrong network
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 transition-all duration-300"
        >
          {address
            ? `${address.slice(0, 6)}...${address.slice(-4)}`
            : "Connected"}
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={0}
        className="min-w-0 w-[var(--trigger-width)] rounded-t-none border-t-0"
        style={
          {
            "--trigger-width": "var(--radix-dropdown-menu-trigger-width)",
          } as React.CSSProperties
        }
      >
        <DropdownMenuItem
          onClick={handleDisconnect}
          className="text-red-600 cursor-pointer"
        >
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
