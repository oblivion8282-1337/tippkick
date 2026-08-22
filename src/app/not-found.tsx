import Link from 'next/link';

import { LinkButton } from '@/components/link-button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

/** Deutsche 404-Seite (vorher die ungestylte Next-Standardseite). */
export default function NotFound() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="404" title="Seite nicht gefunden" />
      <Card>
        <CardContent className="text-muted-foreground space-y-4 py-8 text-sm">
          <p>Diese Seite existiert nicht — oder du hast keinen Zugriff darauf.</p>
          <LinkButton href="/dashboard" size="sm">
            Zum Dashboard
          </LinkButton>
          <p>
            Oder{' '}
            <Link href="/" className="text-primary hover:underline">
              zur Startseite
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
