import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { publicSupabase } from '@/integrations/supabase/public-client';
import { getStoragePathFromUrl } from '@/lib/storage';

const ALLOWED_BUCKETS = new Set([
  'order-art-files',
  'order-final-photos',
  'payment-receipts',
  'product-images',
  'customer-photos',
]);

const getFileName = (path: string) => {
  const parts = path.split('/');
  const last = parts[parts.length - 1];
  return last || 'arquivo';
};

export default function SystemStorageFile() {
  const [searchParams] = useSearchParams();
  const bucket = (searchParams.get('bucket') || '').trim();
  const rawPath = (searchParams.get('path') || '').trim();
  const path = bucket && rawPath ? getStoragePathFromUrl(bucket, rawPath) : '';
  const fileName = useMemo(() => getFileName(path), [path]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let localBlobUrl: string | null = null;

    const loadFile = async () => {
      if (!bucket || !path) {
        setErrorMessage('Arquivo invalido.');
        setLoading(false);
        return;
      }

      if (!ALLOWED_BUCKETS.has(bucket)) {
        setErrorMessage('Bucket nao permitido.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      setBlobUrl(null);
      setMimeType(null);

      const { data, error } = await publicSupabase.storage.from(bucket).download(path);

      if (!active) return;

      if (error || !data) {
        setErrorMessage(error?.message || 'Nao foi possivel carregar o arquivo.');
        setLoading(false);
        return;
      }

      localBlobUrl = URL.createObjectURL(data);
      setBlobUrl(localBlobUrl);
      setMimeType(data.type || null);
      setLoading(false);
    };

    void loadFile();

    return () => {
      active = false;
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [bucket, path]);

  const isImage = Boolean(mimeType?.startsWith('image/')) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(path);
  const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(path);

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-base font-semibold text-foreground">Arquivo anexado</h1>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Voltar ao sistema</Link>
          </Button>
        </div>

        {loading && (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg border bg-card">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && blobUrl && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm">
                <a href={blobUrl} download={fileName}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Baixar arquivo
                </a>
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border bg-card">
              {isImage ? (
                <img src={blobUrl} alt={fileName} className="max-h-[78vh] w-full object-contain" />
              ) : isPdf ? (
                <iframe title={fileName} src={blobUrl} className="h-[78vh] w-full" />
              ) : (
                <div className="p-4 text-sm text-muted-foreground">
                  Sem visualizacao para este tipo de arquivo. Use o botao de download.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
