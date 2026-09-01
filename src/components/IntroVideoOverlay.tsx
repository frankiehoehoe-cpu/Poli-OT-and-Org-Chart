import { useCallback, useEffect, useRef, useState } from 'react';

type IntroVideoOverlayProps = {
  onComplete: () => void;
};

const FADE_DURATION_MS = 650;
const INTRO_SAFETY_TIMEOUT_MS = 12000;

export default function IntroVideoOverlay({ onComplete }: IntroVideoOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const completionStarted = useRef(false);
  const [isExiting, setIsExiting] = useState(false);

  const finish = useCallback(() => {
    if (completionStarted.current) return;
    completionStarted.current = true;

    videoRef.current?.pause();
    setIsExiting(true);
    window.setTimeout(onComplete, FADE_DURATION_MS);
  }, [onComplete]);

  useEffect(() => {
    const timeout = window.setTimeout(finish, INTRO_SAFETY_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [finish]);

  const startPlayback = () => {
    const playAttempt = videoRef.current?.play();
    playAttempt?.catch(finish);
  };

  return (
    <div
      className={`intro-overlay${isExiting ? ' is-exiting' : ''}`}
      role="dialog"
      aria-label="OT Pro introduction"
      aria-modal="true"
    >
      <video
        ref={videoRef}
        className="intro-video"
        autoPlay
        muted
        playsInline
        preload="auto"
        onCanPlay={startPlayback}
        onEnded={finish}
        onError={finish}
      >
        <source src="/videos/otpro-intro.webm" type="video/webm" />
        <source src="/videos/otpro-intro.mp4" type="video/mp4" />
      </video>

      <div className="intro-vignette" aria-hidden="true" />
      <div className="intro-brand" aria-hidden="true">
        <span>OT PRO</span>
        <small>OPERATIONS INTELLIGENCE</small>
      </div>
      <button className="intro-skip" type="button" onClick={finish}>
        SKIP INTRO
      </button>
    </div>
  );
}
