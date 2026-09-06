import React from 'react';
import PocketPortal from './PocketPortal';
import PocketApprovals from './PocketApprovals';
import PocketVoice from './PocketVoice';
import PocketCueSheet from './PocketCueSheet';
import PocketCapture from './PocketCapture';

export {
  PocketPortal,
  PocketApprovals,
  PocketVoice,
  PocketCueSheet,
  PocketCapture,
};

export default function PocketModule(props) {
  return <PocketPortal {...props} />;
}
