/**
 * Brand Icon Mappings
 * Maps provider IDs to icon components and branding information
 */

import React from 'react';

/**
 * Simple SVG icon components for providers
 * These are fallbacks when CDN logos aren't available
 */
export const getBrandIcon = (providerId, size = 48) => {
  const icons = {
    zapier: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#FF4F00" width="48" height="48" rx="8" />
        <path d="M12 24L24 12L36 24L24 36Z" fill="white" />
      </svg>
    ),
    make: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#1D1D1D" width="48" height="48" rx="8" />
        <text x="50%" y="50%" fontSize="28" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
          M
        </text>
      </svg>
    ),
    google: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#4285F4" width="48" height="48" rx="8" />
        <text x="50%" y="50%" fontSize="24" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
          G
        </text>
      </svg>
    ),
    microsoft: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#00A4EF" width="24" height="24" />
        <rect fill="#7FBA00" x="24" y="0" width="24" height="24" />
        <rect fill="#FFB900" x="0" y="24" width="24" height="24" />
        <rect fill="#F25022" x="24" y="24" width="24" height="24" />
      </svg>
    ),
    aws: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#FF9900" width="48" height="48" rx="8" />
        <text x="50%" y="50%" fontSize="20" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
          AWS
        </text>
      </svg>
    ),
    sendgrid: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#1A1A1A" width="48" height="48" rx="8" />
        <circle cx="24" cy="24" r="12" fill="#00D9FF" />
      </svg>
    ),
    mailgun: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#EA6B5E" width="48" height="48" rx="8" />
        <path d="M12 16L24 24L36 16" stroke="white" strokeWidth="2" fill="none" />
        <path d="M12 16H36V32H12Z" stroke="white" strokeWidth="2" fill="none" />
      </svg>
    ),
    email: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#4A90E2" width="48" height="48" rx="8" />
        <path d="M12 16H36V32H12Z" stroke="white" strokeWidth="2" fill="none" />
        <path d="M12 16L24 24L36 16" stroke="white" strokeWidth="2" fill="none" />
      </svg>
    ),
    openai: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#10A37F" width="48" height="48" rx="8" />
        <circle cx="24" cy="24" r="10" fill="white" />
        <path d="M24 14V34M14 24H34" stroke="#10A37F" strokeWidth="2" />
      </svg>
    ),
    anthropic: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#8B5CF6" width="48" height="48" rx="8" />
        <path d="M24 12L36 32H12Z" fill="white" />
      </svg>
    ),
    cohere: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#1F2937" width="48" height="48" rx="8" />
        <circle cx="24" cy="24" r="8" fill="#60A5FA" />
      </svg>
    ),
    twilio: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#F22F46" width="48" height="48" rx="8" />
        <circle cx="16" cy="24" r="4" fill="white" />
        <circle cx="24" cy="24" r="4" fill="white" />
        <circle cx="32" cy="24" r="4" fill="white" />
      </svg>
    ),
    plivo: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#00B8E1" width="48" height="48" rx="8" />
        <text x="50%" y="50%" fontSize="24" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
          P
        </text>
      </svg>
    ),
    sms: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#34C759" width="48" height="48" rx="8" />
        <path d="M12 14H36C37.1 14 38 14.9 38 16V32C38 33.1 37.1 34 36 34H12C10.9 34 10 33.1 10 32V16C10 14.9 10.9 14 12 14Z" fill="white" />
        <path d="M24 24L12 16V32L24 24" fill="#34C759" />
      </svg>
    ),
    facebook: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#1877F2" width="48" height="48" rx="8" />
        <path d="M20 14H24V20H28V24H24V36H20V24H16V20H20V14Z" fill="white" />
      </svg>
    ),
  };

  return icons[providerId] || <DefaultIcon size={size} />;
};

/**
 * Default icon for unknown providers
 */
const DefaultIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <rect fill="#9CA3AF" width="48" height="48" rx="8" />
    <circle cx="24" cy="18" r="4" fill="white" />
    <path d="M16 32C16 27.58 19.58 24 24 24C28.42 24 32 27.58 32 32" stroke="white" strokeWidth="2" fill="none" />
  </svg>
);

/**
 * Get brand colors for providers
 */
export const getBrandColors = (providerId) => {
  const colors = {
    zapier: { primary: '#FF4F00', secondary: '#FFE5CC' },
    make: { primary: '#1D1D1D', secondary: '#F0F0F0' },
    google: { primary: '#4285F4', secondary: '#E8F0FE' },
    microsoft: { primary: '#00A4EF', secondary: '#E3F2FD' },
    aws: { primary: '#FF9900', secondary: '#FFF3E0' },
    sendgrid: { primary: '#1A1A1A', secondary: '#E0F2F1' },
    mailgun: { primary: '#EA6B5E', secondary: '#FFEBEE' },
    openai: { primary: '#10A37F', secondary: '#E0F2F1' },
    anthropic: { primary: '#8B5CF6', secondary: '#F3E8FF' },
    cohere: { primary: '#1F2937', secondary: '#F3F4F6' },
    twilio: { primary: '#F22F46', secondary: '#FFE5E5' },
    plivo: { primary: '#00B8E1', secondary: '#E0F7FA' },
    sms: { primary: '#34C759', secondary: '#E8F5E9' },
    facebook: { primary: '#1877F2', secondary: '#E3F2FD' },
  };

  return colors[providerId] || { primary: '#9CA3AF', secondary: '#F3F4F6' };
};

/**
 * Get provider display name
 */
export const getProviderDisplayName = (providerId) => {
  const names = {
    zapier: 'Zapier',
    make: 'Make',
    google: 'Google',
    google_calendar: 'Google Calendar',
    google_ai: 'Google AI',
    microsoft: 'Microsoft',
    ms_365: 'Microsoft 365',
    aws: 'AWS',
    aws_ses: 'AWS SES',
    sendgrid: 'SendGrid',
    mailgun: 'Mailgun',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    cohere: 'Cohere',
    twilio: 'Twilio',
    plivo: 'Plivo',
    sms_everyone: 'SMS Everyone',
    facebook: 'Facebook',
    fb_pixel: 'Facebook Pixel',
  };

  return names[providerId] || 'Unknown Provider';
};

