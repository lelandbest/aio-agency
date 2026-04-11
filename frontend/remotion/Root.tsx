import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition } from './Composition';
import { AudiogramComposition } from './AudiogramComposition';
import { BLTVLandscapeComposition } from './BLTVLandscapeComposition';
import { REMOTION_TEMPLATES } from './registry';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 
        Dynamically register all templates from the registry. 
        Note: We explicitly import and map components for now to keep it type-safe 
        and preserve simple bundling logic.
      */}
      {Object.values(REMOTION_TEMPLATES).map((tpl) => {
        // Map compositionId to the actual implementation component
        let Component: React.FC<any> = VideoComposition;
        
        if (tpl.compositionId === 'VideoComposition') {
          Component = VideoComposition;
        } else if (tpl.compositionId === 'AudiogramComposition') {
          Component = AudiogramComposition;
        } else if (tpl.compositionId === 'BLTVLandscapeComposition') {
          Component = BLTVLandscapeComposition;
        }

        return (
          <Composition
            key={tpl.templateId}
            id={tpl.compositionId}
            component={Component}
            durationInFrames={tpl.durationInFrames}
            fps={tpl.fps}
            width={tpl.width}
            height={tpl.height}
            defaultProps={{
              title: "AIO OPERATIONS",
              subtitle: "THIN-AIR RENDER ACTIVE",
              themeVariant: 'dark',
              watermarkText: "AIO CORE",
            }}
          />
        );
      })}
    </>
  );
};
