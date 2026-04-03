import { Network } from '@capacitor/network';
import { supabase } from '@/integrations/supabase/client';
import { createClientUuid } from '@/lib/clientIds';
import { localDb } from '@/lib/localDb';

export class SyncManager {
  private static isSyncing = false;

  static async initialize() {
    // Listen for network status changes
    Network.addListener('networkStatusChange', (status) => {
      console.log('Network status changed:', status.connected ? 'online' : 'offline');
      if (status.connected) {
        void this.syncPendingItems();
      }
    });

    // Check status on startup
    const status = await Network.getStatus();
    if (status.connected) {
      void this.syncPendingItems();
    }
  }

  static async syncPendingItems() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const pendingItems = await localDb.getPendingSyncItems();
      if (pendingItems.length === 0) {
        console.log('No pending items to sync.');
        return;
      }

      console.log(`Starting sync for ${pendingItems.length} items...`);

      for (const item of pendingItems) {
        const payload = JSON.parse(item.payload);
        const queryParams = item.query_params ? JSON.parse(item.query_params) : null;
        let success = false;

        try {
          if (item.operation === 'INSERT') {
            const { error } = await supabase.from(item.table_name).insert(payload);
            if (!error) success = true;
          } else if (item.operation === 'UPDATE') {
            const { error } = await supabase.from(item.table_name).update(payload).match(queryParams);
            if (!error) success = true;
          } else if (item.operation === 'DELETE') {
            const { error } = await supabase.from(item.table_name).delete().match(queryParams);
            if (!error) success = true;
          }

          if (success) {
            await localDb.markAsSynced(item.id);
          }
        } catch (err) {
          console.error(`Error syncing item ${item.id}:`, err);
          // If there's a permanent error (like a conflict), we might want to skip it or handle it specifically.
          // For now, we'll stop the sync loop to avoid further issues.
          break;
        }
      }
    } finally {
      this.isSyncing = false;
      console.log('Sync process finished.');
    }
  }

  /**
   * Wrapper for Supabase mutations that handles offline queueing.
   */
  static async performMutation(
    tableName: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any,
    queryParams?: any
  ): Promise<{ data: any; error: any }> {
    const status = await Network.getStatus();

    if (!status.connected) {
      console.log(`Offline: Queueing ${operation} on ${tableName}`);
      // Generate a temporary ID if it's an insert and doesn't have one
      if (operation === 'INSERT' && !payload.id) {
        payload.id = createClientUuid();
      }
      await localDb.addToSyncQueue(tableName, operation, payload, queryParams);
      return { data: payload, error: null }; // Return the payload as "data" so the UI can proceed
    }

    // Try to perform online
    try {
      let query = supabase.from(tableName);
      let res;

      if (operation === 'INSERT') {
        res = await query.insert(payload).select().single();
      } else if (operation === 'UPDATE') {
        res = await query.update(payload).match(queryParams).select().single();
      } else {
        res = await query.delete().match(queryParams).select().single();
      }

      if (res.error) {
        console.error(`Online mutation error: ${res.error.message}. Queueing as fallback.`);
        await localDb.addToSyncQueue(tableName, operation, payload, queryParams);
        return { data: payload, error: null };
      }
      return res;
    } catch (err) {
      console.error('Mutation failed. Queueing offline.', err);
      await localDb.addToSyncQueue(tableName, operation, payload, queryParams);
      return { data: payload, error: null };
    }
  }
}
