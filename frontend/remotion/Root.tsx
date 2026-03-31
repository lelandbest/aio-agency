import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition } from './Composition';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VideoComposition"
        component={VideoComposition}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: "Result Video",
          audioUrl: "",
        }}
      />
    </>
  );
};
