import { getPosts } from "@/lib/blog-query";
import { BlogList } from "./components/blog-list";

export default async function BlogPage() {
  try {
    const data = await getPosts();
    
    if (!data || !data.posts || data.posts.length === 0) {
      return <div className="flex min-h-screen items-center justify-center">No posts yet</div>;
    }

    return <BlogList posts={data.posts} />;
  } catch (error) {
    console.error("Failed to fetch blog posts:", error);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-bold">Unable to load blog posts</h1>
        <p className="text-muted-foreground text-center max-w-md">
          We're having trouble loading the blog. This might be due to a temporary issue with our content management system.
        </p>
        <p className="text-sm text-muted-foreground">
          Please try again later or contact support if the issue persists.
        </p>
      </div>
    );
  }
}
