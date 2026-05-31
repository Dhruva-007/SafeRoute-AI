import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Plus,
  Star,
  Trash2,
  Edit2,
  Phone,
  X,
  Save,
  Loader2,
  AlertCircle,
  UserPlus,
} from 'lucide-react';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
import { dialNumber } from '../../utils/sosTrigger';

const RELATION_OPTIONS = [
  { id: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
  { id: 'friend', label: 'Friend', emoji: '🤝' },
  { id: 'medical', label: 'Doctor', emoji: '⚕️' },
  { id: 'other', label: 'Other', emoji: '📞' },
];

function FamilyContactsManager() {
  const {
    contacts,
    loading,
    error,
    isFull,
    count,
    remaining,
    addContact,
    updateContact,
    removeContact,
    setPrimary,
    clearError,
  } = useEmergencyContacts();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('add');
  const [editorTarget, setEditorTarget] = useState(null);

  const openAdd = () => {
    if (isFull) return;
    setEditorMode('add');
    setEditorTarget(null);
    setEditorOpen(true);
  };

  const openEdit = (contact) => {
    setEditorMode('edit');
    setEditorTarget(contact);
    setEditorOpen(true);
  };

  const handleSave = async (data) => {
    if (editorMode === 'edit' && editorTarget) {
      await updateContact(editorTarget.id, data);
    } else {
      await addContact(data);
    }
  };

  const handleDelete = async (contact) => {
    if (!window.confirm(`Remove "${contact.name}" from emergency contacts?`)) return;
    try {
      await removeContact(contact.id);
    } catch (e) {
      // error surfaced via hook
    }
  };

  const handleSetPrimary = async (contact) => {
    if (contact.is_primary) return;
    try {
      await setPrimary(contact.id);
    } catch (e) {
      // error surfaced via hook
    }
  };

  return (
    <div className="glass-card shadow-soft border border-[#DDD3C5] p-6">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
            <Users className="w-4 h-4 text-accent-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Family & Friends
            </h3>
            <p className="text-xs text-text-muted">
              {count} of 5 contacts saved
            </p>
          </div>
        </div>

        <button
          onClick={openAdd}
          disabled={isFull}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-accent-primary/10 text-accent-primary border border-accent-primary/25 hover:bg-accent-primary/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          title={isFull ? 'Maximum 5 contacts' : 'Add contact'}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/25 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger flex-1">{error}</p>
            <button
              onClick={clearError}
              className="text-danger/60 hover:text-danger text-sm leading-none"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {loading && contacts.length === 0 && (
        <div className="text-center py-8">
          <Loader2 className="w-5 h-5 text-text-muted animate-spin mx-auto" />
        </div>
      )}

      {/* Empty state */}
      {!loading && contacts.length === 0 && (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-2xl bg-bg-elevated border border-[#DDD3C5] flex items-center justify-center mx-auto mb-3">
            <UserPlus className="w-6 h-6 text-text-muted" />
          </div>
          <p className="text-sm font-semibold text-text-primary mb-1">
            No emergency contacts yet
          </p>
          <p className="text-xs text-text-muted mb-4">
            Add family or friends to notify in case of emergency.
          </p>
          <button onClick={openAdd} className="btn-primary text-sm inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add first contact
          </button>
        </div>
      )}

      {/* List */}
      {contacts.length > 0 && (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const rel = RELATION_OPTIONS.find((r) => r.id === contact.relation) || RELATION_OPTIONS[0];
            return (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="group flex items-center gap-3 p-3 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] hover:border-accent-primary/30 transition-colors"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-base shrink-0">
                  {rel.emoji}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {contact.name}
                    </p>
                    {contact.is_primary && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-soft text-warning border border-warning/25">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted truncate">
                    {rel.label} · {contact.phone}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => dialNumber(contact.phone)}
                    className="p-1.5 rounded-lg hover:bg-success-soft text-text-muted hover:text-success transition-colors"
                    title="Call"
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                  {!contact.is_primary && (
                    <button
                      onClick={() => handleSetPrimary(contact)}
                      className="p-1.5 rounded-lg hover:bg-warning-soft text-text-muted hover:text-warning transition-colors"
                      title="Set as primary"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(contact)}
                    className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(contact)}
                    className="p-1.5 rounded-lg hover:bg-danger-soft text-text-muted hover:text-danger transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      <ContactEditor
        open={editorOpen}
        mode={editorMode}
        initialValue={editorTarget}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}

/* ============================================================ */
/* Inline editor modal                                          */
/* ============================================================ */

function ContactEditor({ open, mode, initialValue, onClose, onSave }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    relation: 'family',
    is_primary: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    if (open) {
      setForm({
        name: initialValue?.name || '',
        phone: initialValue?.phone || '',
        relation: initialValue?.relation || 'family',
        is_primary: initialValue?.is_primary || false,
      });
      setError(null);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: form.name.trim(),
        phone: form.phone.trim(),
        relation: form.relation,
        is_primary: form.is_primary,
      });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="glass-card shadow-medium border border-[#DDD3C5] p-6 w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-text-primary">
              {mode === 'edit' ? 'Edit Contact' : 'Add Contact'}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-bg-elevated transition-colors"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/25 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Mom"
                className="w-full px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Phone Number *
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="e.g., 9876543210 or +91 98765 43210"
                className="w-full px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10"
              />
              <p className="text-xs text-text-muted mt-1.5">
                10 digits or include +country code.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-2">
                Relation
              </label>
              <div className="grid grid-cols-4 gap-2">
                {RELATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, relation: opt.id }))}
                    className={`p-2.5 rounded-xl text-xs font-semibold transition-all border ${
                      form.relation === opt.id
                        ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40'
                        : 'bg-white/85 text-text-secondary border-[#DDD3C5] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    <div className="text-base mb-0.5">{opt.emoji}</div>
                    <div>{opt.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] cursor-pointer hover:border-accent-primary/30 transition-colors">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) =>
                  setForm((p) => ({ ...p, is_primary: e.target.checked }))
                }
                className="w-4 h-4 accent-accent-primary"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-text-primary">
                  Set as primary contact
                </p>
                <p className="text-xs text-text-muted">
                  Primary contact appears first and is highlighted.
                </p>
              </div>
              <Star
                className={`w-4 h-4 ${
                  form.is_primary ? 'text-warning fill-warning' : 'text-text-muted'
                }`}
              />
            </label>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={saving}
              className="btn-secondary flex-1 !py-2.5 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !form.name.trim() || !form.phone.trim()}
              className="btn-primary flex-1 flex items-center justify-center gap-2 !py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {mode === 'edit' ? 'Save' : 'Add'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default FamilyContactsManager;