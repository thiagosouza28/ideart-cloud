import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

const NEW_ORDER_NOTIFICATION_TYPE = 'new_order';
const RECENT_NOTIFICATIONS_LIMIT = 20;

type OrderNotification = Database['public']['Tables']['order_notifications']['Row'];

export const useOrderNotifications = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const handledRef = useRef<Set<string>>(new Set());
  const [unreadOrdersCount, setUnreadOrdersCount] = useState(0);
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  const refreshUnreadOrdersCount = useCallback(async () => {
    if (!profile?.company_id) {
      setUnreadOrdersCount(0);
      return;
    }

    const { count, error } = await supabase
      .from('order_notifications')
      .select('id', { head: true, count: 'exact' })
      .eq('company_id', profile.company_id)
      .eq('type', NEW_ORDER_NOTIFICATION_TYPE)
      .is('read_at', null);

    if (!error) {
      setUnreadOrdersCount(count ?? 0);
    }
  }, [profile?.company_id]);

  const refreshNotifications = useCallback(async () => {
    if (!profile?.company_id) {
      setNotifications([]);
      return;
    }

    setIsLoadingNotifications(true);

    const { data, error } = await supabase
      .from('order_notifications')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('type', NEW_ORDER_NOTIFICATION_TYPE)
      .order('created_at', { ascending: false })
      .limit(RECENT_NOTIFICATIONS_LIMIT);

    if (!error) {
      setNotifications((data as OrderNotification[]) ?? []);
    }

    setIsLoadingNotifications(false);
  }, [profile?.company_id]);

  const markUnreadOrdersAsRead = useCallback(async () => {
    if (!profile?.company_id) return;

    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from('order_notifications')
      .update({ read_at: nowIso })
      .eq('company_id', profile.company_id)
      .eq('type', NEW_ORDER_NOTIFICATION_TYPE)
      .is('read_at', null);

    if (!error) {
      setUnreadOrdersCount(0);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.read_at
            ? notification
            : {
                ...notification,
                read_at: nowIso,
              }
        )
      );
    }
  }, [profile?.company_id]);

  useEffect(() => {
    handledRef.current.clear();
    void Promise.all([refreshUnreadOrdersCount(), refreshNotifications()]);
  }, [profile?.company_id, refreshNotifications, refreshUnreadOrdersCount]);

  useEffect(() => {
    if (!profile?.company_id) {
      setUnreadOrdersCount(0);
      setNotifications([]);
      return;
    }

    const channel = supabase
      .channel(`order-notifications-${profile.company_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_notifications',
          filter: `company_id=eq.${profile.company_id}`,
        },
        (payload) => {
          const notification = payload.new as OrderNotification;

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

          if (notification.type === NEW_ORDER_NOTIFICATION_TYPE) {
            setUnreadOrdersCount((prev) => prev + 1);
            setNotifications((prev) =>
              [notification, ...prev.filter((item) => item.id !== notification.id)].slice(
                0,
                RECENT_NOTIFICATIONS_LIMIT
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, toast]);

  return {
    unreadOrdersCount,
    notifications,
    isLoadingNotifications,
    refreshNotifications,
    markUnreadOrdersAsRead,
  };
};
