import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import IntroVideoOverlay from './components/IntroVideoOverlay';

const INTRO_SESSION_KEY = 'otpro_intro_seen_v2';

function shouldPlayIntro() {
  if (typeof window === 'undefined') return false;

  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) !== 'true';
  } catch {
    return true;
  }
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const [showIntro, setShowIntro] = useState(shouldPlayIntro);

  const completeIntro = () => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, 'true');
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
    setShowIntro(false);
  };

  return (
    <main className="welcome-page">
      {showIntro ? <IntroVideoOverlay onComplete={completeIntro} /> : (
        <motion.section
          initial={{ opacity: 0, y: 24, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="welcome-hero"
          aria-labelledby="welcome-title"
        >
          <div className="welcome-eyebrow">
            <span className="welcome-status-dot" aria-hidden="true" />
            BY FH VER 1.1.14 PRO
          </div>

          <h1 id="welcome-title" className="welcome-title">OT PRO</h1>
          <p className="welcome-subtitle">OVERTIME TRACKER &amp; ORG CHART</p>
          <div className="welcome-divider" aria-hidden="true" />
          <p className="welcome-description">
            Plan overtime, review team rosters, and access the public overview.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="welcome-action"
          >
            <button className="welcome-start" onClick={() => navigate('/overview')}>
              <span>START</span>
              <ArrowRight aria-hidden="true" />
            </button>
            <p>CLICK TO ENTER PUBLIC OVERVIEW</p>
          </motion.div>
        </motion.section>
      )}

      <div className="welcome-grid" aria-hidden="true" />
      <div className="welcome-glow welcome-glow-left" aria-hidden="true" />
      <div className="welcome-glow welcome-glow-right" aria-hidden="true" />
    </main>
  );
}
