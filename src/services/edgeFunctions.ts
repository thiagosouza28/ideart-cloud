import { supabase } from '@/integrations/supabase/client';

/**
 * Invoke a Supabase Edge Function with automatic authentication and error handling.
 */
export async function invokeEdgeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
  options: { method?: string; path?: string } = {}
): Promise<T> {
  const method = (options.method?.toUpperCase() as any) || 'POST';
  const functionName = options.path
    ? `${name}${options.path.startsWith('/') ? options.path : `/${options.path}`}`
    : name;

  // 1. Get current session. Force a refresh if it's close to expiring if possible,
  // but for now just getting the freshest session from the client.
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Error getting session for Edge Function:', sessionError);
  }

  const headers: Record<string, string> = {};
  if (session?.access_token) {
    // Explicitly set authorization headers
    headers['Authorization'] = `Bearer ${session.access_token}`;
    headers['X-Supabase-Authorization'] = `Bearer ${session.access_token}`;
  }

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      method,
      body,
      headers,
    });

    if (error) {
      // Handle the case where error.status is a number or a string
      const status = typeof (error as any).status === 'number'
        ? (error as any).status
        : parseInt((error as any).status);

      console.error(`Edge Function ${functionName} failed with status ${status}:`, error);

      let message = error.message;

      if (status === 401) {
        message = 'Sessão inválida ou expirada. Por favor, saia e entre novamente.';
        // If it's a 401, the user might be stuck with a bad session
        // We could trigger a signOut or just alert them
      } else if (status === 403) {
        message = 'Você não tem permissão para realizar esta ação.';
      } else if (status === 404) {
        message = 'Função não encontrada ou caminho inválido.';
      }

      const wrapped = new Error(message) as Error & { status?: number; payload?: unknown };
      wrapped.status = status;
      wrapped.payload = (error as any).context; // Supabase errors might have context
      throw wrapped;
    }

    return data as T;
  } catch (err: any) {
    if (err.status) throw err;
    console.error(`Network error calling ${functionName}:`, err);
    throw new Error(err.message || 'Erro de conexão com o servidor.');
  }
}
