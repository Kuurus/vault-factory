"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ky from "ky";
import { toast } from "react-toastify";
import { TwitterLoginButton } from "./TwitterLoginButton";
import TweetEmbed from "./TweetEmbed";
import { extractTweetText } from "@/lib/extractTweetData";

export default function TweetInput() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [tweetUrl, setTweetUrl] = useState<string | null>(null);
  const [tweetText, setTweetText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tweetUrl) {
      setTweetText("");
      return;
    }

    setIsLoading(true);

    extractTweetText(tweetUrl)
      .then((text) => setTweetText(text))
      .catch((err) => setError("Failed to extract tweet text"))
      .finally(() => setIsLoading(false));
  }, [tweetUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    setError("");

    const twitterUrlRegex =
      /^https?:\/\/(twitter|x)\.com\/(?:#!\/)?(\w+)\/status(es)?\/(\d+)/;
    if (value.match(twitterUrlRegex)) {
      setTweetUrl(value);
    } else {
      setTweetUrl(null);
    }
  };

  const handleCreateVault = async () => {
    if (!tweetText) {
      setError("Please enter a valid Twitter URL");
      return;
    }

    try {
      await ky
        .post("/api/vault/create", {
          json: {
            tweet: tweetText,
          },
        })
        .json();

      toast.success(`Vault created successfully`);
      setInput("");
      setTweetUrl(null);
      setTweetText("");
    } catch (err) {
      setError("Failed to create vault. Please try again.");
    }
  };

  return (
    <Card className="w-full max-w-md min-w-[600px]">
      <CardHeader>
        <CardTitle>Tweet Input</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Paste a Twitter URL..."
          value={input}
          onChange={handleInputChange}
        />
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {tweetUrl && (
          <div className="mt-4">
            <TweetEmbed tweetUrl={tweetUrl} theme="light" />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          onClick={handleCreateVault}
          disabled={!tweetUrl || !tweetText || isLoading}
        >
          Create Vault from Insight
        </Button>
        <TwitterLoginButton />
      </CardFooter>
    </Card>
  );
}
