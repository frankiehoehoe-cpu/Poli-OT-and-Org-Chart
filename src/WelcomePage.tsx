import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';

export default function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative w-full max-w-2xl aspect-square flex flex-col items-center justify-center text-center"
      >
        {/* Placeholder for the image provided by user */}
        <div className="relative group cursor-pointer" onClick={() => navigate('/overview')}>
          <img 
            src="/welcome-hero.png" 
            alt="OT Pro Welcome" 
            className="w-full h-auto rounded-[60px] shadow-2xl transition-all duration-500 group-hover:scale-[1.02]"
            onError={(e) => {
              // Fallback if image doesn't exist yet
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as any).parentElement.innerHTML = `
                <div class="w-64 h-64 md:w-96 md:h-96 rounded-[60px] bg-indigo-600 flex flex-col items-center justify-center text-white p-10 shadow-2xl relative">
                  <div class="animate-pulse absolute inset-0 bg-white/10 rounded-[60px]"></div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-6"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <h1 class="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-2">OT PRO</h1>
                  <p class="text-indigo-200 font-bold uppercase tracking-widest text-xs">Overtime Tracker</p>
                  <p class="text-indigo-300 font-black uppercase tracking-[0.3em] text-[8px] mt-2">By FH Ver 1.1.14 PRO</p>
                  <div class="mt-8 text-[10px] text-indigo-400 font-medium">Please upload welcome-hero.png to /public folder</div>
                </div>
              `;
            }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-12 w-full max-w-xs"
        >
          <button 
            onClick={() => navigate('/overview')}
            className="group relative w-full py-6 bg-vibrant text-white font-black text-2xl uppercase tracking-[0.2em] rounded-[30px] shadow-[0_20px_50px_-12px_rgba(79,70,229,0.5)] hover:bg-white hover:text-vibrant transition-all duration-300 active:scale-95 flex items-center justify-center gap-4 overflow-hidden"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <span>START</span>
            <Play className="w-8 h-8 fill-current" />
          </button>
          
          <p className="mt-6 text-slate-500 font-bold uppercase tracking-widest text-[10px] animate-pulse">
            Click to enter Public Overview
          </p>
        </motion.div>
      </motion.div>

      {/* Decorative stars */}
      <div className="absolute top-10 left-10 w-2 h-2 bg-white rounded-full opacity-20 animate-ping"></div>
      <div className="absolute bottom-20 right-20 w-3 h-3 bg-white rounded-full opacity-10 animate-pulse"></div>
      <div className="absolute top-1/4 right-1/4 w-1 h-1 bg-amber-400 rounded-full opacity-30"></div>
    </div>
  );
}
