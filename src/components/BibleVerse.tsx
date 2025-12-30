import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Book, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

    // Use a stable key for daily verses to avoid fetching on every refresh (optional, but good for "Daily" feel)
    // Or just fetch random every time if requested. The request says "Versículo do dia".
    // Ideally we cache it for the day.

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

                const response = await fetch('https://www.abibliadigital.com.br/api/verses/nvi/random');
                if (!response.ok) throw new Error('Falha ao buscar versículo');

                const data = await response.json();
                setVerse(data);

                localStorage.setItem('daily_verse', JSON.stringify(data));
                localStorage.setItem('daily_verse_date', today);
            } catch {
                // Silently fail and use fallback
                // console.warn('Bible API unavailable, using fallback.');
                // Fallback verse
                setVerse({
                    book: { name: 'João', version: 'nvi', author: 'João' },
                    chapter: 3,
                    number: 16,
                    text: 'Porque Deus tanto amou o mundo que deu o seu Filho Unigênito, para que todo o que nele crer não pereça, mas tenha a vida eterna.'
                });
            } finally {
                setLoading(false);
            }
        };

        fetchVerse();
    }, []);

    if (loading) return null; // Or skeleton
    if (!verse) return null;

    return (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 border-none shadow-sm mb-6">
            <CardContent className="p-6 flex gap-4">
                <div className="bg-primary/10 p-3 rounded-full h-fit">
                    <Book className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-2">
                    <h3 className="font-semibold text-lg flex items-center gap-2 text-primary">
                        Versículo do Dia
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
