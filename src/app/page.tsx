import { Playground } from "@/components/Playground";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { STRUCTURED_DATA } from "@/lib/site";

export default function Home() {
  return (
    <ErrorBoundary>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <Playground />
    </ErrorBoundary>
  );
}
