import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import Icon from './Icon.jsx';

export default function Modal({ title, eyebrow, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const prior = document.activeElement;
    const dialog = ref.current;
    const focusable = () => [...dialog.querySelectorAll('button, input, select, a[href], [tabindex="0"]')];
    focusable()[0]?.focus();
    function key(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const all = focusable(), first = all[0], last = all.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    dialog.addEventListener('keydown', key);
    return () => { dialog.removeEventListener('keydown', key); prior?.focus(); };
  }, [onClose]);
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <motion.section ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`modal ${wide ? 'modal-wide' : ''}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="modal-heading"><div><span className="eyebrow">{eyebrow}</span><h2 id="dialog-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div>
      {children}
    </motion.section>
  </motion.div>;
}
