import Link from "next/link";
export default function Footer() {
  return (
    <footer className="flex gap-6 flex-wrap items-center justify-center text-xs text-muted-foreground py-4">
      @2025 The Lycra Company. All rights reserved. | <Link href="mailto:shawn.crowley@lycra.com">shawn.crowley@lycra.com</Link>
    </footer>
  );
}
