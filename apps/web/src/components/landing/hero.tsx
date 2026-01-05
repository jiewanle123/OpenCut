"use client";

import { Button } from "../ui/button";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Handlebars } from "./handlebars";
import Link from "next/link";

export function Hero() {
  return (
    <div className="min-h-[calc(100svh-4.5rem)] flex flex-col justify-between items-center text-center px-4">
      <Image
        className="absolute top-0 left-0 -z-50 size-full object-cover invert dark:invert-0 opacity-85"
        src="/landing-page-dark.png"
        height={1903.5}
        width={1269}
        alt="landing-page.bg"
      />
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="inline-block font-bold tracking-tighter text-4xl md:text-[4rem]">
          <h1>The Open Source</h1>
          <Handlebars>Video Editor</Handlebars>
        </div>

        <p className="mt-10 text-base sm:text-xl text-muted-foreground font-light tracking-wide max-w-xl mx-auto">
          A simple but powerful video editor that gets the job done. Works on
          any platform.
        </p>

        <div className="mt-8 flex gap-8 justify-center">
          <Link href="/projects">
            <Button
              type="submit"
              size="lg"
              className="px-6 h-11 text-base bg-foreground"
            >
              Try early beta
              <ArrowRight className="ml-0.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
