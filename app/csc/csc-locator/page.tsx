import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * "Find CSC Centre Near Me" — an external search shortcut, not a mapped
 * directory AnnaSetu verifies itself (spec §16, §17: no Google Maps API,
 * no implied live government data). This is intentionally not a mock-up
 * of a verified locator.
 */
export default function CscLocatorPage() {
  const query = encodeURIComponent('Common Service Centre CSC near me');
  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Find a CSC centre</h1>
      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 p-6">
          <p className="text-sm text-muted-foreground">
            CSC location information shown through an external search service is not directly
            verified by AnnaSetu. Please confirm availability before visiting.
          </p>
          <Button asChild>
            <a href={`https://www.google.com/search?q=${query}`} target="_blank" rel="noopener noreferrer">
              Search for a nearby CSC centre
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
