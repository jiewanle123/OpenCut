import { Metadata } from "next";
import { Header } from "@/components/header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { getPosts } from "@/lib/blog-query";
import { Post, Author } from "@/types/blog";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Blog - OpenCut",
  description:
    "Read the latest news and updates about OpenCut, the free and open-source video editor.",
  openGraph: {
    title: "Blog - OpenCut",
    description:
      "Read the latest news and updates about OpenCut, the free and open-source video editor.",
    type: "website",
  },
};

export default async function BlogPage() {
  const data = await getPosts();
  if (!data || !data.posts) return <div>No posts yet</div>;

  return (
    <div className="bg-background min-h-screen">
      <Header />
      <main className="container relative mx-auto max-w-3xl px-4 py-16">
        <BlogHeader />
        <div className="flex flex-col gap-8">
          {data.posts.map((post) => (
            <>
              <BlogPostItem key={post.id} post={post} />
              <Separator />
            </>
          ))}
        </div>
      </main>
    </div>
  );
}

function BlogHeader() {
  return (
    <div className="flex flex-col gap-6 pb-20 text-center">
      <h1 className="text-5xl font-bold tracking-tight md:text-6xl">Blog</h1>
      <p className="text-muted-foreground mx-auto max-w-2xl text-xl leading-relaxed">
        Read the latest news and updates about OpenCut, the free and open-source
        video editor.
      </p>
    </div>
  );
}

function BlogPostItem({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`}>
      <div className="h-auto w-full opacity-100 transition-opacity hover:opacity-75 flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{post.title}</h2>
          <p className="text-muted-foreground">{post.description}</p>
        </div>
        {post.authors && post.authors.length > 0 && (
          <AuthorList authors={post.authors} />
        )}
      </div>
    </Link>
  );
}

function AuthorList({ authors }: { authors: Author[] }) {
  return (
    <div className="flex items-center gap-2">
      {authors.map((author) => (
        <div key={author.id} className="flex items-center gap-2">
          <Avatar className="h-6 w-6 shadow-sm">
            <AvatarImage src={author.image} alt={author.name} />
            <AvatarFallback className="text-xs">
              {author.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      ))}
    </div>
  );
}
