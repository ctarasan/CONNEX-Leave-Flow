
import React from 'react';
import { Notification } from '../types';
import { markNotifAsRead } from '../store';
import { formatDisplayDateTime } from '../utils';
import { useAsyncAction } from '../hooks/useAsyncAction';

interface NotificationCenterProps {
  notifications: Notification[];
  userId: string;
  onUpdate: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, userId, onUpdate }) => {
  const { runAction, isActionBusy } = useAsyncAction();
  const handleRead = (id: string) => {
    runAction(`read-notif-${id}`, async () => {
      await Promise.resolve(markNotifAsRead(id, userId));
      onUpdate();
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-h-[500px] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">การแจ้งเตือน</h2>
        <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
          {notifications.filter(n => !n.isRead).length} ใหม่
        </span>
      </div>
      
      {notifications.length === 0 ? (
        <p className="text-gray-500 text-center py-8">ไม่มีการแจ้งเตือน</p>
      ) : (
        <div className="space-y-3">
          {notifications.map(notif => (
            <div 
              key={notif.id} 
              role="button"
              tabIndex={0}
              aria-busy={isActionBusy(`read-notif-${notif.id}`)}
              className={`p-3 rounded-lg border transition-all ${notif.isRead ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-blue-50 border-blue-100 shadow-sm'} ${isActionBusy(`read-notif-${notif.id}`) ? 'pointer-events-none opacity-60' : ''}`}
              onClick={() => handleRead(notif.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRead(notif.id);
                }
              }}
            >
              <div className="flex justify-between">
                <h4 className="font-semibold text-sm text-gray-900">{notif.title}</h4>
                <span className="text-[10px] text-gray-400">{formatDisplayDateTime(notif.createdAt)}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{notif.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
