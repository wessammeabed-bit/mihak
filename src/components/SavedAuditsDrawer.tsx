import React, { useEffect, useState } from 'react';
import { X, Clock, Trash2, ExternalLink, FileText, Link2, Mic, Search, ShieldCheck } from 'lucide-react';
import { SavedAuditItem, getUserSavedAudits, deleteSavedAudit } from '../services/firebase';
import type { AuditRun } from '../types';

interface SavedAuditsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSelectAudit: (audit: AuditRun, metadata: any) => void;
}

export const SavedAuditsDrawer: React.FC<SavedAuditsDrawerProps> = ({
  isOpen,
  onClose,
  userId,
  onSelectAudit
}) => {
  const [audits, setAudits] = useState<SavedAuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      loadAudits();
    }
  }, [isOpen, userId]);

  const loadAudits = async () => {
    setLoading(true);
    try {
      const items = await getUserSavedAudits(userId);
      setAudits(items);
    } catch (err) {
      console.error('Failed to load audits:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('هل أنت متأكد من حذف نتيجة التدقيق هذه من سجلك؟')) return;

    setDeletingId(id);
    try {
      await deleteSavedAudit(id);
      setAudits((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete audit:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const getModalityIcon = (type: string) => {
    switch (type) {
      case 'url':
        return <Link2 className="w-4 h-4 text-emerald-400" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-rose-400" />;
      case 'search':
        return <Search className="w-4 h-4 text-sky-400" />;
      default:
        return <FileText className="w-4 h-4 text-[#D4A64A]" />;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-EG', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" dir="rtl">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#081024] border-l border-white/10 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#2EF2C2]" />
              <h2 className="text-lg font-bold text-white">سجل التدقيق المحفوظ</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="text-center py-12 text-sm text-slate-400">
                جاري تحميل السجل...
              </div>
            ) : audits.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <ShieldCheck className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-white">لا توجد عمليات تدقيق محفوظة</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-6">
                  عند إجراء تدقيق لأي نص أو رابط أو مقطع صوتي، يمكنك النقر على &quot;حفظ نتيجة التدقيق&quot; للرجوع إليها لاحقًا.
                </p>
              </div>
            ) : (
              audits.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectAudit(item.auditResult, item);
                    onClose();
                  }}
                  className="rounded-xl border border-white/10 bg-white/[0.025] hover:bg-white/[0.05] p-4 cursor-pointer transition space-y-2 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-white/5">
                        {getModalityIcon(item.inputType)}
                      </div>
                      <span className="text-xs text-slate-400">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDelete(item.id, e)}
                      disabled={deletingId === item.id}
                      className="p-1 text-slate-500 hover:text-rose-400 opacity-60 group-hover:opacity-100 transition"
                      title="حذف من السجل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-sm font-semibold text-white line-clamp-2 leading-6">
                    {item.title}
                  </p>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
                    <span>{item.claimCount} {item.claimCount === 1 ? 'ادعاء' : 'ادعاءات'}</span>
                    <span className="text-[#2EF2C2] text-[11px]">{item.statusSummary}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer note */}
          <div className="p-4 border-t border-white/10 text-center text-xs text-slate-500 leading-5">
            السجل خاص بحسابك ومحمي بقواعد الأمان، ولا يُعد مصدرًا لإثبات أي ادعاءات جديدة.
          </div>
        </div>
      </div>
    </div>
  );
};
