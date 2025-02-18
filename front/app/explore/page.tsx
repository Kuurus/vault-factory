import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Image from "next/image";

// Dummy data for tweets
const tweets = [
  {
    id: "1",
    author: "John Doe",
    username: "johndoe",
    content: "This is a sample tweet about web development.",
    timestamp: "2h ago",
    likes: 15,
    retweets: 5,
    image: "https://picsum.photos/seed/1/800/400", // Random image
  },
  {
    id: "2",
    author: "Jane Smith",
    username: "janesmith",
    content: "Excited to announce my new project!",
    timestamp: "5h ago",
    likes: 32,
    retweets: 12,
    image: "https://picsum.photos/seed/2/800/400", // Different random image
  },
  // Add more dummy tweets as needed
];

export default function ExplorePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Explore Insights</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tweets.map((tweet) => (
          <Card key={tweet.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center space-x-4">
                <Avatar>
                  <AvatarImage
                    src={`https://api.dicebear.com/6.x/initials/svg?seed=${tweet.username}`}
                  />
                  <AvatarFallback>{tweet.author[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-sm font-medium">
                    {tweet.author}
                  </CardTitle>
                  <p className="text-sm text-gray-500">@{tweet.username}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative w-full h-[200px] overflow-hidden">
                <img
                  src={tweet.image}
                  alt="Tweet image"
                  className="rounded-lg object-cover w-full h-full hover:scale-105 transition-transform duration-300"
                />
              </div>

              <div className="flex space-x-4 text-sm text-gray-500">
                <span>{tweet.likes} Likes</span>
                <span>{tweet.retweets} Retweets</span>
                <span>{tweet.timestamp}</span>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end mt-auto pt-4 border-t">
              <Button
                variant="secondary"
                size="lg"
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Invest in Vault
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
