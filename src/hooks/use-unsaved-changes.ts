import { useCallback, useContext, useEffect } from 'react';
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom';

const DEFAULT_MESSAGE = 'Você tem alterações não salvas. Deseja sair mesmo assim?';

export const useUnsavedChanges = (isDirty: boolean, message: string = DEFAULT_MESSAGE) => {
  const { navigator } = useContext(NavigationContext);
  const blocker = useCallback(
    (tx: { retry: () => void }) => {
      const shouldLeave = window.confirm(message);
      if (shouldLeave) {
        tx.retry();
      }
    },
    [message],
  );

  useEffect(() => {
    if (!isDirty) return;
    if (!navigator || typeof (navigator as any).block !== 'function') return;

    const unblock = (navigator as any).block((tx: { retry: () => void }) => {
      const autoUnblockTx = {
        ...tx,
        retry: () => {
          unblock();
          tx.retry();
        },
      };
      blocker(autoUnblockTx);
    });

    return unblock;
  }, [blocker, isDirty, navigator]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, message]);
};
