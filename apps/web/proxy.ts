import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files unless they appear in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    // Clerk's frontend API proxy. With a production key on a *.vercel.app host (staging),
    // clerkMiddleware serves Clerk's scripts and API from /__clerk, including .js files the
    // static-file rule above would skip.
    '/__clerk/(.*)',
  ],
};
