"use client";

import TweetInput from "@/components/TweetInput";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import ConnectButton from "@/components/wallet/ConnectButton";
import TweetEmbed from "@/components/TweetEmbed";

export default function AdminPage() {
  const { login, authenticated, ready, user, logout } = usePrivy();
  const { isConnected, chainId, address } = useAccount();
  const [activeTab, setActiveTab] = useState("yours");

  return (
    <div>
      {!isConnected && !authenticated && (
        <div className="flex justify-center items-center min-h-[60vh]">
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2">
                <Wallet className="h-6 w-6" />
                Connect Your Wallet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500 mb-6">
                Connect your wallet to manage your insights and investments
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {isConnected && authenticated && (
        <div className="flex justify-center">
          <Tabs
            defaultValue="yours"
            className="w-full max-w-[800px]"
            onValueChange={setActiveTab}
          >
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="yours">
                Insights you are invested in
              </TabsTrigger>
              <TabsTrigger value="admin">Your Created Insights</TabsTrigger>
              <TabsTrigger value="new">New Insight</TabsTrigger>
            </TabsList>

            <TabsContent value="yours">
              <div className="text-center text-gray-500 py-8"></div>
            </TabsContent>

            <TabsContent value="admin">
              <div className="text-center text-gray-500 py-8">
                Your admin insights will appear here
              </div>
            </TabsContent>

            <TabsContent value="new" className="flex justify-center">
              <TweetInput />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
