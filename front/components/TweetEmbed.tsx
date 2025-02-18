"use client";

import React, { useEffect, useRef } from "react";

interface TweetEmbedProps {
  tweetUrl: string;
  theme?: "light" | "dark";
}

const TweetEmbed: React.FC<TweetEmbedProps> = ({
  tweetUrl,
  theme = "light",
}) => {
  const tweetRef = useRef<HTMLDivElement>(null);
  const isRendered = useRef(false);

  useEffect(() => {
    const renderTweet = async () => {
      if (!tweetRef.current || isRendered.current) return;

      const tweetId = tweetUrl.split("/status/")[1]?.split("?")[0];
      if (!tweetId) return;

      // Set rendered flag
      isRendered.current = true;

      try {
        await window.twttr?.widgets?.createTweet(tweetId, tweetRef.current, {
          theme: theme,
          conversation: "none",
        });
      } catch (err) {
        console.error("Error rendering tweet:", err);
        isRendered.current = false;
      }
    };

    // Load Twitter widgets script if not already loaded
    if (!window.twttr) {
      const script = document.createElement("script");
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      document.head.appendChild(script);
    }

    // Check for twttr.widgets periodically
    const intervalId = setInterval(() => {
      if (window.twttr?.widgets) {
        renderTweet();
        clearInterval(intervalId);
      }
    }, 100);

    // Cleanup function
    return () => {
      clearInterval(intervalId);
      isRendered.current = false;
      if (tweetRef.current) {
        tweetRef.current.innerHTML = "";
      }
    };
  }, [tweetUrl, theme]);

  return <div ref={tweetRef} />;
};

export default TweetEmbed;

declare global {
  interface Window {
    // eslint-disable-next-line
    twttr: any;
  }
}
