import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function OfflinePage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <WifiOff className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Ești Offline</CardTitle>
          <CardDescription>
            Nu există conexiune la internet. Verifică conexiunea și încearcă din nou.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Reîncearcă
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Unele funcții sunt disponibile offline datorită cache-ului local.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
