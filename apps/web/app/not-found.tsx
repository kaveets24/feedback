import Link from 'next/link';

// Shown for unknown URLs and every `notFound()`, including someone else's private track or
// project, which looks the same as a missing one (CLAUDE.md section 6, rule 9), so the copy
// never says which it is. Without this file Next renders its built-in page, whose unlayered
// `body { background: #fff }` beats the theme's layered styles.
export default function NotFound() {
  return (
    <main>
      <title>Not found · Feedback</title>
      <h1>Nothing here</h1>
      <p>This page doesn&apos;t exist, or it isn&apos;t shared with you.</p>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </main>
  );
}
