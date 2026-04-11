import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type TranscriptLine = {
  text: string;
  start: number;
  end: number;
};

export const BLTVLandscapeComposition: React.FC<{
  title?: string;
  subtitle?: string;
  themeVariant?: 'dark' | 'glass' | 'industrial';
  logoUrl?: string;
  audioUrl?: string;
  watermarkText?: string;
  transcript?: string;
  transcriptLines?: TranscriptLine[];
  images?: string[];
  videoClips?: string[];
}> = ({
  title = 'BEST AI TV',
  subtitle = 'PRODUCTION SYSTEM',
  themeVariant = 'industrial',
  logoUrl,
  audioUrl,
  watermarkText = 'BLTV',
  transcript = '',
  transcriptLines = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const reveal = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.9 },
  });

  const headerY = interpolate(reveal, [0, 1], [-60, 0]);
  const contentX = interpolate(reveal, [0, 1], [-80, 0]);
  const transcriptX = interpolate(reveal, [0, 1], [80, 0]);
  const glowShift = interpolate(frame, [0, durationInFrames], [0, 160]);
  const accentPulse = 0.6 + (Math.sin(frame / 20) + 1) * 0.12;
  const progressWidth = interpolate(frame, [0, durationInFrames], [0, width * 0.72], {
    extrapolateRight: 'clamp',
  });

  const liveTranscriptLine = transcriptLines.find((line) => frame >= line.start && frame <= line.end);
  const transcriptPreview = liveTranscriptLine?.text || transcript || 'Broadcast-ready export path active. Source script and voice lane attached.';

  const theme = themeVariant === 'glass'
    ? {
        background: '#070B14',
        panel: 'rgba(15, 23, 42, 0.68)',
        panelBorder: 'rgba(96, 165, 250, 0.24)',
        accent: '#38BDF8',
        accentSoft: 'rgba(56, 189, 248, 0.18)',
        secondary: '#E2E8F0',
      }
    : themeVariant === 'dark'
      ? {
          background: '#050816',
          panel: 'rgba(15, 23, 42, 0.88)',
          panelBorder: 'rgba(148, 163, 184, 0.22)',
          accent: '#22C55E',
          accentSoft: 'rgba(34, 197, 94, 0.16)',
          secondary: '#CBD5E1',
        }
      : {
          background: '#06070B',
          panel: 'rgba(10, 14, 24, 0.92)',
          panelBorder: 'rgba(251, 191, 36, 0.22)',
          accent: '#F97316',
          accentSoft: 'rgba(249, 115, 22, 0.18)',
          secondary: '#E5E7EB',
        };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.background,
        fontFamily: '"Arial Black", "Helvetica Neue", sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${18 + (glowShift / 20)}% 18%, ${theme.accentSoft} 0%, transparent 34%), radial-gradient(circle at 82% 78%, rgba(59,130,246,0.18) 0%, transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 42%, rgba(255,255,255,0.05) 100%)`,
        }}
      />

      <AbsoluteFill
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          opacity: 0.3,
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 28,
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: 28,
          boxShadow: '0 20px 80px rgba(0,0,0,0.45)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 54,
          left: 74,
          right: 74,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transform: `translateY(${headerY}px)`,
          opacity: interpolate(reveal, [0, 1], [0, 1]),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="BLTV"
              style={{
                height: 54,
                objectFit: 'contain',
                filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.35))',
              }}
            />
          ) : (
            <div
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: `1px solid ${theme.panelBorder}`,
                backgroundColor: theme.panel,
                color: theme.accent,
                fontSize: 24,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}
            >
              BLTV
            </div>
          )}
          <div
            style={{
              color: theme.secondary,
              fontSize: 20,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              opacity: 0.75,
            }}
          >
            Production Template
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            color: '#E5E7EB',
            fontSize: 18,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: theme.accent,
              boxShadow: `0 0 20px ${theme.accent}`,
              opacity: accentPulse,
            }}
          />
          Live Render
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 164,
          left: 74,
          right: 74,
          bottom: 118,
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.8fr',
          gap: 30,
        }}
      >
        <div
          style={{
            position: 'relative',
            padding: '38px 36px 34px',
            borderRadius: 28,
            backgroundColor: theme.panel,
            border: `1px solid ${theme.panelBorder}`,
            transform: `translateX(${contentX}px)`,
            opacity: interpolate(reveal, [0, 1], [0, 1]),
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 999,
              backgroundColor: theme.accentSoft,
              color: theme.accent,
              fontSize: 18,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: theme.accent,
              }}
            />
            BLTV 16:9
          </div>

          <div
            style={{
              color: '#F8FAFC',
              fontSize: 88,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              textTransform: 'uppercase',
              maxWidth: '92%',
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 24,
              maxWidth: '80%',
              color: theme.secondary,
              fontSize: 28,
              lineHeight: 1.4,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.82,
            }}
          >
            {subtitle}
          </div>

          <div
            style={{
              position: 'absolute',
              left: 36,
              right: 36,
              bottom: 38,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            {['Narrative', 'Voice Lane', 'Publish Ready'].map((label, idx) => (
              <div
                key={label}
                style={{
                  borderRadius: 18,
                  border: `1px solid ${theme.panelBorder}`,
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  padding: '16px 18px',
                }}
              >
                <div
                  style={{
                    color: theme.accent,
                    fontSize: 15,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    color: '#F8FAFC',
                    fontSize: 22,
                    lineHeight: 1.2,
                  }}
                >
                  {idx === 0 ? 'Script staged' : idx === 1 ? (audioUrl ? 'Audio attached' : 'Text-first mode') : 'YT-safe frame'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            padding: '32px 30px',
            borderRadius: 28,
            backgroundColor: 'rgba(7, 10, 18, 0.95)',
            border: `1px solid ${theme.panelBorder}`,
            transform: `translateX(${transcriptX}px)`,
            opacity: interpolate(reveal, [0, 1], [0, 1]),
          }}
        >
          <div
            style={{
              color: theme.secondary,
              fontSize: 18,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              opacity: 0.72,
              marginBottom: 20,
            }}
          >
            Transcript Window
          </div>

          <div
            style={{
              color: '#F8FAFC',
              fontSize: 34,
              lineHeight: 1.26,
              minHeight: 330,
            }}
          >
            {transcriptPreview}
          </div>

          <Sequence from={12}>
            <div
              style={{
                position: 'absolute',
                left: 30,
                right: 30,
                bottom: 126,
                height: 130,
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
              }}
            >
              {Array.from({ length: 24 }).map((_, idx) => {
                const barHeight = 24 + Math.max(0, Math.sin((frame + idx * 3) / 7)) * (38 + (idx % 5) * 8);
                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      height: barHeight,
                      borderRadius: 999,
                      background: `linear-gradient(180deg, ${theme.accent} 0%, rgba(255,255,255,0.18) 100%)`,
                      opacity: 0.42 + ((idx % 6) * 0.08),
                    }}
                  />
                );
              })}
            </div>
          </Sequence>

          <div
            style={{
              position: 'absolute',
              left: 30,
              right: 30,
              bottom: 44,
              borderTop: `1px solid ${theme.panelBorder}`,
              paddingTop: 18,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: theme.secondary,
              fontSize: 18,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            <span>{watermarkText}</span>
            <span>{audioUrl ? 'Audio Synced' : 'Visual Pass'}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 74,
          bottom: 58,
          width: width * 0.72,
          height: 8,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: progressWidth,
            height: '100%',
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.accent} 0%, #38BDF8 100%)`,
          }}
        />
      </div>

      {audioUrl ? <Audio src={audioUrl} /> : null}
    </AbsoluteFill>
  );
};
