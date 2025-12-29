import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export const useOrderNotifications = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile?.company_id) return;

    const channel = supabase
      .channel('order-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_notifications',
          filter: `company_id=eq.${profile.company_id}`,
        },
        (payload) => {
          const notification = payload.new as {
            id: string;
            title: string;
            body: string | null;
          };

          if (handledRef.current.has(notification.id)) return;
          handledRef.current.add(notification.id);

          toast({
            title: notification.title,
            description: notification.body || undefined,
          });

          try {
            const audio = new Audio('/notification.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch {
            // ignore
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, toast]);
};
