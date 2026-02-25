import React, { createContext, useContext, useState, useCallback } from 'react';

const ALERT_TITLE = 'Leave Flow Pro says';

interface ConfirmState {
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface AlertContextValue {
  showAlert: (message: string) => void;
  showConfirm: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    return {
      showAlert: (msg: string) => window.alert(msg),
      showConfirm: (msg: string, onConfirm: () => void) => { if (window.confirm(msg)) onConfirm(); },
    };
  }
  return ctx;
}

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const showAlert = useCallback((msg: string) => {
    setMessage(msg);
  }, []);

  const showConfirm = useCallback((msg: string, onConfirm: () => void, onCancel?: () => void) => {
    setConfirmState({ message: msg, onConfirm, onCancel });
  }, []);

  const closeAlert = useCallback(() => setMessage(null), []);

  const closeConfirm = useCallback(() => setConfirmState(null), []);

  const handleConfirm = useCallback(() => {
    confirmState?.onConfirm();
    setConfirmState(null);
  }, [confirmState]);

  const handleCancelConfirm = useCallback(() => {
    confirmState?.onCancel?.();
    setConfirmState(null);
  }, [confirmState]);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {message != null && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-labelledby="alert-title" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-100">
            <p id="alert-title" className="text-sm font-black text-gray-900 mb-2">{ALERT_TITLE}</p>
            <p className="text-sm text-gray-700 mb-6 whitespace-pre-wrap">{message}</p>
            <button
              type="button"
              onClick={closeAlert}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {confirmState != null && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-labelledby="confirm-title" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-100">
            <p id="confirm-title" className="text-sm font-black text-gray-900 mb-2">{ALERT_TITLE}</p>
            <p className="text-sm text-gray-700 mb-6 whitespace-pre-wrap">{confirmState.message}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancelConfirm}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
};
