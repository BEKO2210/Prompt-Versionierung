import Link from "next/link";
import { IconArrow } from "../src/ui/common/Icon";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8 bg-ink-50 dark:bg-[#0e1018]">
      <div className="max-w-md text-center">
        <div className="eyebrow mb-2">404</div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          This path does not exist.
        </h1>
        <p className="text-sm text-ink-500 mt-2">
          The resource you requested was not found — it may have been archived,
          renamed, or never existed.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 mt-5 text-sm font-medium text-accent-600 dark:text-accent-400 hover:underline"
        >
          Back to workspace
          <IconArrow size={14} />
        </Link>
      </div>
    </div>
  );
}
