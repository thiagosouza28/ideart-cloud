import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

const NEW_ORDER_NOTIFICATION_TYPE = 'new_order';

type OrderNotification = Database['public']['Tables']['order_notifications']['Row'];

export const useOrderNotifications = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const handledRef = useRef<Set<string>>(new Set());
  const [unreadOrdersCount, setUnreadOrdersCount] = useState(0);
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [isClearingNotifications, setIsClearingNotifications] = useState(false);

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
      .order('created_at', { ascending: false });

    if (!error) {
      setNotifications((data as OrderNotification[]) ?? []);
    }

    setIsLoadingNotifications(false);
  }, [profile?.company_id]);

  const markNotificationAsRead = useCallback(
    async (notificationId: string) => {
      if (!profile?.company_id) return;

      const target = notifications.find((notification) => notification.id === notificationId);
      if (!target || target.read_at) return;

      const nowIso = new Date().toISOString();

      const { error } = await supabase
        .from('order_notifications')
        .update({ read_at: nowIso })
        .eq('id', notificationId)
        .eq('company_id', profile.company_id)
        .is('read_at', null);

      if (!error) {
        setUnreadOrdersCount((prev) => Math.max(prev - 1, 0));
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === notificationId
              ? {
                  ...notification,
                  read_at: notification.read_at ?? nowIso,
                }
              : notification,
          ),
        );
      }
    },
    [notifications, profile?.company_id],
  );

  const markUnreadOrdersAsRead = useCallback(async () => {
    if (!profile?.company_id) return;
    if (unreadOrdersCount === 0) return;

    setIsUpdatingNotifications(true);
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
    } else {
      toast({
        title: 'Erro ao marcar notificações como lidas',
        variant: 'destructive',
      });
    }
    setIsUpdatingNotifications(false);
  }, [profile?.company_id, toast, unreadOrdersCount]);

  const clearNotifications = useCallback(async () => {
    if (!profile?.company_id) return;
    if (notifications.length === 0) return;

    setIsClearingNotifications(true);

    const { error } = await supabase
      .from('order_notifications')
      .delete()
      .eq('company_id', profile.company_id)
      .eq('type', NEW_ORDER_NOTIFICATION_TYPE);

    if (!error) {
      setNotifications([]);
      setUnreadOrdersCount(0);
      handledRef.current.clear();
      toast({ title: 'Notificações removidas' });
    } else {
      toast({
        title: 'Erro ao limpar notificações',
        variant: 'destructive',
      });
    }

    setIsClearingNotifications(false);
  }, [notifications.length, profile?.company_id, toast]);

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
              [notification, ...prev.filter((item) => item.id !== notification.id)]
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
    isUpdatingNotifications,
    isClearingNotifications,
    refreshNotifications,
    markNotificationAsRead,
    markUnreadOrdersAsRead,
    clearNotifications,
  };
};
