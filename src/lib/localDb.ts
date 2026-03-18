import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

class LocalDatabase {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private dbName: string = 'ideart_cloud_db';
  private isWeb = false;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async initialize() {
    this.isWeb = Capacitor.getPlatform() === 'web';

    if (this.isWeb) {
      // If running in a browser (Vite dev / PWA), we avoid the wasm/sqlite init errors by
      // using a lightweight localStorage-backed queue for offline sync.
      console.warn('Running in Web mode: using localStorage-based sync queue (no SQLite).');
      this.initWebStorage();
      return;
    }

    // Native (Android/iOS) path: use Capacitor SQLite
    try {
      const ret = await this.sqlite.checkConnectionsConsistency();
      const isConn = (await this.sqlite.isConnection(this.dbName, false)).result;

      if (ret.result && isConn) {
        this.db = await this.sqlite.retrieveConnection(this.dbName, false);
      } else {
        this.db = await this.sqlite.createConnection(this.dbName, false, 'no-encryption', 1, false);
      }

      await this.db.open();
      await this.createTables();
    } catch (err) {
      console.error('Error initializing SQLite:', err);
      // If initialization fails, propagate the error so callers don't attempt operations on a null DB.
      throw err;
    }
  }

  private initWebStorage() {
    try {
      if (!localStorage.getItem('localDb_sync_queue')) {
        localStorage.setItem('localDb_sync_queue', JSON.stringify([]));
      }
    } catch (err) {
      console.warn('Unable to access localStorage for offline queue:', err);
    }
  }

  private getWebQueueItems() {
    try {
      const raw = localStorage.getItem('localDb_sync_queue');
      return raw ? (JSON.parse(raw) as Array<any>) : [];
    } catch (err) {
      console.warn('Unable to read sync queue from localStorage:', err);
      return [];
    }
  }

  private setWebQueueItems(items: Array<any>) {
    try {
      localStorage.setItem('localDb_sync_queue', JSON.stringify(items));
    } catch (err) {
      console.warn('Unable to save sync queue to localStorage:', err);
    }
  }

  async query(statement: string, values: any[] = []) {
    if (this.isWeb) {
      // Minimal support for sync queue query.
      if (statement.includes('FROM sync_queue')) {
        const items = this.getWebQueueItems();
        const pending = items.filter((item) => item.synced === 0);
        pending.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return { values: pending };
      }

      throw new Error('Web mode only supports sync queue queries.');
    }

    if (!this.db) await this.initialize();
    return await this.db!.query(statement, values);
  }

  async run(statement: string, values: any[] = []) {
    if (this.isWeb) {
      throw new Error('Web mode does not support raw SQL execution.');
    }

    if (!this.db) await this.initialize();
    return await this.db!.run(statement, values);
  }

  async addToSyncQueue(tableName: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', payload: any, queryParams?: any) {
    if (this.isWeb) {
      const items = this.getWebQueueItems();
      const id = Date.now();
      items.push({
        id,
        table_name: tableName,
        operation,
        payload: JSON.stringify(payload),
        query_params: queryParams ? JSON.stringify(queryParams) : null,
        created_at: new Date().toISOString(),
        synced: 0,
      });
      this.setWebQueueItems(items);
      return;
    }

    const statement = `INSERT INTO sync_queue (table_name, operation, payload, query_params) VALUES (?, ?, ?, ?)`;
    await this.run(statement, [tableName, operation, JSON.stringify(payload), JSON.stringify(queryParams)]);
  }

  async getPendingSyncItems() {
    if (this.isWeb) {
      const items = this.getWebQueueItems();
      return items.filter((item) => item.synced === 0);
    }

    const res = await this.query('SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC');
    return res.values || [];
  }

  async markAsSynced(id: number) {
    if (this.isWeb) {
      const items = this.getWebQueueItems();
      const idx = items.findIndex((item) => item.id === id);
      if (idx !== -1) {
        items[idx].synced = 1;
        this.setWebQueueItems(items);
      }
      return;
    }

    await this.run('UPDATE sync_queue SET synced = 1 WHERE id = ?', [id]);
  }
}

export const localDb = new LocalDatabase();
