import { useEffect, type ReactNode } from 'react';

interface Props {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({ label, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button className="icon-button sheet-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
