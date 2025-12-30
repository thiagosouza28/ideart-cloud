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

  // 1. Ensure we have a session.
  const { data: { session } } = await supabase.auth.getSession();

  // 2. Prepare headers. We add X-Supabase-Authorization explicitly.
  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers['X-Supabase-Authorization'] = `Bearer ${session.access_token}`;
  }

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      method,
      body,
      headers,
    });

    if (error) {
      console.error(`Edge Function ${functionName} error:`, error);

      let message = error.message;
      const status = (error as any).status;

      if (status === 401 || status === 403) {
        message = 'Sessão inválida ou sem permissão. Tente fazer login novamente.';
      }

      const wrapped = new Error(message) as Error & { status?: number };
      wrapped.status = status;
      throw wrapped;
    }

    return data as T;
  } catch (err: any) {
    if (err.status) throw err;
    console.error(`Network error calling ${functionName}:`, err);
    throw new Error(err.message || 'Erro de conexão com o servidor.');
  }
}
