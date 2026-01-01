import { supabase } from '@/integrations/supabase/client';

/**
 * Invoke a Supabase Edge Function with automatic authentication and error handling.
 * Uses the Supabase client which automatically handles authentication headers.
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

  // Verify session exists before making the call
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Error getting session for Edge Function:', sessionError);
    throw new Error('Erro ao obter sessão. Por favor, faça login novamente.');
  }

  if (!session?.access_token) {
    throw new Error('Sessão não encontrada. Por favor, faça login novamente.');
  }

  try {
    const authHeader = `Bearer ${session.access_token}`;
    const { data, error } = await supabase.functions.invoke(functionName, {
      method,
      body: body || undefined,
      headers: {
        Authorization: authHeader,
        'x-supabase-authorization': authHeader,
      },
    });

    if (error) {
      console.error(`Edge Function ${functionName} failed:`, error);
      
      // Extract status code from error
      let status = 500;
      if (typeof (error as any).status === 'number') {
        status = (error as any).status;
      } else if (typeof (error as any).status === 'string') {
        const parsed = parseInt((error as any).status);
        if (!isNaN(parsed)) status = parsed;
      }

      // Extract error message
      let message = error.message || 'Erro desconhecido';
      
      // Try to get error from context
      if ((error as any).context) {
        try {
          const context = typeof (error as any).context === 'string' 
            ? JSON.parse((error as any).context) 
            : (error as any).context;
          if (context?.error) message = context.error;
        } catch {
          // Context is not JSON, ignore
        }
      }

      // Provide user-friendly messages
      if (status === 401) {
        message = message.includes('sessão') || message.includes('session') 
          ? message 
          : 'Sessão inválida ou expirada. Por favor, saia e entre novamente.';
      } else if (status === 403) {
        message = message.includes('permissão') || message.includes('permission')
          ? message
          : 'Você não tem permissão para realizar esta ação.';
      } else if (status === 404) {
        message = 'Função não encontrada ou caminho inválido.';
      } else if (status === 500) {
        // Keep the original message for 500 errors as they might have useful details
      }

      const wrapped = new Error(message) as Error & { status?: number; payload?: unknown };
      wrapped.status = status;
      wrapped.payload = (error as any).context;
      throw wrapped;
    }

    return data as T;
  } catch (err: any) {
    // If error already has status, re-throw it
    if (err.status) throw err;
    
    console.error(`Network error calling ${functionName}:`, err);
    throw new Error(err.message || 'Erro de conexão com o servidor.');
  }
}
