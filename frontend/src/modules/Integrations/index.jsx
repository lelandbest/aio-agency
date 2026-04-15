import React from 'react';
import ActiveIntegrations from './pages/ActiveIntegrations';

/**
 * Integrations Module
 * Main entry point for the Integrations module
 */
export const Integrations = ({ initialCategory, initialProvider }) => {
  return <ActiveIntegrations initialCategory={initialCategory} initialProvider={initialProvider} />;
};

export default Integrations;

