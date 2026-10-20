import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <SignIn />
    </main>
  );
}
