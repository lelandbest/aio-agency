import React from 'react';
import { 
  AbsoluteFill, 
  Audio, 
  interpolate, 
  spring, 
  useCurrentFrame, 
  useVideoConfig 
} from 'remotion';

export const AudiogramComposition: React.FC<{
  title?: string;
  subtitle?: string;
  themeVariant?: 'dark' | 'glass' | 'industrial';
  logoUrl?: string;
  audioUrl?: string;
  watermarkText?: string;
  transcriptLines?: { text: string; start: number; end: number }[];
  images?: string[];
  videoClips?: string[];
}> = ({ 
  title = "AUDIO STORY", 
  subtitle = "AUDIOGRAM RENDER", 
  themeVariant = 'dark',
  logoUrl,
  audioUrl,
  watermarkText = "AIO NARRATIVE",
  transcriptLines = [] 
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Entrance animations
  const entrance = spring({
    frame,
    fps,
    config: { damping: 12 },
    durationInFrames: 30
  });

  const titleScale = interpolate(entrance, [0, 1], [0.8, 1]);
  const contentOpacity = interpolate(frame, [0, 20], [0, 1]);

  // Waveform visualization (Simulated/Animated)
  const bars = 40;
  const barData = Array.from({ length: bars }).map((_, i) => {
    const freq = 0.5 + (i / bars);
    const amp = Math.sin(frame * 0.2 * freq) * 40 + 60; // Base animation
    return amp;
  });

  return (
    <AbsoluteFill style={{ 
      backgroundColor: '#0a0a0a', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Dynamic Background */}
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, #111 0%, #000 100%)',
      }} />
      
      {/* Decorative Glow */}
      <div style={{
        position: 'absolute',
        width: '120%',
        height: '40%',
        top: '30%',
        left: '-10%',
        background: 'radial-gradient(ellipse at center, rgba(0, 200, 255, 0.15) 0%, transparent 70%)',
        filter: 'blur(100px)',
        transform: `scale(${1 + Math.sin(frame / 45) * 0.05})`
      }} />

      {/* Grid Overlay */}
      <AbsoluteFill style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
        opacity: 0.5
      }} />

      {/* Branded Header Area */}
      {logoUrl && (
        <div style={{
          position: 'absolute',
          top: 100,
          left: 100,
          opacity: contentOpacity
        }}>
          <img src={logoUrl} alt="Logo" style={{ height: 80, filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))' }} />
        </div>
      )}

      {/* Main Narrative Area */}
      <div style={{
        position: 'absolute',
        top: 300,
        left: 0,
        right: 0,
        padding: '0 100px',
        opacity: contentOpacity,
        transform: `scale(${titleScale})`
      }}>
        <h1 style={{
          color: '#ffffff',
          fontSize: 80,
          fontWeight: 800,
          lineHeight: 1.1,
          margin: '0 0 24px 0',
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
        }}>
          {title}
        </h1>
        <p style={{
          color: '#00c8ff',
          fontSize: 32,
          fontWeight: 600,
          margin: 0,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          opacity: 0.8
        }}>
          {subtitle}
        </p>
      </div>

      {/* Animated Waveform Element */}
      <div style={{ 
        position: 'absolute', 
        top: '55%', 
        left: 0, 
        right: 0, 
        height: 150, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: 8,
        opacity: contentOpacity
      }}>
        {barData.map((height, i) => (
          <div key={i} style={{
            width: 10,
            height: height * 1.5,
            backgroundColor: '#00c8ff',
            borderRadius: 5,
            opacity: 0.3 + (i / bars) * 0.7,
            boxShadow: '0 0 15px rgba(0,200,255,0.2)'
          }} />
        ))}
      </div>

      {/* Heavy Caption Area (Lower Third) */}
      <div style={{
        position: 'absolute',
        bottom: 250,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 80px',
        zIndex: 10
      }}>
        {transcriptLines.length > 0 ? (
           transcriptLines
           .filter(line => frame >= line.start && frame <= line.end)
           .map((line, idx) => (
             <div key={idx} style={{
               backgroundColor: '#ffffff',
               color: '#000000',
               padding: '20px 40px',
               borderRadius: 4,
               fontSize: 48,
               fontWeight: 900,
               textAlign: 'center',
               maxWidth: '100%',
               boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
               textTransform: 'uppercase',
             }}>
               {line.text}
             </div>
           ))
        ) : (
          <div style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '10px 20px',
            borderRadius: 4
          }}>
             {audioUrl ? 'LISTENING TO SOURCE AUDIO...' : 'AWAITING NARRATIVE INPUT...'}
          </div>
        )}
      </div>

      {/* Watermark/Social Area (Bottom Corner) */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        right: 80,
        color: '#ffffff',
        opacity: 0.4,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: '0.2em',
        textTransform: 'uppercase'
      }}>
        {watermarkText}
      </div>

      <div style={{
        position: 'absolute',
        bottom: 80,
        left: 80,
        height: 2,
        width: 150,
        backgroundColor: '#00c8ff',
        opacity: 0.3
      }} />

      {/* Audio Layer */}
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
