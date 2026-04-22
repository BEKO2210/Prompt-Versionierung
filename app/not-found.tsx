import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-medium">Not found.</h1>
        <p className="text-sm text-ink-500 mt-1">The resource you requested does not exist.</p>
        <Link href="/" className="inline-block mt-4 text-sm underline">← Back to workspace</Link>
      </div>
    </div>
  );
}
