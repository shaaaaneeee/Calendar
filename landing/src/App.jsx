import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import LandingPage from './LandingPage';
import HowItWorksPage from './HowItWorksPage';
import PrivacyPage from './PrivacyPage';
import ConfirmedPage from './ConfirmedPage';

const pageVariants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
};

const pageTransition = { duration: 0.45, ease: [0.16, 1, 0.3, 1] };

function PageTransition({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      {children}
    </motion.div>
  );
}

// Anchors like "#how" only exist once the target route's content has mounted,
// so the scroll has to happen post-render rather than relying on the
// browser's own hash-on-load behavior (which SPA navigation never triggers).
function ScrollToHash() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  return null;
}

export default function App() {
  const location = useLocation();

  return (
    <MotionConfig reducedMotion="user">
      <ScrollToHash />
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
          <Route path="/how-it-works" element={<PageTransition><HowItWorksPage /></PageTransition>} />
          <Route path="/privacy.html" element={<PageTransition><PrivacyPage /></PageTransition>} />
          <Route path="/confirmed.html" element={<PageTransition><ConfirmedPage /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </MotionConfig>
  );
}
