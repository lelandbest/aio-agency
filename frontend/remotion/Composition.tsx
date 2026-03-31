import React from 'react';
import { AbsoluteFill, Audio, Title } from 'remotion';

export const VideoComposition: React.FC<{
  title?: string;
  audioUrl?: string;
  transcript?: string;
  branding?: any;
}> = ({ title, audioUrl }) => {

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' }}>
      {title && (
        <h1 style={{ color: 'white', fontSize: 80, fontFamily: 'sans-serif', textAlign: 'center', margin: 40 }}>
          {title}
        </h1>
      )}
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
};
