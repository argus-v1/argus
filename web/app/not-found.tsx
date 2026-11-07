import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[760px] px-5 pb-24 pt-36 md:px-8">
      <h1 className="font-serif text-4xl font-light">Nothing watched here</h1>
      <p className="mt-3 text-pretty text-muted-foreground">Argus has no record at this address. The investigation may not have started yet, or the link has a typo.</p>
      <Button asChild className="mt-6" size="sm" variant="secondary"><Link href="/investigations">See all investigations</Link></Button>
    </main>
  );
}
