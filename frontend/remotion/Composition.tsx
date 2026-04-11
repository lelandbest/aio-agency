import React from 'react';
import { 
  AbsoluteFill, 
  Audio, 
  interpolate, 
  spring, 
  useCurrentFrame, 
  useVideoConfig 
} from 'remotion';

export const VideoComposition: React.FC<{
  title?: string;
  subtitle?: string;
  themeVariant?: 'dark' | 'glass' | 'industrial';
  logoUrl?: string;
  audioUrl?: string;
  watermarkText?: string;
  transcript?: string;
  transcriptLines?: { text: string; start: number; end: number }[];
  images?: string[];
  videoClips?: string[];
}> = ({ 
  title = "AIO OPERATIONS", 
  subtitle = "THIN-AIR RENDER ACTIVE", 
  themeVariant = 'dark',
  logoUrl,
  audioUrl,
  watermarkText = "AIO CORE",
  transcript,
  transcriptLines = [] 
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Entrance animations
  const entrance = spring({
    frame,
    fps,
    config: { damping: 12 }
  });

  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const slideUp = interpolate(frame, [0, 40], [100, 0], {
    extrapolateRight: 'clamp',
  });

  // Animated background logic
  const bgScale = interpolate(frame, [0, 300], [1, 1.2]);
  const bgRotation = interpolate(frame, [0, 300], [0, 10]);

  return (
    <AbsoluteFill style={{ 
      backgroundColor: '#050505', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Animated Background Layers */}
      <AbsoluteFill style={{
        background: `radial-gradient(circle at 50% 50%, #1e1e2e 0%, #050505 100%)`,
        transform: `scale(${bgScale}) rotate(${bgRotation}deg)`,
        opacity: 0.6
      }} />
      
      <AbsoluteFill style={{
        background: 'linear-gradient(45deg, rgba(0,255,127,0.05) 0%, transparent 40%, rgba(0,200,255,0.05) 100%)',
        opacity: Math.sin(frame / 60) * 0.2 + 0.8
      }} />

      {/* Grid Pattern Overlay */}
      <AbsoluteFill style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: 0.3
      }} />

      {/* Logo Area (Top) */}
      {logoUrl && (
        <div style={{
          position: 'absolute',
          top: 80,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: entrance
        }}>
          <img src={logoUrl} alt="Logo" style={{ height: 120, objectFit: 'contain' }} />
        </div>
      )}

      {/* Main Content Area (Center) */}
      <div style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 80px',
        opacity: opacity,
        transform: `translateY(${slideUp}px)`
      }}>
        <h1 style={{
          color: '#00ff7f',
          fontSize: 90,
          fontWeight: 900,
          textAlign: 'center',
          margin: '0 0 20px 0',
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          textShadow: '0 0 40px rgba(0,255,127,0.3)'
        }}>
          {title}
        </h1>
        <div style={{
          height: 4,
          width: 120,
          backgroundColor: '#00ff7f',
          marginBottom: 40,
          borderRadius: 2
        }} />
        <p style={{
          color: '#ffffff',
          fontSize: 40,
          fontWeight: 500,
          textAlign: 'center',
          opacity: 0.7,
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.2em'
        }}>
          {subtitle}
        </p>
      </div>

      {/* Watermark (Top Corner) */}
      <div style={{
        position: 'absolute',
        top: 60,
        right: 60,
        color: 'white',
        opacity: 0.2,
        fontSize: 24,
        fontWeight: 900,
        letterSpacing: '0.4em'
      }}>
        {watermarkText}
      </div>

      {/* Transcript Area (Lower Third) */}
      {(transcriptLines.length > 0 || transcript) && (
        <div style={{
          position: 'absolute',
          bottom: 200,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 100px'
        }}>
          {transcriptLines.length > 0 ? (
            transcriptLines
              .filter(line => frame >= line.start && frame <= line.end)
              .map((line, idx) => (
                <div key={idx} style={{
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  color: 'white',
                  padding: '12px 24px',
                  borderRadius: 12,
                  fontSize: 32,
                  textAlign: 'center',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  {line.text}
                </div>
              ))
          ) : transcript ? (
            <div style={{
              backgroundColor: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: 12,
              fontSize: 32,
              textAlign: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.1)',
              opacity: opacity
            }}>
              {transcript}
            </div>
          ) : null}
        </div>
      )}

      {/* Technical Footer */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity: 0.3
      }}>
        <div style={{
            fontSize: 18,
            color: 'white',
            fontWeight: 700,
            letterSpacing: '0.5em',
            textTransform: 'uppercase',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            paddingTop: 10
        }}>
            Render Chain Verified // Nexus 2026
        </div>
      </div>

      {/* Audio Layer */}
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
