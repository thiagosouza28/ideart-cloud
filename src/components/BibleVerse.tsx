import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Book } from 'lucide-react';
import { invokeEdgeFunction } from '@/services/edgeFunctions';

interface BibleVerseData {
  book: {
    name: string;
    version: string;
    author: string;
  };
  chapter: number;
  number: number;
  text: string;
}

export function BibleVerse() {
  const [verse, setVerse] = useState<BibleVerseData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVerse = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const cached = localStorage.getItem('daily_verse');
        const cachedDate = localStorage.getItem('daily_verse_date');

        if (cached && cachedDate === today) {
          setVerse(JSON.parse(cached));
          setLoading(false);
          return;
        }

        const data = await invokeEdgeFunction<BibleVerseData>(
          'bible-verse',
          undefined,
          { method: 'GET', requireAuth: false }
        );
        setVerse(data);

        localStorage.setItem('daily_verse', JSON.stringify(data));
        localStorage.setItem('daily_verse_date', today);
      } catch {
        setVerse({
          book: { name: 'Joao', version: 'nvi', author: 'Joao' },
          chapter: 3,
          number: 16,
          text: 'Porque Deus tanto amou o mundo que deu o seu Filho Unigenito, para que todo o que nele crer nao pereca, mas tenha a vida eterna.'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchVerse();
  }, []);

  if (loading) return null;
  if (!verse) return null;

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 border-none shadow-sm mb-6">
      <CardContent className="p-6 flex gap-4">
        <div className="bg-primary/10 p-3 rounded-full h-fit">
          <Book className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg flex items-center gap-2 text-primary">
            Versiculo do Dia
          </h3>
          <blockquote className="italic text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
            "{verse.text}"
          </blockquote>
          <p className="text-sm font-medium text-right text-foreground">
            {verse.book.name} {verse.chapter}:{verse.number}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
