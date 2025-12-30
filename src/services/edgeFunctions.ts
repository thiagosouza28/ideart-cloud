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

  // 1. Prepare headers. We don't need to manually pass Authorization or X-Supabase-Authorization
  // if we are logged in, as supabase.functions.invoke handles it. 
  // However, we can add X-Supabase-Authorization just in case.
  const { data: { session } } = await supabase.auth.getSession();
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

      const status = (error as any).status;
      let message = error.message;

      // Many times the error message is just status code, try to get more info
      if (status === 401) {
        message = 'Sessão inválida ou expirada. Tente fazer login novamente.';
      } else if (status === 403) {
        message = 'Você não tem permissão para realizar esta ação.';
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
