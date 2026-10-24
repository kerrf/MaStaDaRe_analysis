import { useEffect, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import Tip, { useTip } from '../../features/guide/Tip';
import { trackEvent } from '../../lib/usage';

const COPIED_MS = 2600;
// A phone or tablet: its own share sheet (messenger, mail) rather than the clipboard
const touch = () => typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;

/**
 * "Teilen": the page's link – which holds the whole view, area, technology, period and every setting – to the
 * clipboard, on a phone to its share sheet. page: what is shared, for the usage counts. tipWhen: when the tip about it
 * may show (the person has changed the view: now the link is worth something).
 */
export default function ShareButton({ page, tipWhen = false }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const [tipOpen, closeTip] = useTip('teilen', tipWhen, 12000);
  useEffect(() => () => clearTimeout(timer.current), []);

  const share = async () => {
    const url = window.location.href;
    closeTip();
    if (touch()) {
      try {
        await navigator.share({ title: document.title, url });
        trackEvent('Teilen', { seite: page, weg: 'teilen' });
      } catch {
        // closed without sharing
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard (an old browser, an insecure page): the link to copy by hand
      window.prompt('Link zu dieser Ansicht:', url);
    }
    trackEvent('Teilen', { seite: page, weg: 'kopiert' });
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <span className="share">
      <button
        type="button"
        className={`btn btn--secondary btn--sm share__btn${copied ? ' is-done' : ''}`}
        onClick={share}
        data-tour="share"
        title="Link zu genau dieser Ansicht kopieren"
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Share2 size={14} aria-hidden="true" />}
        {copied ? 'Link kopiert' : 'Teilen'}
      </button>
      <span className="visually-hidden" role="status">
        {copied ? 'Link kopiert. Er enthält genau diese Ansicht.' : ''}
      </span>
      {tipOpen && (
        <Tip id="teilen" floating onClose={closeTip}>
          „Teilen“ kopiert den Link zu genau dieser Ansicht – mit Gebiet, Zeitraum und allen Einstellungen.
        </Tip>
      )}
    </span>
  );
}
