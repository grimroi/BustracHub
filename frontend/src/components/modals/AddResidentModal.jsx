import { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ResidentForm from '../../components/Resident/ResidentForm';
import './AddResidentModal.css';

export default function AddResidentModal({
  isOpen,
  onClose,
  residentForm,
  setResidentForm,
  editingResidentId,
  photoPreviewUrl,
  setPhotoPreviewUrl,
  handlePhotoChange,
  handleRemovePhoto,
  updateResidentField,
  submitAddResident,
  nav,
  setEditingResidentId,
  EMPTY_RESIDENT,
  households = [],
  householdAssignmentMode = 'existing',
  setHouseholdAssignmentMode,
  householdForm,
  setHouseholdForm,
  canCreateHousehold = false,
}) {
  const modalRef = useRef(null);
  const firstInputRef = useRef(null);
  const previouslyFocused = useRef(null);
  const [isSaving, setIsSaving] = useState(false);

  // Lock body scroll and focus management
  useEffect(() => {
    if (isOpen) {
      previouslyFocused.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      // Focus first input after render
      const timer = setTimeout(() => {
        if (firstInputRef.current) firstInputRef.current.focus();
      }, 0);
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
        if (previouslyFocused.current?.focus) {
          previouslyFocused.current.focus();
        }
      };
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Ctrl+S / Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Trigger form submit via ref or dispatch
        const submitBtn = modalRef.current?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle form submit - extracted from JSX for performance
  const handleFormSubmit = useCallback(async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const success = await submitAddResident(e);
      if (success) onClose();
    } finally {
      setIsSaving(false);
    }
  }, [submitAddResident, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="add-resident-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="add-resident-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-resident-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <header className="add-resident-modal__header">
          <div>
            <h2 id="add-resident-title" className="add-resident-modal__title">
              {editingResidentId ? 'Edit Resident' : 'New Resident Information'}
            </h2>
            <p className="add-resident-modal__subtitle">
              {editingResidentId
                ? 'Update the resident information below.'
                : 'Fill out the required fields to register a new resident.'}
            </p>
          </div>
          <button
            type="button"
            className="add-resident-modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="add-resident-modal__body">
          <ResidentForm
            residentForm={residentForm}
            setResidentForm={setResidentForm}
            editingResidentId={editingResidentId}
            photoPreviewUrl={photoPreviewUrl}
            setPhotoPreviewUrl={setPhotoPreviewUrl}
            handlePhotoChange={handlePhotoChange}
            handleRemovePhoto={handleRemovePhoto}
            updateResidentField={updateResidentField}
            submitAddResident={handleFormSubmit}
            nav={nav}
            setEditingResidentId={setEditingResidentId}
            EMPTY_RESIDENT={EMPTY_RESIDENT}
            onCancel={onClose}
            households={households}
            householdAssignmentMode={householdAssignmentMode}
            setHouseholdAssignmentMode={setHouseholdAssignmentMode}
            householdForm={householdForm}
            setHouseholdForm={setHouseholdForm}
            canCreateHousehold={canCreateHousehold}
            isSaving={isSaving}
            ref={firstInputRef}
          />
        </div>

        {/* Sticky Footer */}
        <footer className="add-resident-modal__footer">
          <span className="add-resident-modal__hint">
            ESC to close • Ctrl+S to save
          </span>
          <div className="add-resident-modal__actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-resident-form"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : editingResidentId ? 'Save Changes' : 'Save Resident'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}