import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export function CookieConsent() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const consent = localStorage.getItem('cookie_consent');
        if (!consent) {
            setShow(true);
        }
    }, []);

    const accept = () => {
        localStorage.setItem('cookie_consent', 'true');
        setShow(false);
    };

    if (!show) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 animate-in slide-in-from-bottom duration-500">
            <div className="container max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground text-center md:text-left">
                    <p>
                        Utilizamos cookies para melhorar sua experiência e analisar o tráfego.
                        Ao continuar navegando, você concorda com nossa política de privacidade e uso de dados,
                        em conformidade com a LGPD.
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button onClick={accept} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        Entendi e Aceito
                    </Button>
                </div>
            </div>
        </div>
    );
}
