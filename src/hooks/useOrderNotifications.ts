import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

type OrderNotification = Database['public']['Tables']['order_notifications']['Row'];

export const useOrderNotifications = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const handledRef = useRef<Set<string>>(new Set());
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [isClearingNotifications, setIsClearingNotifications] = useState(false);

  const refreshUnreadNotificationsCount = useCallback(async () => {
    if (!profile?.company_id) {
      setUnreadNotificationsCount(0);
      return;
    }

    const { count, error } = await supabase
      .from('order_notifications')
      .select('id', { head: true, count: 'exact' })
      .eq('company_id', profile.company_id)
      .is('read_at', null);

    if (!error) {
      setUnreadNotificationsCount(count ?? 0);
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
      .order('created_at', { ascending: false });

    if (!error) {
      setNotifications((data as OrderNotification[]) ?? []);
    }

    setIsLoadingNotifications(false);
  }, [profile?.company_id]);

  const syncNotifications = useCallback(async () => {
    await Promise.all([refreshUnreadNotificationsCount(), refreshNotifications()]);
  }, [refreshNotifications, refreshUnreadNotificationsCount]);

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
        setUnreadNotificationsCount((prev) => Math.max(prev - 1, 0));
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
    if (unreadNotificationsCount === 0) return;

    setIsUpdatingNotifications(true);
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from('order_notifications')
      .update({ read_at: nowIso })
      .eq('company_id', profile.company_id)
      .is('read_at', null);

    if (!error) {
      setUnreadNotificationsCount(0);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.read_at
            ? notification
            : {
                ...notification,
                read_at: nowIso,
              },
        ),
      );
    } else {
      toast({
        title: 'Erro ao marcar notificações como lidas',
        variant: 'destructive',
      });
    }
    setIsUpdatingNotifications(false);
  }, [profile?.company_id, toast, unreadNotificationsCount]);

  const clearNotifications = useCallback(async () => {
    if (!profile?.company_id) return;
    if (notifications.length === 0) return;

    setIsClearingNotifications(true);

    const { error } = await supabase
      .from('order_notifications')
      .delete()
      .eq('company_id', profile.company_id);

    if (!error) {
      setNotifications([]);
      setUnreadNotificationsCount(0);
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
    void syncNotifications();
  }, [profile?.company_id, syncNotifications]);

  useEffect(() => {
    if (!profile?.company_id) {
      setUnreadNotificationsCount(0);
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

          setUnreadNotificationsCount((prev) => prev + 1);
          setNotifications((prev) => [notification, ...prev.filter((item) => item.id !== notification.id)]);
          void syncNotifications();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_notifications',
          filter: `company_id=eq.${profile.company_id}`,
        },
        () => {
          void syncNotifications();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'order_notifications',
          filter: `company_id=eq.${profile.company_id}`,
        },
        () => {
          void syncNotifications();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void syncNotifications();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, syncNotifications, toast]);

  return {
    unreadNotificationsCount,
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
